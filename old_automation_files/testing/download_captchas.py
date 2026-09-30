import asyncio
from playwright.async_api import async_playwright
import os

# Create directory for captcha images
os.makedirs('captcha_images', exist_ok=True)

async def download_captchas():
    async with async_playwright() as p:
        # Launch browser
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        try:
            # Navigate to the login page first to establish session
            print("Navigating to login page...")
            await page.goto('https://nnrg.beessoftware.cloud/studentselfservice')
            await page.wait_for_timeout(2000)

            # Download 20 captcha images
            print("Downloading 20 captcha images...")
            for i in range(20):
                try:
                    # Click Forgot Password to get to captcha page
                    if i == 0:
                        await page.click('a:has-text("Forgot Password")')
                        await page.wait_for_timeout(2000)
                    else:
                        # Refresh captcha for subsequent downloads
                        refreshButton = page.locator('#refreshForgotPasswordCaptcha')
                        if await refreshButton.count() > 0:
                            await refreshButton.click()
                            await page.wait_for_timeout(1000)

                    # Get the captcha image
                    captchaImage = page.locator('#forgotPasswordCaptchaImage')
                    if await captchaImage.count() > 0:
                        # Screenshot the captcha image
                        filename = f'captcha_images/captcha_{i+1}.png'
                        await captchaImage.screenshot(path=filename)
                        print(f"Saved: {filename}")
                    else:
                        print(f"Could not find captcha image for iteration {i+1}")

                    # Small delay between downloads
                    await page.wait_for_timeout(500)

                except Exception as e:
                    print(f"Error downloading captcha {i+1}: {e}")

            print("Download complete!")

        except Exception as e:
            print(f"Error during download process: {e}")
        finally:
            await browser.close()

# Run the async function
asyncio.run(download_captchas())
