#!/usr/bin/env python3
"""
Simple Selenium script to open kasabunikhilgoud.online and click the GitHub link.
This is for legitimate website testing and automation purposes only.
"""

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
import time

def open_portfolio_and_click_github():
    """
    Opens the portfolio website and clicks the GitHub link.
    """
    # Set up Chrome options for headless mode
    chrome_options = Options()
    chrome_options.add_argument("--headless")  # Run in headless mode
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    
    # Initialize the browser with headless options
    driver = webdriver.Chrome(options=chrome_options)
    
    try:
        # Open the website
        print("Opening kasabunikhilgoud.online...")
        driver.get("https://kasabunikhilgoud.online")
        
        # Wait for the page to load
        time.sleep(3)
        
        # Find and click the GitHub link
        # Based on the analysis, GitHub links are present in the footer
        print("Looking for GitHub link...")
        
        # Try multiple selectors to find the GitHub link
        github_selectors = [
            "//a[contains(@href, 'github.com')]",
            "//a[contains(text(), 'GitHub')]",
            "//a[@title='GitHub']",
            "//a[contains(@href, 'KasabuNikhilGoud')]"
        ]
        
        github_link = None
        for selector in github_selectors:
            try:
                github_link = WebDriverWait(driver, 5).until(
                    EC.element_to_be_clickable((By.XPATH, selector))
                )
                if github_link:
                    print(f"Found GitHub link using selector: {selector}")
                    break
            except:
                continue
        
        if github_link:
            print("Clicking GitHub link...")
            github_link.click()
            
            # Wait for the GitHub page to load
            time.sleep(3)
            
            print(f"Successfully navigated to: {driver.current_url}")
            
            # Keep the browser open for a few seconds to see the result
            time.sleep(5)
            
        else:
            print("GitHub link not found. Please check the website structure.")
            print("Current page title:", driver.title)
            
    except Exception as e:
        print(f"An error occurred: {e}")
        
    finally:
        # Close the browser
        print("Closing browser...")
        driver.quit()

if __name__ == "__main__":
    print("Starting GitHub link click automation...")
    print("Note: This script is for legitimate testing purposes only.")
    open_portfolio_and_click_github()
    print("Script completed.")