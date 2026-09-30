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

const ROLL_NUMBER = process.argv[2] || process.env.ROLL_NUMBER || '237Z1A0575';
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

// TEST-UPDATE mode: derive writable test values from masked display.
//   "ka*********@gmail.com" -> "ka@gmail.com" (strip *)
//   "93******13" -> "93<6 random digits>13" (* -> random 0-9)
// Overrides: NEW_EMAIL=... NEW_MOBILE=...  Preview only: DRY_RUN=1 (no POST)
function deriveTestEmail(raw) {
  const v = (raw || '').trim();
  if (!v || v.includes('<') || /doesn.t exists/i.test(v)) return '';
  const at = v.lastIndexOf('@');
  if (at < 0) return v.replace(/\*/g, '');
  const local = v.slice(0, at).replace(/\*/g, '');
  const domain = v.slice(at + 1).replace(/\*/g, '');
  if (!local || !domain || !domain.includes('.')) return '';
  return `${local}@${domain}`;
}
function deriveTestMobile(raw) {
  const v = (raw || '').trim();
  if (!v || v.includes('<') || /doesn.t exists/i.test(v)) return '';
  let out = '';
  for (const ch of v) out += (ch === '*') ? String(Math.floor(Math.random() * 10)) : ch;
  return out.replace(/\D/g, '');
}
// Direct API save: same endpoint the UI's $.ajax calls, same session cookies.
// Skips edit/fill/click + YES/NO popups (all client-only). Sequential like UI.
async function apiSaveEmailMobile(page, mobile, email) {
  return await page.evaluate(async ({ m, e }) => {
    const body = new URLSearchParams({ Mobile: m, Email: e });
    const r = await fetch('/studentselfservice/Login/Login_SaveEmailMobile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body,
      credentials: 'same-origin',
    });
    const txt = await r.text().catch(() => '');
    return { status: r.status, body: (txt || '').slice(0, 800) };
  }, { m: mobile, e: email });
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

    // email + mobile: TEST-UPDATE via direct API (no edit/fill/click, no YES/NO popups)
    // WARNING: this OVERWRITES the real contact on the server. DRY_RUN=1 previews without POST.
    const DRY_RUN = process.env.DRY_RUN === '1';
    const rawEmail = await page.inputValue('#txt_email').catch(() => '');
    const rawMobile = await page.inputValue('#txt_mobile').catch(() => '');
    const testEmail = process.env.NEW_EMAIL || deriveTestEmail(rawEmail);
    const testMobile = process.env.NEW_MOBILE || deriveTestMobile(rawMobile);
    logLine(`EMAIL raw="${rawEmail}" -> test="${testEmail}"`);
    logLine(`MOBILE raw="${rawMobile}" -> test="${testMobile}" dryRun=${DRY_RUN}`);
    const emailOk = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(testEmail);
    const mobileOk = /^[6-9]\d{9}$/.test(testMobile);
    if (!emailOk) logLine(`EMAIL derived invalid, will skip: "${testEmail}"`);
    if (!mobileOk) logLine(`MOBILE derived invalid, will skip: "${testMobile}"`);
    if (!emailOk && !mobileOk) logLine('Nothing valid to save, just reload');

    if (emailOk) {
      if (DRY_RUN) logLine(`DRY_RUN would POST email: Email=${testEmail}`);
      else {
        const r1 = await apiSaveEmailMobile(page, '', testEmail);
        logLine(`API email save http=${r1.status} body=${r1.body}`);
        if (r1.status !== 200 || !/Successfully Saved/i.test(r1.body)) throw new Error(`Email save failed: ${r1.body}`);
      }
    }
    if (mobileOk) {
      if (DRY_RUN) logLine(`DRY_RUN would POST mobile: Mobile=${testMobile}`);
      else {
        const r2 = await apiSaveEmailMobile(page, testMobile, '');
        logLine(`API mobile save http=${r2.status} body=${r2.body}`);
        if (r2.status !== 200 || !/Successfully Saved/i.test(r2.body)) throw new Error(`Mobile save failed: ${r2.body}`);
      }
    }

    // back to login (UI did window.location.reload() on NO)
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.locator('#loginFormMain').waitFor({ state: 'visible', timeout: 10000 });
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
