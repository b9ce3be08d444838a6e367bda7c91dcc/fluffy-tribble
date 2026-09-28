#!/usr/bin/env python3
"""
Script to open and analyze the NNRG website structure.
This is for legitimate website analysis and testing purposes only.
"""

import requests
from bs4 import BeautifulSoup

LOGIN_URL = "https://nnrg.beessoftware.cloud/CloudilyaUnited"
DEFAULT_USERNAME = "username1"
DEFAULT_PASSWORD = "password@123"


def login_with_browser(username=DEFAULT_USERNAME, password=DEFAULT_PASSWORD, headless=False, quit_on_fail=True):
    """
    Step 1: open site
    Step 2: find #txt_UserName and enter username
    Step 3: find #txt_Password and enter password
    Step 4: click #btn_Login
    Returns: webdriver.Chrome driver on success (for BeautifulSoup/requests reuse), else None.
    Requires: pip install selenium + chromedriver in PATH.
    """
    try:
        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
    except ImportError:
        print("❌ selenium not installed. Run: pip install selenium")
        return None

    options = webdriver.ChromeOptions()
    if headless:
        options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")

    driver = webdriver.Chrome(options=options)
    try:
        # 1. Open
        print(f"Opening {LOGIN_URL}...")
        driver.get(LOGIN_URL)

        wait = WebDriverWait(driver, 20)

        # 2. Find username wrapper/input and enter username
        # <div class="beeserp-input-wrapper"><input id="txt_UserName" ...></div>
        username_input = wait.until(
            EC.presence_of_element_located((By.ID, "txt_UserName"))
        )
        print("✅ Found username field: #txt_UserName")
        username_input.clear()
        username_input.send_keys(username)
        print(f"✅ Entered username: {username}")

        # 3. Find password field and enter password
        # <div class="beeserp-input-wrapper"><input id="txt_Password" type="password"></div>
        password_input = wait.until(
            EC.presence_of_element_located((By.ID, "txt_Password"))
        )
        print("✅ Found password field: #txt_Password")
        password_input.clear()
        password_input.send_keys(password)
        print("✅ Entered password: **********")

        # 4. Click login button
        # <button type="submit" id="btn_Login" class="beeserp-login-btn">
        login_btn = wait.until(
            EC.element_to_be_clickable((By.ID, "btn_Login"))
        )
        print("✅ Found login button: #btn_Login - clicking...")
        login_btn.click()

        # 5. Wait for navigation / result
        try:
            wait.until(lambda d: d.current_url != LOGIN_URL or d.find_elements(By.ID, "Otpcard"))
        except Exception:
            pass  # stay on login page on bad creds - still return driver for parsing
        print(f"➡️ After click URL: {driver.current_url}")
        print(f"📝 Title: {driver.title}")
        return driver
    except Exception as e:
        print(f"❌ Login automation failed: {e}")
        if quit_on_fail:
            try:
                driver.quit()
            except Exception:
                pass
        return None


def driver_to_soup(driver):
    """Connection 1: Selenium -> BeautifulSoup. Parse live (JS-rendered) DOM."""
    html = driver.page_source
    print(f"📏 Selenium page_source: {len(html)} bytes")
    return BeautifulSoup(html, "html.parser")


def transfer_selenium_cookies_to_requests(driver, session=None):
    """Connection 2: Selenium -> requests. Copy cookies so requests reuses login session."""
    session = session or requests.Session()
    for c in driver.get_cookies():
        session.cookies.set(c["name"], c["value"], domain=c.get("domain"), path=c.get("path", "/"))
    print(f"🍪 Transferred {len(driver.get_cookies())} cookies to requests.Session")
    return session


def parse_login_dom_with_bs4(soup):
    """Parse the exact snippet you posted with BeautifulSoup after Selenium render."""
    print("\n🔍 BeautifulSoup parse of Selenium DOM:")
    for div in soup.select("div.beeserp-input-wrapper"):
        label = div.find("label").get_text(strip=True) if div.find("label") else "?"
        inp = div.find("input")
        err = div.find("span", class_="text-danger")
        print(f"   - wrapper label='{label}' input id={inp.get('id') if inp else None} "
              f"name={inp.get('name') if inp else None} err='{err.get_text(strip=True) if err else None}'")
    btn = soup.find("button", {"id": "btn_Login"})
    print(f"   - button #btn_Login: '{btn.get_text(strip=True) if btn else 'NOT FOUND'}'")
    token = soup.find("input", {"name": "__RequestVerificationToken"})
    print(f"   - token present: {bool(token)}")
    print(f"   - #Otpcard visible: {bool(soup.find(id='Otpcard'))}")
    return soup


def selenium_login_and_parse(username=DEFAULT_USERNAME, password=DEFAULT_PASSWORD, headless=False):
    """Combined flow: Selenium login -> BeautifulSoup parse -> requests reuse."""
    driver = login_with_browser(username, password, headless=headless, quit_on_fail=True)
    if not driver:
        return None, None, None
    try:
        # Selenium -> BeautifulSoup
        soup = driver_to_soup(driver)
        parse_login_dom_with_bs4(soup)
        # Selenium -> requests
        session = transfer_selenium_cookies_to_requests(driver)
        # Prove requests now carries the session (same cookies, no new login needed)
        try:
            r = session.get(LOGIN_URL, timeout=20)
            print(f"📡 requests with Selenium cookies: {r.status_code}, {len(r.text)} bytes")
        except Exception as e:
            print(f"⚠️ requests reuse failed: {e}")
        return driver, soup, session
    except Exception as e:
        print(f"❌ Combined flow failed: {e}")
        try:
            driver.quit()
        except Exception:
            pass
        return None, None, None

def open_nnrp_website(session=None):
    """
    Opens the NNRG website and displays its structure.
    Pass a requests.Session from transfer_selenium_cookies_to_requests()
    to reuse the Selenium login session.
    """
    try:
        # Open the website
        sess = session or requests
        print("Opening https://nnrg.beessoftware.cloud/CloudilyaUnited...")
        get_kwargs = {"timeout": 20}
        response = sess.get("https://nnrg.beessoftware.cloud/CloudilyaUnited", **get_kwargs)
        
        if response.status_code == 200:
            print(f"✅ Successfully opened website (Status: {response.status_code})")
            print(f"📄 Content Type: {response.headers.get('content-type')}")
            print(f"📏 Content Length: {len(response.text)} bytes")
            
            # Parse the HTML
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Display page title
            if soup.title:
                print(f"📝 Page Title: {soup.title.string}")
            
            # Find the login form
            login_form = soup.find('form', {'id': 'loginFormElement'})
            if login_form:
                print("\n🔐 Login Form Found:")
                print(f"   - Form ID: {login_form.get('id')}")
                print(f"   - Action: {login_form.get('action')}")
                print(f"   - Method: {login_form.get('method')}")
                
                # Find form inputs
                inputs = login_form.find_all('input')
                print(f"   - Number of inputs: {len(inputs)}")
                
                for i, input_field in enumerate(inputs, 1):
                    name = input_field.get('name', 'unnamed')
                    input_type = input_field.get('type', 'text')
                    input_id = input_field.get('id', 'no-id')
                    placeholder = input_field.get('placeholder', '')
                    print(f"   {i}. {name} (type: {input_type}, id: {input_id}, placeholder: {placeholder})")
                
                # Find the submit button
                submit_button = login_form.find('button', {'id': 'btn_Login'})
                if submit_button:
                    print(f"   - Submit Button: {submit_button.get_text(strip=True)}")
                
                # Find anti-forgery token
                anti_forgery = login_form.find('input', {'name': '__RequestVerificationToken'})
                if anti_forgery:
                    token_value = anti_forgery.get('value', '')
                    print(f"   - Anti-Forgery Token: {token_value[:50]}..." if len(token_value) > 50 else f"   - Anti-Forgery Token: {token_value}")
            
            # Find all forms on the page
            all_forms = soup.find_all('form')
            print(f"\n📋 Total Forms Found: {len(all_forms)}")
            
            # Find all links
            links = soup.find_all('a', href=True)
            print(f"🔗 Total Links Found: {len(links)}")
            
            # Display some key links
            print("\n🔗 Key Links:")
            for link in links[:5]:  # Show first 5 links
                href = link['href']
                text = link.get_text(strip=True)[:30]
                print(f"   - {text}: {href}")
                
        else:
            print(f"❌ Failed to open website (Status: {response.status_code})")
            
    except Exception as e:
        print(f"❌ An error occurred: {e}")

def requests_only_login(username=DEFAULT_USERNAME, password=DEFAULT_PASSWORD):
    """
    Requests + BeautifulSoup only (no Selenium):
    1. GET login page with Session
    2. BS4 find #txt_UserName, #txt_Password, #btn_Login
    3. Fill username1 / password@123 and POST (simulate button click)
    4. BS4 parse result -> page behaviour (span_invalid / Otpcard / redirect)
    """
    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0"})
    print(f"Opening {LOGIN_URL} (requests only)...")
    r = session.get(LOGIN_URL, timeout=20)
    print(f"✅ GET {r.status_code}, {len(r.text)} bytes")

    soup = BeautifulSoup(r.text, "html.parser")
    print(f"📝 Title: {soup.title.string if soup.title else None}")

    # 2. Find fields (your snippet)
    u = soup.find("input", {"id": "txt_UserName"})
    p = soup.find("input", {"id": "txt_Password"})
    b = soup.find("button", {"id": "btn_Login"})
    print(f"✅ #txt_UserName found: {bool(u)} name={u.get('name') if u else None}")
    print(f"✅ #txt_Password found: {bool(p)} name={p.get('name') if p else None}")
    print(f"✅ #btn_Login found: {bool(b)} text='{b.get_text(strip=True) if b else None}'")

    form = soup.find("form", {"id": "loginFormElement"})
    token_el = soup.find("input", {"name": "__RequestVerificationToken"})
    token = token_el.get("value", "") if token_el else ""
    print(f"✅ token present: {bool(token)} len={len(token)}")
    print(f"   form action={form.get('action') if form else None} method={form.get('method') if form else None}")

    # 3. Simulate entering values + clicking login.
    # Site JS does: POST /CloudilyaUnited/Login/Login {UserName, Password, RememberMe}
    login_ajax = LOGIN_URL.rstrip("/") + "/Login/Login"
    payload = {"UserName": username, "Password": password, "RememberMe": "false"}
    headers = {"X-Requested-With": "XMLHttpRequest", "Referer": LOGIN_URL}
    if token:
        headers["RequestVerificationToken"] = token
    print(f"➡️ POST {login_ajax} as {username} (simulated #btn_Login click)...")
    try:
        pr = session.post(login_ajax, data=payload, headers=headers, timeout=20)
        print(f"📡 POST status: {pr.status_code}, {len(pr.text)} bytes")
        ctype = pr.headers.get("content-type", "")
        print(f"📄 POST content-type: {ctype}")
        # Try JSON (AJAX) else HTML
        try:
            data = pr.json()
            print(f"📦 JSON response keys: {list(data.keys())}")
            print(f"📦 JSON: {str(data)[:500]}")
        except Exception:
            data = None
            print(f"📄 HTML snippet: {pr.text[:500]!r}")
        # 4. Behaviour with BS4
        post_soup = BeautifulSoup(pr.text, "html.parser") if "html" in ctype else soup
        inv = post_soup.find(id="span_invalid")
        print(f"➡️ span_invalid: {inv.get_text(strip=True)[:200]!r}" if inv else "➡️ span_invalid: not in response")
        if data is not None:
            if data.get("success") is True:
                print(f"✅ Login success -> redirect: {data.get('redirectUrl')}")
            elif data.get("login") == 3:
                print("➡️ 2FA required (login==3), OTP card would show")
            else:
                print(f"❌ Login failed: {data.get('errorMessage') or data.get('message') or data}")
        return session, soup, data if data is not None else pr.text
    except Exception as e:
        print(f"❌ POST failed: {e}")
        return session, soup, None


if __name__ == "__main__":
    print("Starting NNRG website analysis...")
    print("Note: This script is for legitimate website analysis purposes only.")
    # Requests + BeautifulSoup only (no Selenium)
    open_nnrp_website()
    requests_only_login(username="username1", password="password@123")
    print("Analysis completed.")