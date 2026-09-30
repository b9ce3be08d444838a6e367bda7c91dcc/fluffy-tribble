/*
 * FAST build — BeeSERP forgot-password + contact-confirm flow.
 * Separate from ../final_automation.js (untouched). Same proven flow,
 * minus the waste identified in the 29.5s trace:
 *   1. smart waits (locator / response) instead of fixed 2-4s sleeps
 *   2. screenshots + raw HTML only on KEY steps (FULL=1 restores all)
 *   3. identical solver call (accuracy untouched)
 *
 * Usage: node final_fast.js [ROLL_NUMBER]   (FULL=1 node final_fast.js ... for full artifacts)
 */
const { chromium } = require('playwright');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROLL_NUMBER = process.argv[2] || process.env.ROLL_NUMBER || '237Z1A05A5';
const BASE_URL = 'https://nnrg.beessoftware.cloud/studentselfservice';
const STEALTH_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MAX_CAPTCHA_ATTEMPTS = 5;
const FULL = process.env.FULL === '1'; // FULL=1 -> screenshot+raw on every step

const screenshotDir = path.join(__dirname, 'screenshots');
const rawDir = path.join(__dirname, 'raw_pages');
const logsDir = path.join(__dirname, 'logs');
for (const d of [screenshotDir, rawDir, logsDir]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_FILE = path.join(logsDir, `fast_${RUN_ID}.log`);

function logLine(msg) {
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  console.log(msg);
}
// key=true steps are always captured; others only with FULL=1
async function shot(page, name, key = false) {
  if (!key && !FULL) return;
  await page.screenshot({ path: path.join(screenshotDir, `${name}_${RUN_ID}.png`) });
  console.log(`📸 ${name}`);
}
async function saveRaw(page, name, key = false) {
  if (!key && !FULL) return;
  try {
    const html = await page.content();
    fs.writeFileSync(path.join(rawDir, `${name}_${RUN_ID}.html`), html);
    logLine(`RAW ${name} (${html.length} chars)`);
  } catch (e) { logLine(`RAW FAILED ${name}: ${e.message}`); }
}
function attachNetworkLogging(page) {
  page.on('response', (res) => {
    try {
      const u = res.url();
      if (!u.includes('beessoftware') || u.includes('GetCaptcha')) return;
      if (/ValidateCaptcha|Forgotpassword|GetOTP|SaveEmailMobile|FirstTimeLogin/i.test(u)) {
        res.text().then((b) => logLine(`RES ${res.status()} ${u} | body=${b.slice(0, 800)}`)).catch(() => {});
      }
    } catch {}
  });
  page.on('pageerror', (e) => logLine(`PAGE-ERROR: ${String((e && e.message) || e).slice(0, 200)}`));
}

function solveCaptcha(imagePath) {
  return new Promise((resolve, reject) => {
    exec(`python3 "${path.join(__dirname, 'captcha_solver_wrapper.py')}" "${imagePath}"`, (err, stdout) => {
      const r = (stdout || '').trim().split(/\s+/).pop() || '';
      if (err || !/^[A-Z0-9]{4,7}$/.test(r)) return reject(err || new Error(`Bad prediction: ${r}`));
      resolve(r);
    });
  });
}

(async () => {
  const t0 = Date.now();
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
  logLine(`FAST RUN START roll=${ROLL_NUMBER} full=${FULL}`);

  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.locator('#txt_UserName').waitFor({ state: 'visible', timeout: 10000 });
    await shot(page, '01_login_page', true); await saveRaw(page, '01_login_page', true);

    await page.fill('#txt_UserName', ROLL_NUMBER);

    await page.click('#lbl_forgotpassword');
    const cap = page.locator('#forgotPasswordCaptchaImage');
    await cap.waitFor({ state: 'visible', timeout: 10000 });

    // captcha retry on server verdict
    let ok = false;
    for (let a = 1; a <= MAX_CAPTCHA_ATTEMPTS && !ok; a++) {
      await cap.screenshot({ path: tmp });
      let sol = '';
      try { sol = await solveCaptcha(tmp); }
      catch (e) {
        logLine(`CAPTCHA attempt ${a} solver failed`);
        await page.click('#refreshForgotPasswordCaptcha').catch(() => {});
        continue;
      }
      await page.fill('#txtForgotPasswordCaptcha', sol);
      // wait for the actual server response instead of a fixed 2.5s sleep
      const [res] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('ValidateCaptcha'), { timeout: 10000 }).catch(() => null),
        page.click('#btnVerifyForgotPasswordCaptcha'),
      ]);
      let body = '';
      try { body = res ? await res.text() : ''; } catch {}
      const invalid = /invalid/i.test(body);
      const hidden = await page.locator('#ForgotPasswordCaptchaCard').isHidden().catch(() => false);
      logLine(`VERIFY attempt ${a} sol=${sol} http=${res ? res.status() : 'timeout'} invalid=${invalid} hidden=${hidden}`);
      await shot(page, `06_after_verification_attempt${a}`, true);
      await saveRaw(page, `06_after_verification_attempt${a}`, true);
      if (!invalid && hidden) { ok = true; logLine(`CAPTCHA ACCEPTED: ${sol}`); break; }
      await page.click('#refreshForgotPasswordCaptcha').catch(() => {});
    }
    if (!ok) throw new Error('Captcha not verified after retries');

    // OTP screen (event-driven wait, no fixed 4s sleep)
    await page.locator('#Otpcard').waitFor({ state: 'visible', timeout: 15000 });
    await shot(page, '07_otp_screen', true); await saveRaw(page, '07_otp_screen', true);

    // email: edit -> same value -> save (wait for real save response)
    await page.click('#edit-email2');
    await page.locator('#txt_email').waitFor({ state: 'visible', timeout: 5000 });
    const emailVal = await page.inputValue('#txt_email').catch(() => '');
    logLine(`EMAIL copied="${emailVal}"`);
    if (emailVal) await page.fill('#txt_email', emailVal);
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('SaveEmailMobile'), { timeout: 10000 }).catch(() => null),
      page.click('#save-email2'),
    ]);
    await shot(page, '10_email_saved', true);

    // YES -> mobile (auto edit mode) -> same value -> save
    await page.locator('#confirmPopup-yes').waitFor({ state: 'visible', timeout: 8000 });
    await page.click('#confirmPopup-yes');
    await page.locator('#save-mobile2').waitFor({ state: 'visible', timeout: 8000 });
    const mobileVal = await page.inputValue('#txt_mobile').catch(() => '');
    logLine(`MOBILE copied="${mobileVal}"`);
    if (mobileVal) await page.fill('#txt_mobile', mobileVal);
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('SaveEmailMobile'), { timeout: 10000 }).catch(() => null),
      page.click('#save-mobile2'),
    ]);
    await shot(page, '15_mobile_saved', true);

    // NO on 2nd popup -> login screen
    try {
      await page.locator('#confirmPopup-no').waitFor({ state: 'visible', timeout: 8000 });
      await page.click('#confirmPopup-no');
      await page.locator('#loginFormMain').waitFor({ state: 'visible', timeout: 10000 });
    } catch (e) { logLine('2nd popup skipped'); }
    await shot(page, '16_final_login_screen', true); await saveRaw(page, '16_final_login_screen', true);
    logLine(`FINAL loginVisible=${await page.locator('#loginFormMain').isVisible().catch(() => false)}`);
    logLine(`RUN END result=OK in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (e) {
    logLine(`RUN ERROR: ${e.message}`);
    try { await shot(page, '99_error', true); await saveRaw(page, '99_error', true); } catch {}
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    await browser.close();
    console.log(`🎯 Done. Log: ${LOG_FILE}`);
  }
})();
