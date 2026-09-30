const { chromium } = require('playwright');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration (roll can be overridden: node automation.js 237Z1A05A5)
const ROLL_NUMBER = process.argv[2] || process.env.ROLL_NUMBER || '237Z1A0599';
const BASE_URL = 'https://nnrg.beessoftware.cloud/studentselfservice';

// Create screenshots / raw HTML / logs directories
const screenshotDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}
const rawDir = path.join(__dirname, 'raw_pages');
if (!fs.existsSync(rawDir)) {
  fs.mkdirSync(rawDir, { recursive: true });
}
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// One log file per run: logs/run_<timestamp>.log
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_FILE = path.join(logsDir, `run_${RUN_ID}.log`);

function logLine(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.log(msg);
}

// Function to take screenshot with timestamp
function takeScreenshot(page, stepName) {
  const filename = path.join(screenshotDir, `${stepName}_${RUN_ID}.png`);
  return page.screenshot({ path: filename });
}

// Save full page HTML for a step: raw_pages/<step>_<RUN_ID>.html
async function saveRaw(page, stepName) {
  try {
    const html = await page.content();
    const file = path.join(rawDir, `${stepName}_${RUN_ID}.html`);
    fs.writeFileSync(file, html);
    console.log(`📝 Raw HTML saved: ${stepName}`);
    logLine(`RAW saved: ${stepName} (${html.length} chars) -> ${path.basename(file)}`);
  } catch (e) {
    logLine(`RAW failed for ${stepName}: ${e.message}`);
  }
}

// Log every request / response / failure + page console errors.
// Response bodies are captured only for the login API endpoints
// (full JSON), others log status + url only to keep the log small.
function attachNetworkLogging(page) {
  const API_HINTS = ['ValidateCaptcha', 'ForgotpasswordClickFunctionality', 'GetOTPFunctionality', 'Forgotpassword', 'GetCaptcha', 'Login'];

  page.on('request', (req) => {
    try {
      const url = req.url();
      if (!url.includes('beessoftware')) return; // skip CDN noise
      let msg = `REQ ${req.method()} ${url}`;
      const post = req.postData();
      if (post) msg += ` | post=${post.slice(0, 500)}`;
      logLine(msg);
    } catch { /* ignore */ }
  });

  page.on('response', (res) => {
    try {
      const url = res.url();
      if (!url.includes('beessoftware')) return;
      const status = res.status();
      const isApi = API_HINTS.some((h) => url.includes(h));
      if (isApi) {
        res.text().then((body) => {
          logLine(`RES ${status} ${url} | body=${body.slice(0, 2000)}`);
        }).catch((e) => {
          logLine(`RES ${status} ${url} | (body unreadable: ${e.message})`);
        });
      } else {
        logLine(`RES ${status} ${url}`);
      }
    } catch { /* ignore */ }
  });

  page.on('requestfailed', (req) => {
    try {
      const url = req.url();
      if (!url.includes('beessoftware')) return;
      logLine(`FAILED ${req.method()} ${url} | ${req.failure()?.errorText || 'unknown'}`);
    } catch { /* ignore */ }
  });

  page.on('console', (msg) => {
    try {
      if (msg.type() === 'error') logLine(`PAGE-CONSOLE-ERROR: ${msg.text().slice(0, 500)}`);
    } catch { /* ignore */ }
  });

  page.on('pageerror', (err) => {
    logLine(`PAGE-ERROR: ${(err && err.message ? err.message : String(err)).slice(0, 500)}`);
  });
}

// Function to solve captcha using multi-step Python solver
// (preprocessing variants + ddddocr + majority vote, see captcha_solver_wrapper.py).
// Resolves with the predicted captcha string or rejects.
function solveCaptchaWithPython(imagePath) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, 'captcha_solver_wrapper.py');
    exec(`python3 "${pythonScript}" "${imagePath}"`, (error, stdout, stderr) => {
      // Ignore stderr warnings from onnxruntime; diagnostics go there by design
      const result = (stdout || '').trim().split(/\s+/).pop() || '';

      if (error) {
        console.error(`Error solving captcha: ${error.message}`);
        if (stderr) console.error(stderr.trim().split('\n').slice(-3).join('\n'));
        reject(error);
        return;
      }

      if (result === 'ERROR' || result === '') {
        reject(new Error('Failed to solve captcha'));
        return;
      }

      // Sanity: expected 6 chars A-Z0-9 (accept 5-char predictions too,
      // server will reject if wrong and we retry with a fresh image)
      if (!/^[A-Z0-9]{4,7}$/.test(result)) {
        reject(new Error(`Implausible captcha prediction: ${result}`));
        return;
      }

      console.log(`✅ Captcha solution: ${result}`);
      resolve(result);
    });
  });
}

// Read the captcha error label to decide retry vs success
async function getCaptchaError(page) {
  try {
    const el = page.locator('#forgotPasswordCaptchaError');
    if ((await el.count()) === 0) return '';
    return ((await el.innerText()) || '').trim();
  } catch {
    return '';
  }
}

async function isCaptchaCardHidden(page) {
  try {
    const card = page.locator('#ForgotPasswordCaptchaCard');
    if ((await card.count()) === 0) return true;
    return await card.isHidden();
  } catch {
    return false;
  }
}

const STEALTH_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Runs before any page script: strips the standard headless/automation tells.
async function applyStealth(context) {
  await context.addInitScript(() => {
    // navigator.webdriver -> undefined (most common bot check)
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    } catch { /* ignore */ }
    // window.chrome runtime stub
    try {
      if (!window.chrome) window.chrome = { runtime: {} };
    } catch { /* ignore */ }
    // plugins + mimeTypes (headless has 0)
    try {
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5].map(() => ({})),
      });
    } catch { /* ignore */ }
    // languages
    try {
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    } catch { /* ignore */ }
    // permissions.query for notifications (headless denies oddly)
    try {
      const origQuery = window.navigator.permissions?.query;
      if (origQuery) {
        window.navigator.permissions.query = (params) =>
          params?.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : origQuery(params);
      }
    } catch { /* ignore */ }
  });
}

async function runAutomation() {
  // Headed-like launch: hide AutomationControlled blink feature so
  // navigator.webdriver / HeadlessChrome tells don't leak to the site.
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-infobars',
      '--window-size=1366,768',
    ],
  });
  const context = await browser.newContext({
    userAgent: STEALTH_UA,
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    timezoneId: 'Asia/Kolkata',
    hasTouch: false,
    isMobile: false,
    javaScriptEnabled: true,
  });
  await applyStealth(context);
  const page = await context.newPage();
  attachNetworkLogging(page);
  logLine(`RUN START roll=${ROLL_NUMBER} url=${BASE_URL}`);

  try {
    console.log('🚀 Starting automation...');

    // Step 1: Navigate to login page
    console.log('📄 Opening login page...');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await takeScreenshot(page, '01_login_page');
    await saveRaw(page, '01_login_page');
    console.log('📸 Screenshot saved: Login page');

    // Step 2: Enter roll number
    console.log(`📝 Entering roll number: ${ROLL_NUMBER}`);
    await page.fill('#txt_UserName', ROLL_NUMBER);
    await page.waitForTimeout(1000);
    await takeScreenshot(page, '02_roll_number_entered');
    await saveRaw(page, '02_roll_number_entered');
    console.log('📸 Screenshot saved: Roll number entered');

    // Step 3: Click Forgot Password (real id, not generic text match)
    console.log('🔗 Clicking Forgot Password link...');
    await page.click('#lbl_forgotpassword');
    await page.waitForTimeout(3000);
    await takeScreenshot(page, '03_forgot_password_page');
    await saveRaw(page, '03_forgot_password_page');
    console.log('📸 Screenshot saved: Forgot password page');

    // Steps 4-6: Multi-attempt captcha solve + verify loop.
    // The solver itself already does multi-step prediction
    // (7 preprocessing variants + vote). Here we add the outer loop:
    // predict -> submit -> read server verdict -> refresh & retry.
    const MAX_ATTEMPTS = 5;
    const tempCaptchaPath = path.join(__dirname, 'temp_captcha.png');
    let verified = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !verified; attempt++) {
      console.log(`\n🤖 Captcha attempt ${attempt}/${MAX_ATTEMPTS}...`);

      const captchaImage = page.locator('#forgotPasswordCaptchaImage');
      await captchaImage.waitFor({ state: 'visible', timeout: 8000 });

      const captchaSrcBefore = await captchaImage.getAttribute('src');
      await captchaImage.screenshot({ path: tempCaptchaPath });
      console.log(`🔗 Captcha src: ${captchaSrcBefore}`);
      logLine(`CAPTCHA attempt=${attempt} src=${captchaSrcBefore}`);
      await takeScreenshot(page, `04_captcha_page_attempt${attempt}`);
      await saveRaw(page, `04_captcha_page_attempt${attempt}`);

      let solution;
      try {
        solution = await solveCaptchaWithPython(tempCaptchaPath);
        logLine(`CAPTCHA attempt=${attempt} solved=${solution}`);
      } catch (captchaError) {
        console.error(`❌ Solver failed on attempt ${attempt}: ${captchaError.message}`);
        // Refresh to get a cleaner image next round
        await page.click('#refreshForgotPasswordCaptcha');
        await page.waitForTimeout(1200);
        continue;
      }

      // Step 5: Enter solution (solver already returns UPPERCASE)
      console.log('⌨️  Entering captcha solution...');
      await page.fill('#txtForgotPasswordCaptcha', solution);
      await page.waitForTimeout(800);
      await takeScreenshot(page, `05_captcha_entered_attempt${attempt}`);
      await saveRaw(page, `05_captcha_entered_attempt${attempt}`);

      // Step 6: Click Verify and read the SERVER verdict
      // (do not trust the prediction blindly — let the site confirm)
      console.log('✓ Clicking Verify button...');
      await page.click('#btnVerifyForgotPasswordCaptcha');
      await page.waitForTimeout(2500);
      await takeScreenshot(page, `06_after_verification_attempt${attempt}`);
      await saveRaw(page, `06_after_verification_attempt${attempt}`);

      const errText = await getCaptchaError(page);
      const hidden = await isCaptchaCardHidden(page);
      logLine(`VERIFY attempt=${attempt} solution=${solution} cardHidden=${hidden} captchaError="${errText}"`);

      if (hidden && !/invalid/i.test(errText || '')) {
        console.log(`🎉 Captcha accepted on attempt ${attempt}: ${solution}`);
        verified = true;
        break;
      }

      console.log(`⚠️  Attempt ${attempt} rejected (solution=${solution} error="${errText}").`);
      if (attempt < MAX_ATTEMPTS) {
        // Site auto-refreshes the image on "Invalid Captcha", but force
        // a manual refresh too so the next capture is guaranteed fresh.
        try {
          await page.click('#refreshForgotPasswordCaptcha');
        } catch { /* image may already be reloading */ }
        await page.waitForTimeout(1500);
      }
    }

    // Clean up temp file
    if (fs.existsSync(tempCaptchaPath)) {
      fs.unlinkSync(tempCaptchaPath);
    }

    if (!verified) {
      console.error(`❌ Captcha NOT verified after ${MAX_ATTEMPTS} attempts. Stopping (no fake bypass — server would reject it anyway).`);
      logLine(`RUN END result=FAIL verified=false log=${LOG_FILE}`);
    } else {
      console.log('✅ Automation completed successfully!');
      logLine(`RUN END result=OK verified=true log=${LOG_FILE}`);
    }
    
  } catch (error) {
    console.error('❌ Error during automation:', error);
    logLine(`RUN ERROR: ${error && error.message ? error.message : String(error)}`);
  } finally {
    await browser.close();
    console.log('🎯 Automation finished.');
  }
}

// Run the automation
runAutomation();
