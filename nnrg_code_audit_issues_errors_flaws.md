# NNRG BeeSoftware CloudilyaUnited - Code Issues, Errors and Exposing Flaws
Target: `nnrg_beessoftware_cloudilyaunited_raw.html`
Date: 2026-09-28

## 1. Critical Exposures

### 1.1 AES key exposed client-side
- File: `nnrg_beessoftware_cloudilyaunited_raw.html:716`
- `<meta name="enc-key" content="b7e15...">` + `EncryptionHelper` at `1043:1092`
- Anyone can decrypt `Forgotpassword` response, forge `encryptedData`. Client-side encryption with public key is obfuscation only.
- Fix: remove meta, do crypto server-side only.

### 1.2 Plaintext password in localStorage (RememberMe)
- File: `nnrg_beessoftware_cloudilyaunited_raw.html:1126,1171`
- `localStorage.setItem('userName',...); setItem('password',...)`
- XSS / physical access steals it.
- Fix: never store password, use HttpOnly Secure cookie / token, store username only if needed.

### 1.3 Plaintext login / 2FA
- File: `nnrg_beessoftware_cloudilyaunited_raw.html:1182,1638`
- `POST /CloudilyaUnited/Login/Login {UserName,Password}` no encryption, no CSRF header.
- `POST /CloudilyaUnited/Login/Verify2WayOtp {otp,challengeId,username,password}` - password again in clear, `challengeId` client-controlled.
- Fix: TLS + anti-forgery header on all POSTs, don't resend password on OTP verify, bind challenge server-side to session.

### 1.4 `ConfirmForgotPassword` sends clear data, encryption dead code
- File: `nnrg_beessoftware_cloudilyaunited_raw.html:1845:1870`
- Builds `encryptedData` but POSTs plain `UserId,AdminUserId,UserName,NewPW,ConfirmPassword`.
- Implicit globals `forgotcolcode,forgotcollegeid,forgotempid,forgotadminid,forgotusername,forgotusertype` at `2042:2058` - window-pollutable.
- `resetToken:2033` never used on confirm - missing binding, enables IDOR / user swap.
- Fix: send only `encryptedData + resetToken`, validate server-side, declare with `let/const`.

### 1.5 OTP disclosure
- File: `nnrg_beessoftware_cloudilyaunited_raw.html:2749:2752`
- `OTP=response.result2; alert(OTP);`
- Fix: remove debug alert.

### 1.6 Local path / PII disclosure
- File: `nnrg_beessoftware_cloudilyaunited_raw.html:28`
- `url("C:\Users\ksaikumar\Downloads\backimg.jpg")` - leaks username, broken CSS.
- `nnrg_beessoftware_cloudilyaunited_raw.html:760` logo URL reveals `CollegeLogos/nnrg0001`, deployment structure.
- `nnrg_beessoftware_cloudilyaunited_raw.html:2118:2162` full `email,phoneNumber` in JS then masked client-side - full value already in devtools. Mask server-side.
- User enumeration at `2169:2177` via `"Username doesn't exist"`.
- Fix: remove local URL, mask server-side, generic errors.

### 1.7 CSRF token dump
- File: `nnrg_beessoftware_cloudilyaunited_raw.html:701,817,1020`
- Live `__RequestVerificationToken` values in shared raw dump. Plus `VerifyCaptcha:1937` has no `RequestVerificationToken` header while other POSTs do.
- Fix: don't share raw dumps, add header to all POSTs, rotate tokens.

## 2. HTML / Structural Errors

- `710,732,2866:2878` nested documents: outer `<html><head><body>` + inner `<html lang="en" hac><head><body oncontextmenu>`. Invalid.
- Duplicate IDs: `span_invalid:802,894`, `neumorphic-input-wrapper1:880,887`.
- Duplicate CSS: `#loadingSpinner:390,512`, `.toggle-password:137,540` conflicting `top`.
- `<p>` inside `<button>:895,973`, `<input id=userid hidden>:756` should be `type=hidden`, `<div b-cqqahxd073>` Blazor leak, `<html hac>` invalid attr, double `<title>`.
- `732:oncontextmenu="return false"` false security, hurts a11y.
- `810` DVS link `target=_blank` without `rel=noopener` (store-btns have it).
- Double loads: jQuery `706:3.6.0` vs `1034:3.6.1`, `bootstrap.bundle:1037,2876`, `popper@1.16:1036` incompatible with Bootstrap 5.2.3. Unused `xlsx:16,jspdf:17,18` on login. `notify.min.js:2864` loaded after use.

## 3. JS Logic / Runtime Bugs

- Undefined globals -> ReferenceError: `GetMailandMobile:2634`, `ConfirmapplicationNumber:2675`, `OTP:2751`, `enteredOTP:2609`, `passwordInput,eyeIcon:2567`, `isUserAction:1106,2499`.
- Duplicate functions: `ForGotPasswordValidations:2401 vs 2411`, `Alltextboxesenter:2342 vs 2832`, `switchForm,switchForm1-4:2322:2341` identical.
- Missing DOM refs: `#isUserAction,#txt_GrpCode,#txt_ColCode,#txt_OTP,#txt_UserName1,#txt_NewPassword,#loginForm,#otpForm,#timer,#btn_resend,#logincard,#test,#btn_Backs` - silent fail. `2499:$("#loginForm")` should be `#loginFormElement`; `1358:$('#errorMessage')` missing; `2164,2525:#logincard` vs `#loginFormMain`.
- Timer leak: `2225:startTimer()` local `otpTimer`, `2302:stopTimer()` clears undefined. Overlapping intervals, `confirm()` resend spam, wrong redirect `2292:/CoreERP/Login/Index`.
- Swal `onClose:2101,2669` deprecated - OTP card may stay `d-none`.
- Eye-toggle double-bound: inline `onclick` + `2853:$("body").on(click,.toggle-password)`.
- OTP UX: `type=text` no `inputmode`, only first has `autocomplete=one-time-code`, letter handling inconsistent `1148 vs 2531`.
- `$.notify` success class used for errors `1533,1540,1820`; `console.error/alert("Error:"+error):2196` info leak.

## 4. Immediate Fixes

1. Delete `enc-key` meta, encrypt server-side.
2. Remove `localStorage` password, remove `alert(OTP)`.
3. Fix `ConfirmForgotPassword` to use `encryptedData+resetToken` only.
4. Add CSRF header to all POSTs, mask PII server-side, generic login errors.
5. Fix nested HTML, dedupe IDs/libs, remove local path, add `rel=noopener`.
6. Declare all vars, remove dead `Relode/GetMailandMobile` path, fix timer scope, fix selectors, remove `oncontextmenu` block.
