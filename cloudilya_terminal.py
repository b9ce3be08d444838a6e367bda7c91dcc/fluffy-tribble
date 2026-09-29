#!/usr/bin/env python3
"""
Cloudilya - terminal-only client (requests + BeautifulSoup, no Selenium, no APK).
Uses the same backend the Android app "Cloudilya Empower" uses:
  POST {BASE}/Login/Login {UserName, Password, RememberMe}
Handles: success, login==3 (2FA OTP), login==1 (first-time password change), invalid.

Usage:
  python3 cloudilya_terminal.py --base https://nnrg.beessoftware.cloud/CloudilyaUnited
  python3 cloudilya_terminal.py --base https://nnrg.beessoftware.cloud/CloudilyaUnited -u USERNAME
"""
import argparse
import getpass
import sys

import requests
from bs4 import BeautifulSoup


def get_token_and_cookies(session, base):
    r = session.get(base, timeout=20)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    el = soup.find("input", {"name": "__RequestVerificationToken"})
    token = el.get("value", "") if el else ""
    return token, soup, r


def do_login(session, base, token, username, password):
    url = base.rstrip("/") + "/Login/Login"
    headers = {"X-Requested-With": "XMLHttpRequest", "Referer": base}
    if token:
        headers["RequestVerificationToken"] = token
    pr = session.post(
        url,
        data={"UserName": username, "Password": password, "RememberMe": "false"},
        headers=headers,
        timeout=20,
    )
    try:
        return pr.json(), pr
    except Exception:
        return {"_raw": pr.text[:1000], "_status": pr.status_code}, pr


def do_verify_otp(session, base, token, otp, challenge_id, username, password):
    url = base.rstrip("/") + "/Login/Verify2WayOtp"
    headers = {"X-Requested-With": "XMLHttpRequest", "Referer": base}
    if token:
        headers["RequestVerificationToken"] = token
    pr = session.post(
        url,
        data={"otp": otp, "challengeId": challenge_id,
              "username": username, "password": password},
        headers=headers,
        timeout=20,
    )
    try:
        return pr.json(), pr
    except Exception:
        return {"_raw": pr.text[:1000]}, pr


def fetch_authed(session, url):
    r = session.get(url, timeout=20)
    soup = BeautifulSoup(r.text, "html.parser")
    title = soup.title.string.strip() if soup and soup.title and soup.title.string else ""
    print(f"\nGET {url} -> {r.status_code} len={len(r.text)} title={title!r}")
    links = [a.get("href") for a in soup.find_all("a", href=True)][:15]
    for l in links:
        print(f"  link: {l}")
    forms = [(f.get("id"), f.get("action")) for f in soup.find_all("form")][:10]
    for fid, act in forms:
        print(f"  form id={fid} action={act}")
    return r


def main():
    ap = argparse.ArgumentParser(description="Use Cloudilya from terminal (requests-only)")
    ap.add_argument("--base", default="https://nnrg.beessoftware.cloud/CloudilyaUnited",
                    help="Tenant base URL")
    ap.add_argument("-u", "--username", default=None)
    ap.add_argument("-p", "--password", default=None)
    args = ap.parse_args()

    base = args.base.rstrip("/")
    username = args.username or input("UserName: ").strip()
    password = args.password or getpass.getpass("Password: ")

    s = requests.Session()
    s.headers.update({"User-Agent": "Mozilla/5.0 (terminal)"})

    print(f"GET {base} ...")
    try:
        token, soup, r = get_token_and_cookies(s, base)
    except Exception as e:
        print(f"FAIL GET: {e}")
        sys.exit(1)
    print(f"OK {r.status_code} html={len(r.text)} token_len={len(token)}")

    u = soup.find("input", {"id": "txt_UserName"})
    p = soup.find("input", {"id": "txt_Password"})
    b = soup.find("button", {"id": "btn_Login"})
    print(f"fields: txt_UserName={bool(u)} txt_Password={bool(p)} btn_Login={bool(b)}")

    data, pr = do_login(s, base, token, username, password)
    print(f"\nPOST Login -> {pr.status_code}: {str(data)[:600]}")

    # 1. normal success
    if data.get("success") is True:
        redir = data.get("redirectUrl") or "/"
        if redir.startswith("/"):
            # same host as base
            host = base.split("/Cloudilya")[0]
            redir = host + redir
        print(f"SUCCESS -> {redir}")
        fetch_authed(s, redir)
        print("\nSession cookies:", len(s.cookies))
        return

    # 2. 2FA
    if data.get("login") == 3:
        print(f"2FA required. email={data.get('email') or data.get('Email')} "
              f"phone={data.get('phoneNumber') or data.get('PhoneNumber')}")
        cid = data.get("challengeId") or ""
        otp = input("Enter 6-digit OTP: ").strip()
        if not otp.isdigit() or len(otp) != 6:
            print("Invalid OTP format.")
            sys.exit(1)
        d2, pr2 = do_verify_otp(s, base, token, otp, cid, username, password)
        print(f"POST Verify2WayOtp -> {pr2.status_code}: {str(d2)[:600]}")
        if d2.get("success") is True and d2.get("redirectUrl"):
            host = base.split("/Cloudilya")[0]
            redir = d2["redirectUrl"]
            if redir.startswith("/"):
                redir = host + redir
            fetch_authed(s, redir)
        return

    # 3. first-time password change
    if data.get("login") == 1:
        print(f"Password change required: {data.get('errorMessage') or data.get('message')} "
              f"reload={data.get('reload')}")
        return

    # 4. failure
    print(f"Login failed: {data.get('errorMessage') or data.get('message') or data}")


if __name__ == "__main__":
    main()
