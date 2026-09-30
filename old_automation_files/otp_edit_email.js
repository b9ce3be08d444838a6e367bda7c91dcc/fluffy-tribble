const { chromium } = require('playwright');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// node otp_edit_email.js [roll]
const ROLL_NUMBER = process.argv[2] || process.env.ROLL_NUMBER || '237Z1A05A5';
const BASE_URL = 'https://nnrg.beessoftware.cloud/studentselfservice';
const STEALTH_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const screenshotDir = path.join(__dirname, 'screenshots');
const rawDir = path.join(__dirname, 'raw_pages');
const logsDir = path.join(__dirname, 'logs');
for (const d of [screenshotDir, rawDir, logsDir]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_FILE = path.join(logsDir, `otp_edit_${RUN_ID}.log`);
function logLine(m) {
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${m}\n`);
  console.log(m);
}
async function shot(page, n) {
  await page.screenshot({ path: path.join(screenshotDir, `${n}_${RUN_ID}.png`) });
}
async function saveRaw(page, n) {
  try {
    const html = await page.content();
    fs.writeFileSync(path.join(rawDir, `${n}_${RUN_ID}.html`), html);
    logLine(`RAW saved: ${n} (${html.length} chars)`);
  } catch (e) { logLine(`RAW failed ${n}: ${e.message}`); }
}
function solve(img) {
  return new Promise((resolve, reject) => {
    exec(`python3 "${path.join(__dirname, 'captcha_solver_wrapper.py')}" "${img}"`, (err, stdout) => {
      const r = (stdout || '').trim().split(/\s+/).pop() || '';
      if (err || r === 'ERROR' || !r) return reject(err || new Error('solve failed'));
      resolve(r);
    });
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1366,768'] });
  const context = await browser.newContext({ userAgent: STEALTH_UA,
    viewport: { width: 1366, height: 768 }, locale: 'en-US', timezoneId: 'Asia/Kolkata' });
  await context.addInitScript(() => {
    try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); } catch {}
    try { if (!window.chrome) window.chrome = { runtime: {} }; } catch {}
    try { Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5].map(() => ({})) }); } catch {}
  });
  const page = await context.newPage();
  page.on('response', (res) => {
    try {
      const u = res.url();
      if (!u.includes('beessoftware')) return;
      if (/ValidateCaptcha|Forgotpassword|GetOTP|SaveEmailMobile|FirstTimeLogin/i.test(u)) {
        res.text().then((b) => logLine(`RES ${res.status()} ${u} | body=${b.slice(0, 1500)}`)).catch(() => {});
      } else { logLine(`RES ${res.status()} ${u}`); }
    } catch {}
  });
  const tmp = path.join(__dirname, 'temp_captcha.png');
  try {
    logLine(`RUN START roll=${ROLL_NUMBER} (otp email-edit flow)`);
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.fill('#txt_UserName', ROLL_NUMBER);
    await page.waitForTimeout(500);
    await page.click('#lbl_forgotpassword');
    await page.waitForTimeout(1500);

    const cap = page.locator('#forgotPasswordCaptchaImage');
    await cap.waitFor({ state: 'visible', timeout: 8000 });
    // Captcha retry loop (max 5): solve -> fill -> verify -> check verdict
    let captchaOk = false;
    for (let attempt = 1; attempt <= 5 && !captchaOk; attempt++) {
      await cap.screenshot({ path: tmp });
      let sol = '';
      try {
        sol = await solve(tmp);
      } catch (e) {
        logLine(`CAPTCHA attempt ${attempt} solver failed: ${e.message}`);
        await page.click('#refreshForgotPasswordCaptcha').catch(() => {});
        await page.waitForTimeout(1200);
        continue;
      }
      logLine(`CAPTCHA attempt ${attempt} solved=${sol}`);
      await page.fill('#txtForgotPasswordCaptcha', sol);
      await page.waitForTimeout(600);
      await page.click('#btnVerifyForgotPasswordCaptcha');
      await page.waitForTimeout(2500);
      const errT = await page.locator('#forgotPasswordCaptchaError').innerText().catch(() => '');
      const hidden = await page.locator('#ForgotPasswordCaptchaCard').isHidden().catch(() => false);
      logLine(`CAPTCHA attempt ${attempt} cardHidden=${hidden} err="${(errT || '').trim()}"`);
      if (hidden && !/invalid/i.test(errT || '')) { captchaOk = true; break; }
      await page.click('#refreshForgotPasswordCaptcha').catch(() => {});
      await page.waitForTimeout(1500);
    }
    if (!captchaOk) throw new Error('Captcha not verified after 5 attempts');

    // ---- STEP 07: OTP screen ----
    await page.locator('#Otpcard').waitFor({ state: 'visible', timeout: 15000 });
    await shot(page, '07_otp_screen');
    await saveRaw(page, '07_otp_screen');
    logLine('STEP 07 otp screen visible');

    // ---- STEP 08: click EDIT (pencil) to enable email ----
    await page.click('#edit-email2');
    await page.waitForTimeout(1000);
    const emailVal = await page.inputValue('#txt_email').catch(() => '');
    const emailDisabled = await page.locator('#txt_email').isDisabled().catch(() => true);
    await shot(page, '08_email_edit_enabled');
    await saveRaw(page, '08_email_edit_enabled');
    logLine(`STEP 08 after EDIT click: emailDisabled=${emailDisabled} emailValue="${emailVal}"`);

    // ---- STEP 09: enter SAME mail again ----
    if (!emailDisabled && emailVal) {
      await page.fill('#txt_email', emailVal);
      await page.waitForTimeout(500);
    }
    await shot(page, '09_email_reentered');
    await saveRaw(page, '09_email_reentered');
    logLine(`STEP 09 re-entered same mail: "${emailVal}"`);

    // ---- STEP 10: click SAVE (✔ right tick) ----
    await page.click('#save-email2');
    await page.waitForTimeout(2500);
    const errMail = await page.locator('#err-email2').innerText().catch(() => '');
    const emailDisabledAfter = await page.locator('#txt_email').isDisabled().catch(() => true);
    await shot(page, '10_email_saved');
    await saveRaw(page, '10_email_saved');
    logLine(`STEP 10 after SAVE click: emailDisabled=${emailDisabledAfter} err-email2="${(errMail || '').trim()}"`);

    console.log(`\nMAIL COPIED: "${emailVal}"`);
    logLine(`RUN END result=OK mail="${emailVal}"`);

    // ---- STEP 11: click YES on "update mobile number as well?" popup ----
    try {
      await page.locator('#confirmPopup-yes').waitFor({ state: 'visible', timeout: 8000 });
      await shot(page, '11_popup_yes_visible');
      await page.click('#confirmPopup-yes');
      await page.waitForTimeout(2000);
      await shot(page, '12_after_yes_popup_closed');
      await saveRaw(page, '12_after_yes_popup_closed');
      logLine('STEP 11 YES clicked on mobile-update popup');
    } catch (e) {
      logLine(`STEP 11 YES-popup not found/skipped: ${e.message}`);
    }

    // ---- STEP 12: mobile is ALREADY in edit mode after YES
    // (edit-mobile2 hides itself, save-mobile2 shows). Only click EDIT if visible.
    const editMobVisible = await page.locator('#edit-mobile2').isVisible().catch(() => false);
    if (editMobVisible) {
      await page.click('#edit-mobile2');
      await page.waitForTimeout(1000);
    } else {
      logLine('STEP 12 mobile already in edit mode (YES auto-enabled it), skipping EDIT click');
    }
    const mobileVal = await page.inputValue('#txt_mobile').catch(() => '');
    const mobileDisabled = await page.locator('#txt_mobile').isDisabled().catch(() => true);
    await shot(page, '13_mobile_edit_enabled');
    await saveRaw(page, '13_mobile_edit_enabled');
    logLine(`STEP 12 after mobile EDIT click: mobileDisabled=${mobileDisabled} mobileValue="${mobileVal}"`);

    // ---- STEP 13: paste SAME mobile again ----
    if (!mobileDisabled && mobileVal) {
      await page.fill('#txt_mobile', mobileVal);
      await page.waitForTimeout(500);
    }
    await shot(page, '14_mobile_reentered');
    await saveRaw(page, '14_mobile_reentered');
    logLine(`STEP 13 re-entered same mobile: "${mobileVal}"`);

    // ---- STEP 14: click SAVE (✔) then expect direct login screen ----
    await page.click('#save-mobile2');
    await page.waitForTimeout(3000);
    const errMob = await page.locator('#err-mobile2').innerText().catch(() => '');
    await shot(page, '15_mobile_saved');
    await saveRaw(page, '15_mobile_saved');
    logLine(`STEP 14 after mobile SAVE click: err-mobile2="${(errMob || '').trim()}"`);
    // ---- STEP 15: dismiss 2nd popup "update the email as well?" with NO ----
    try {
      await page.locator('#confirmPopup-no').waitFor({ state: 'visible', timeout: 8000 });
      await shot(page, '15b_email_popup_visible');
      await page.click('#confirmPopup-no');
      await page.waitForTimeout(3000);
      logLine('STEP 15 NO clicked on email-update popup');
    } catch (e) {
      logLine(`STEP 15 2nd popup not found/skipped: ${e.message}`);
    }
    // final state: should be back on login screen
    await page.waitForTimeout(2000);
    await shot(page, '16_final_login_screen');
    await saveRaw(page, '16_final_login_screen');
    const url2 = page.url();
    const loginVisible2 = await page.locator('#loginFormMain').isVisible().catch(() => false);
    const otpVisible2 = await page.locator('#Otpcard').isVisible().catch(() => false);
    logLine(`STEP 14 final: url=${url2} loginVisible=${loginVisible2} otpVisible=${otpVisible2}`);
    console.log(`\nMOBILE COPIED: "${mobileVal}"`);
  } catch (e) {
    logLine(`RUN ERROR: ${e.message}`);
    try { await shot(page, '99_error'); await saveRaw(page, '99_error'); } catch {}
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    await browser.close();
  }
})();
