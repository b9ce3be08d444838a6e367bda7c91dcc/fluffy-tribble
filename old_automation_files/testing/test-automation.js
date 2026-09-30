const { chromium } = require('playwright');

async function testLogin() {
  // Launch browser in visible mode
  const browser = await chromium.launch({ headless: false, slowMo: 1000 });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the login page
    console.log('Opening login page...');
    await page.goto('https://nnrg.beessoftware.cloud/studentselfservice');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    console.log('Page loaded. You can see the form fields:');
    console.log('- Username field');
    console.log('- Password field');
    console.log('- Login button');
    console.log('- Forgot Password link');
    
    // Keep browser open for 5 seconds so you can see it
    await page.waitForTimeout(5000);
    
    console.log('Test completed!');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Close browser
    await browser.close();
  }
}

testLogin();
