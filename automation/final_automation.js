/*
 * FINAL automation — BeeSERP Student Self-Service (forgot-password + contact confirm)
 *
 * Full flow for a given roll number:
 *   01 login page -> 02 roll entered -> 03 forgot-password (captcha card)
 *   -> 04 captcha captured -> multi-step solve (7 variants + vote)
 *   -> 05 captcha entered -> 06 verify (retry up to 5, server verdict)
 *   -> 07 OTP screen -> 08 email edit -> 09 same email re-entered
 *   -> 10 email saved -> 11 YES (update mobile too?)
 *   -> 12/13 mobile (auto edit mode) copy + re-enter
 *   -> 14 mobile saved -> 15b NO (update email too?) -> 16 login screen
 *
 * Stealth (anti headless-fingerprint), screenshot + raw HTML + request/
 * response log at EVERY step.
 *
 * Usage: node final_automation.js [ROLL_NUMBER]
 */
const { chromium } = require('playwright');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROLL_NUMBER = process.argv[2] || process.env.ROLL_NUMBER || '237Z1A05A5';
const BASE_URL = 'https://nnrg.beessoftware.cloud/studentselfservice';
const STEALTH_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MAX_CAPTCHA_ATTEMPTS = 5;

// ---------- dirs / logging ----------
const screenshotDir = path.join(__dirname, 'screenshots');
const rawDir = path.join(__dirname, 'raw_pages');
const logsDir = path.join(__dirname, 'logs');
for (const d of [screenshotDir, rawDir, logsDir]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_FILE = path.join(logsDir, `final_${RUN_ID}.log`);

function logLine(msg) {
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  console.log(msg);
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(screenshotDir, `${name}_${RUN_ID}.png`) });
  console.log(`📸 ${name}`);
}
async function saveRaw(page, name) {
  try {
    const html = await page.content();
    fs.writeFileSync(path.join(rawDir, `${name}_${RUN_ID}.html`), html);
    logLine(`RAW ${name} (${html.length} chars)`);
  } catch (e) { logLine(`RAW FAILED ${name}: ${e.message}`); }
}
function attachNetworkLogging(page) {
  page.on('request', (req) => {
    try {
      const u = req.url();
      if (!u.includes('beessoftware')) return;
      let m = `REQ ${req.method()} ${u}`;
      const post = req.postData();
      if (post) m += ` | post=${post.slice(0, 300)}`;
      logLine(m);
    } catch {}
  });
  page.on('response', (res) => {
    try {
      const u = res.url();
      if (!u.includes('beessoftware')) return;
      if (/ValidateCaptcha|Forgotpassword|GetOTP|SaveEmailMobile|FirstTimeLogin/i.test(u)) {
        res.text().then((b) => logLine(`RES ${res.status()} ${u} | body=${b.slice(0, 1500)}`)).catch(() => {});
      } else if (!u.includes('GetCaptcha')) {
        logLine(`RES ${res.status()} ${u}`);
      } else {
        logLine(`RES ${res.status()} ${u} (png)`);
      }
    } catch {}
  });
  page.on('requestfailed', (req) => {
    try {
      if (req.url().includes('beessoftware')) logLine(`FAILED ${req.method()} ${req.url()}`);
    } catch {}
  });
  page.on('pageerror', (e) => logLine(`PAGE-ERROR: ${String((e && e.message) || e).slice(0, 300)}`));
}

// ---------- multi-step captcha solver ----------
function solveCaptcha(imagePath) {
  return new Promise((resolve, reject) => {
    exec(`python3 "${path.join(__dirname, 'captcha_solver_wrapper.py')}" "${imagePath}"`, (err, stdout) => {
      const r = (stdout || '').trim().split(/\s+/).pop() || '';
      if (err || r === 'ERROR' || !/^[A-Z0-9]{4,7}$/.test(r)) {
        return reject(err || new Error(`Bad prediction: ${r}`));
      }
      resolve(r);
    });
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox',
           '--disable-dev-shm-usage', '--window-size=1366,768'] });
  const context = await browser.newContext({ userAgent: STEALTH_UA,
    viewport: { width: 1366, height: 768 }, locale: 'en-US', timezoneId: 'Asia/Kolkata' });
  await context.addInitScript(() => {
    try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); } catch {}
    try { if (!window.chrome) window.chrome = { runtime: {} }; } catch {}
    try { Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5].map(() => ({})) }); } catch {}
    try { Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] }); } catch {}
  });
  const page = await context.newPage();
  attachNetworkLogging(page);
  const tmp = path.join(__dirname, 'temp_captcha.png');
  logLine(`RUN START roll=${ROLL_NUMBER}`);

  try {
    // 01–03: login, roll, forgot
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await shot(page, '01_login_page'); await saveRaw(page, '01_login_page');

    await page.fill('#txt_UserName', ROLL_NUMBER);
    await page.waitForTimeout(500);
    await shot(page, '02_roll_number_entered'); await saveRaw(page, '02_roll_number_entered');

    await page.click('#lbl_forgotpassword');
    await page.waitForTimeout(1500);
    await shot(page, '03_forgot_password_page'); await saveRaw(page, '03_forgot_password_page');

    // 04–06: captcha solve + verify with retry (server verdict decides)
    const cap = page.locator('#forgotPasswordCaptchaImage');
    await cap.waitFor({ state: 'visible', timeout: 8000 });
    let ok = false;
    for (let a = 1; a <= MAX_CAPTCHA_ATTEMPTS && !ok; a++) {
      await cap.screenshot({ path: tmp });
      await shot(page, `04_captcha_page_attempt${a}`);
      let sol = '';
      try { sol = await solveCaptcha(tmp); }
      catch (e) {
        logLine(`CAPTCHA attempt ${a} solver failed: ${e.message}`);
        await page.click('#refreshForgotPasswordCaptcha').catch(() => {});
        await page.waitForTimeout(1200);
        continue;
      }
      logLine(`CAPTCHA attempt ${a} solved=${sol}`);
      await page.fill('#txtForgotPasswordCaptcha', sol);
      await page.waitForTimeout(600);
      await shot(page, `05_captcha_entered_attempt${a}`);
      await page.click('#btnVerifyForgotPasswordCaptcha');
      await page.waitForTimeout(2500);
      const errT = await page.locator('#forgotPasswordCaptchaError').innerText().catch(() => '');
      const hidden = await page.locator('#ForgotPasswordCaptchaCard').isHidden().catch(() => false);
      logLine(`VERIFY attempt ${a} cardHidden=${hidden} err="${(errT || '').trim()}"`);
      await shot(page, `06_after_verification_attempt${a}`);
      await saveRaw(page, `06_after_verification_attempt${a}`);
      if (hidden && !/invalid/i.test(errT || '')) { ok = true; logLine(`CAPTCHA ACCEPTED: ${sol}`); break; }
      await page.click('#refreshForgotPasswordCaptcha').catch(() => {});
      await page.waitForTimeout(1500);
    }
    if (!ok) throw new Error('Captcha not verified after retries');

    // 07: OTP screen
    await page.locator('#Otpcard').waitFor({ state: 'visible', timeout: 15000 });
    await shot(page, '07_otp_screen'); await saveRaw(page, '07_otp_screen');

    // 08–10: email edit -> same value -> save
    await page.click('#edit-email2');
    await page.waitForTimeout(1000);
    const emailVal = await page.inputValue('#txt_email').catch(() => '');
    await shot(page, '08_email_edit_enabled'); await saveRaw(page, '08_email_edit_enabled');
    logLine(`EMAIL copied="${emailVal}"`);
    if (emailVal) { await page.fill('#txt_email', emailVal); await page.waitForTimeout(500); }
    await shot(page, '09_email_reentered'); await saveRaw(page, '09_email_reentered');
    await page.click('#save-email2');
    await page.waitForTimeout(2500);
    await shot(page, '10_email_saved'); await saveRaw(page, '10_email_saved');
    logLine(`EMAIL saved, err="${(await page.locator('#err-email2').innerText().catch(() => '')).trim()}"`);

    // 11–14: YES -> mobile (auto edit mode) -> same value -> save
    await page.locator('#confirmPopup-yes').waitFor({ state: 'visible', timeout: 8000 });
    await shot(page, '11_popup_yes_visible');
    await page.click('#confirmPopup-yes');
    await page.waitForTimeout(2000);
    await shot(page, '12_after_yes_popup_closed'); await saveRaw(page, '12_after_yes_popup_closed');
    if (await page.locator('#edit-mobile2').isVisible().catch(() => false)) {
      await page.click('#edit-mobile2');
      await page.waitForTimeout(1000);
    } else { logLine('Mobile already in edit mode, skipping EDIT click'); }
    const mobileVal = await page.inputValue('#txt_mobile').catch(() => '');
    await shot(page, '13_mobile_edit_enabled'); await saveRaw(page, '13_mobile_edit_enabled');
    logLine(`MOBILE copied="${mobileVal}"`);
    if (mobileVal) { await page.fill('#txt_mobile', mobileVal); await page.waitForTimeout(500); }
    await shot(page, '14_mobile_reentered'); await saveRaw(page, '14_mobile_reentered');
    await page.click('#save-mobile2');
    await page.waitForTimeout(3000);
    await shot(page, '15_mobile_saved'); await saveRaw(page, '15_mobile_saved');
    logLine(`MOBILE saved, err="${(await page.locator('#err-mobile2').innerText().catch(() => '')).trim()}"`);

    // 15b–16: NO on 2nd popup -> back to login
    try {
      await page.locator('#confirmPopup-no').waitFor({ state: 'visible', timeout: 8000 });
      await shot(page, '15b_email_popup_visible');
      await page.click('#confirmPopup-no');
      await page.waitForTimeout(3000);
      logLine('2nd popup dismissed with NO');
    } catch (e) { logLine('2nd popup skipped (not shown)'); }
    await page.waitForTimeout(2000);
    await shot(page, '16_final_login_screen'); await saveRaw(page, '16_final_login_screen');
    logLine(`FINAL loginVisible=${await page.locator('#loginFormMain').isVisible().catch(() => false)} otpVisible=${await page.locator('#Otpcard').isVisible().catch(() => false)}`);
    logLine('RUN END result=OK');
  } catch (e) {
    logLine(`RUN ERROR: ${e.message}`);
    try { await shot(page, '99_error'); await saveRaw(page, '99_error'); } catch {}
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    await browser.close();
    console.log(`🎯 Done. Log: ${LOG_FILE}`);
  }
})();
