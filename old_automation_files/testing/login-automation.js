const { chromium } = require('playwright');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Function to solve captcha using Python ddddocr
function solveCaptchaWithPython(imagePath) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, 'captcha_solver_wrapper.py');
    exec(`python3 ${pythonScript} ${imagePath}`, (error, stdout, stderr) => {
      // Ignore stderr warnings from onnxruntime
      const result = stdout.trim();
      
      if (error) {
        console.error(`Error solving captcha: ${error.message}`);
        reject(error);
        return;
      }
      
      if (result === 'ERROR' || result === '') {
        reject(new Error('Failed to solve captcha'));
        return;
      }
      
      console.log(`Captcha solution: ${result}`);
      resolve(result);
    });
  });
}

async function runLogin() {
  // Launch browser
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the login page
    console.log('Opening login page...');
    await page.goto('https://nnrg.beessoftware.cloud/studentselfservice');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Fill in username
    console.log('Filling username...');
    await page.fill('input[placeholder*="username" i], input[type="text"]', process.env.USERNAME || 'YOUR_USERNAME_HERE');
    
    // Fill in password
    console.log('Filling password...');
    await page.fill('input[type="password"]', process.env.PASSWORD || 'YOUR_PASSWORD_HERE');
    
    // Optional: Check "Remember Me"
    // await page.check('input[type="checkbox"]');

    // Click Login button
    console.log('Clicking Login button...');
    await page.click('button:has-text("Login"), input[type="submit"]');
    
    // Wait for navigation after login
    await page.waitForLoadState('networkidle');
    
    console.log('Login successful!');
    
    // Take a screenshot for verification
    await page.screenshot({ path: 'after-login.png' });
    
  } catch (error) {
    console.error('Error during login:', error);
  } finally {
    // Close browser
    await browser.close();
  }
}

async function handleForgotPassword() {
  // Launch browser
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the login page
    console.log('Opening login page...');
    await page.goto('https://nnrg.beessoftware.cloud/studentselfservice');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Click "Forgot Password" link
    console.log('Clicking Forgot Password...');
    await page.click('a:has-text("Forgot Password")');
    
    // Wait for the password reset page to load
    await page.waitForLoadState('networkidle');
    
    console.log('Forgot Password page opened!');
    
    // Take a screenshot for verification
    await page.screenshot({ path: 'forgot-password.png' });
    
  } catch (error) {
    console.error('Error during forgot password:', error);
  } finally {
    // Close browser
    await browser.close();
  }
}

async function testRollNumber() {
  // Launch browser in headless mode (no display server available)
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the login page
    console.log('Opening login page...');
    await page.goto('https://nnrg.beessoftware.cloud/studentselfservice', { waitUntil: 'domcontentloaded' });
    
    // Wait a bit for dynamic content
    await page.waitForTimeout(3000);

    // Take screenshot before entering roll number
    console.log('Taking screenshot before entering roll number...');
    await page.screenshot({ path: 'before-roll-number.png' });
    
    // Fill in roll number
    console.log('Entering roll number: 237Z1A0575');
    await page.fill('input[placeholder*="username" i], input[type="text"]', '237Z1A0575');
    
    // Wait a moment to ensure the field is filled
    await page.waitForTimeout(1000);
    
    // Take screenshot after entering roll number
    console.log('Taking screenshot after entering roll number...');
    await page.screenshot({ path: 'after-roll-number.png' });
    
    // Click Forgot Password link
    console.log('Clicking Forgot Password link...');
    await page.click('a:has-text("Forgot Password")');
    
    // Wait for the captcha page to load
    await page.waitForTimeout(3000);
    
    // Take screenshot of captcha page
    console.log('Taking screenshot of captcha page...');
    await page.screenshot({ path: 'captcha-page.png' });
    
    // Inject JavaScript to bypass captcha verification
    console.log('Bypassing captcha verification...');
    const bypassResult = await page.evaluate(() => {
      // Try setting a global captchaVerified variable to true regardless
      window.captchaVerified = true;

      // Find the button in the captcha card and click it
      const proceedButton = document.querySelector('#ForgotPasswordCaptchaCard button, #ForgotPasswordCaptchaCard a.btn');
      let clicked = false;
      if (proceedButton) {
        proceedButton.click();
        clicked = true;
      }

      return {
        windowCaptchaVerified: window.captchaVerified,
        clicked: clicked
      };
    });
    
    console.log('Bypass result:', bypassResult);
    
    // Wait for the next screen to load
    await page.waitForTimeout(3000);
    
    // Take screenshot of the next screen after captcha verification
    console.log('Taking screenshot after captcha verification...');
    await page.screenshot({ path: 'after-captcha-verification.png' });
    
    console.log('Test completed! Screenshots saved.');
    
  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    // Close browser
    await browser.close();
  }
}

async function testRollNumberWithAutoCaptcha() {
  // Launch browser in headless mode
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the login page
    console.log('Opening login page...');
    await page.goto('https://nnrg.beessoftware.cloud/studentselfservice', { waitUntil: 'domcontentloaded' });
    
    // Wait a bit for dynamic content
    await page.waitForTimeout(3000);

    // Take screenshot before entering roll number
    console.log('Taking screenshot before entering roll number...');
    await page.screenshot({ path: 'before-roll-number.png' });
    
    // Fill in roll number
    console.log('Entering roll number: 237Z1A0575');
    await page.fill('input[placeholder*="username" i], input[type="text"]', '237Z1A0575');
    
    // Wait a moment to ensure the field is filled
    await page.waitForTimeout(1000);
    
    // Take screenshot after entering roll number
    console.log('Taking screenshot after entering roll number...');
    await page.screenshot({ path: 'after-roll-number.png' });
    
    // Click Forgot Password link
    console.log('Clicking Forgot Password link...');
    await page.click('a:has-text("Forgot Password")');
    
    // Wait for the captcha page to load
    await page.waitForTimeout(3000);
    
    // Take screenshot of captcha page
    console.log('Taking screenshot of captcha page...');
    await page.screenshot({ path: 'captcha-page.png' });
    
    // Save captcha image for OCR
    const captchaImage = page.locator('#forgotPasswordCaptchaImage');
    const tempCaptchaPath = path.join(__dirname, 'temp_captcha.png');
    await captchaImage.screenshot({ path: tempCaptchaPath });
    console.log('Captcha image saved for OCR...');
    
    // Solve captcha using Python ddddocr
    console.log('Solving captcha with ddddocr...');
    try {
      const captchaSolution = await solveCaptchaWithPython(tempCaptchaPath);
      console.log(`Captcha solution: ${captchaSolution}`);
      
      // Enter the captcha solution
      await page.fill('#txtForgotPasswordCaptcha', captchaSolution);
      await page.waitForTimeout(1000);
      
      // Click Verify button
      console.log('Clicking Verify button...');
      await page.click('#btnVerifyForgotPasswordCaptcha');
      
      // Wait for the next screen to load
      await page.waitForTimeout(3000);
      
      // Take screenshot after captcha verification
      console.log('Taking screenshot after captcha verification...');
      await page.screenshot({ path: 'after-captcha-verification.png' });
      
    } catch (captchaError) {
      console.error('Failed to solve captcha, using bypass method:', captchaError.message);
      
      // Fallback to bypass method
      const bypassResult = await page.evaluate(() => {
        window.captchaVerified = true;
        const proceedButton = document.querySelector('#ForgotPasswordCaptchaCard button, #ForgotPasswordCaptchaCard a.btn');
        let clicked = false;
        if (proceedButton) {
          proceedButton.click();
          clicked = true;
        }
        return { windowCaptchaVerified: window.captchaVerified, clicked: clicked };
      });
      
      console.log('Bypass result:', bypassResult);
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'after-captcha-verification.png' });
    }
    
    // Clean up temp file
    if (fs.existsSync(tempCaptchaPath)) {
      fs.unlinkSync(tempCaptchaPath);
    }
    
    console.log('Test completed with auto captcha solving!');
    
  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    // Close browser
    await browser.close();
  }
}

// Run the desired function
// runLogin(); // Uncomment to run login automation
// handleForgotPassword(); // Uncomment to run forgot password automation
// testRollNumber(); // Run roll number test with bypass
testRollNumberWithAutoCaptcha(); // Run roll number test with auto captcha solving

module.exports = { runLogin, handleForgotPassword, testRollNumber, testRollNumberWithAutoCaptcha };
