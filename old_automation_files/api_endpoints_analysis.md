# API Endpoints Analysis - BeeSERP Student Self Service

## 📋 Complete API Endpoints & JSON Structures

### 1. **Login Endpoint**
```
POST /studentselfservice/Login/Login
```
**Request:**
```json
{
  "UserName": "string",
  "password": "string",
  "rememberMe": "boolean",
  "__RequestVerificationToken": "string"
}
```
**Response:**
```json
{
  "status": "boolean",
  "message": "string",
  "redirectUrl": "string"
}
```

---

### 2. **Captcha Validation**
```
POST /studentselfservice/Login/ValidateCaptcha
```
**Request:**
```json
{
  "captcha": "string"
}
```
**Response:**
```json
{
  "status": "boolean",
  "message": "string"
}
```

---

### 3. **Forgot Password Click Functionality**
```
GET /studentselfservice/Login/ForgotpasswordClickFunctionality
```
**Request:**
```json
{
  "UserName": "string"
}
```
**Response:**
```json
{
  "status": "boolean",
  "message": "string",
  "mobile": "string",
  "email": "string"
}
```

---

### 4. **Get OTP Functionality**
```
POST /studentselfservice/Login/GetOTPFunctionality
```
**Request:**
```json
{
  "UserName": "string"
}
```
**Response:**
```json
{
  "status": "boolean",
  "result": "OTP sent Your Mobile",
  "otpdetails": {
    "mobileOtp": "string",
    "emailOtp": "string",
    "otpUser": "string"
  }
}
```

---

### 5. **Forgot Password (OTP Submission)**
```
POST /studentselfservice/Login/Forgotpassword
```
**Option 1 - Direct OTP:**
```json
{
  "OTP": "string"
}
```
**Option 2 - Encrypted Data:**
```json
{
  "encryptedData": "string"
}
```
**Response:**
```json
{
  "status": "boolean",
  "message": "string",
  "data": "encrypted_string"
}
```

---

### 6. **Change Password**
```
POST /studentselfservice/Login/ChangePassword
```
**Request:**
```json
{
  "UserName": "string",
  "OldPassword": "string",
  "NewPassword": "string",
  "ConfirmPassword": "string"
}
```
**Response:**
```json
{
  "status": "boolean",
  "message": "string"
}
```

---

### 7. **Forgot Password Change Password**
```
POST /studentselfservice/Login/ForgetChangePassword
```
**Request:**
```json
{
  "encryptedData": "string"
}
```
**Headers:**
```json
{
  "RequestVerificationToken": "string"
}
```
**Response:**
```json
{
  "status": "boolean",
  "message": "string",
  "data": "encrypted_string"
}
```

---

### 8. **Verify OTP**
```
POST /studentselfservice/StudentSelfService/VerifyOtp
```
**Request:**
```json
{
  "encryptedData": "string"
}
```
**Response:**
```json
{
  "status": "boolean",
  "message": "string",
  "resetToken": "string"
}
```

---

### 9. **Confirm Change Password**
```
POST /studentselfservice/Login/ConfirmChangePassword
```
**Request:**
```json
{
  "GrpCode": "string",
  "OTP": "string",
  "NewPassword": "string",
  "ConfirmPassword": "string"
}
```
**Response:**
```json
{
  "status": "boolean",
  "message": "string"
}
```

---

### 10. **Get OTP Functionality (Change Password)**
```
POST /studentselfservice/Login/GetOTPFunctionalityChangePassword
```
**Request:**
```json
{
  "GrpCode": "string",
  "UserName": "string"
}
```
**Response:**
```json
{
  "status": "boolean",
  "result": "string",
  "otpdetails": {
    "mobileOtp": "string",
    "emailOtp": "string",
    "otpUser": "string"
  }
}
```

---

### 11. **Resend OTP**
```
POST /studentselfservice/Login/GetOTPFunctionality
```
**Request:**
```json
{
  "UserName": "string"
}
```
**Response:**
```json
{
  "status": "boolean",
  "result": "OTP sent Your Mobile"
}
```

---

### 12. **Save Email/Mobile**
```
POST /studentselfservice/Login/Login_SaveEmailMobile
```
**Request:**
```json
{
  "mobile": "string",
  "email": "string",
  "flag": "string"
}
```
**Response:**
```json
{
  "status": "boolean",
  "message": "string"
}
```

---

### 13. **First Time Login Save Email/Mobile**
```
POST /studentselfservice/Login/FirstTimeLogin_SaveEmailMobile
```
**Request:**
```json
{
  "mobile": "string",
  "email": "string"
}
```
**Response:**
```json
{
  "status": "boolean",
  "message": "string"
}
```

---

## 🔐 Security Features

### Encryption System
- **Encryption Key:** `b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a78e3b8e3ae59cba`
- **CSRF Protection:** Dynamic `__RequestVerificationToken` required
- **Data Encryption:** Sensitive data sent as `encryptedData` field

### Captcha System
- **Captcha URL:** `/studentselfservice/Login/GetCaptcha?t={timestamp}`
- **Validation:** `/studentselfservice/Login/ValidateCaptcha`
- **Refresh:** Via timestamp parameter

---

## 🔄 Complete Forgot Password Flow

1. **GET** `/studentselfservice/Login/ForgotpasswordClickFunctionality` (with username)
2. **POST** `/studentselfservice/Login/ValidateCaptcha` (with captcha)
3. **POST** `/studentselfservice/Login/GetOTPFunctionality` (with username)
4. **POST** `/studentselfservice/Login/Forgotpassword` (with OTP)
5. **POST** `/studentselfservice/Login/ForgetChangePassword` (with new password)
6. **POST** `/studentselfservice/StudentSelfService/VerifyOtp` (with encrypted OTP)

---

## 📝 Automation Implementation Notes

### Critical Points:
1. **CSRF Token** must be extracted and included in all POST requests
2. **Captcha** must be solved and validated before proceeding
3. **OTP** is sent to both mobile and email
4. **Encryption** is used for sensitive data transmission
5. **Session management** required for maintaining authentication state

### Form Fields Mapping:
- Username: `#txt_UserName` / `name="UserName"`
- Password: `#txt_Password` / `name="password"`
- OTP: `#txt_OTP` (6-digit input fields)
- Captcha: `#txtForgotPasswordCaptcha`
- New Password: `#txt_NewPasswordchange`
- Confirm Password: `#txt_ConfirmPasswordchange`
