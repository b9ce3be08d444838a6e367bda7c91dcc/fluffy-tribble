const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Create directory for captcha images
const captchaDir = path.join(__dirname, 'captcha_images');
if (!fs.existsSync(captchaDir)) {
  fs.mkdirSync(captchaDir);
}

async function downloadCaptchas() {
  // Launch browser in headless mode
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the login page first to establish session
    console.log('Navigating to login page...');
    await page.goto('https://nnrg.beessoftware.cloud/studentselfservice', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Download 20 captcha images
    console.log('Downloading 20 captcha images...');
    for (let i = 0; i < 20; i++) {
      try {
        // Click Forgot Password to get to captcha page
        if (i === 0) {
          console.log('Clicking Forgot Password...');
          await page.click('a:has-text("Forgot Password")');
          await page.waitForTimeout(3000);
        } else {
          // Navigate back to login and click forgot password again for fresh captcha
          await page.goto('https://nnrg.beessoftware.cloud/studentselfservice', { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2000);
          await page.click('a:has-text("Forgot Password")');
          await page.waitForTimeout(3000);
        }

        // Take screenshot of the captcha card area
        const captchaCard = page.locator('#ForgotPasswordCaptchaCard');
        if (await captchaCard.count() > 0) {
          const filename = path.join(captchaDir, `captcha_${i + 1}.png`);
          await captchaCard.screenshot({ path: filename });
          console.log(`Saved: ${filename}`);
        } else {
          console.log(`Could not find captcha card for iteration ${i + 1}`);
          // Take full page screenshot as fallback
          const filename = path.join(captchaDir, `captcha_${i + 1}_full.png`);
          await page.screenshot({ path: filename });
          console.log(`Saved full page: ${filename}`);
        }

        // Small delay between downloads
        await page.waitForTimeout(1000);

      } catch (error) {
        console.log(`Error downloading captcha ${i + 1}:`, error.message);
      }
    }

    console.log('Download complete!');

  } catch (error) {
    console.error('Error during download process:', error);
  } finally {
    await browser.close();
  }
}

downloadCaptchas();
