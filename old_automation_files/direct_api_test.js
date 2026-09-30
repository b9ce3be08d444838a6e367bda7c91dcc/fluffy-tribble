const https = require('https');
const http = require('http');

// Configuration
const BASE_URL = 'nnrg.beessoftware.cloud';
const USERNAME = '237Z1A0599';
let sessionCookie = '';

// Function to make HTTP requests
function makeRequest(options, data = null, isFormData = false) {
  return new Promise((resolve, reject) => {
    const protocol = options.protocol === 'https:' ? https : http;
    const req = protocol.request(options, (res) => {
      let body = '';
      
      // Extract cookies from response
      if (res.headers['set-cookie']) {
        const cookies = Array.isArray(res.headers['set-cookie']) 
          ? res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ')
          : res.headers['set-cookie'].split(';')[0];
        
        if (cookies) {
          sessionCookie = cookies;
        }
      }
      
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = {
            statusCode: res.statusCode,
            headers: res.headers,
            body: body,
            cookie: sessionCookie
          };
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);

    if (data) {
      if (isFormData) {
        // Send as form-data
        const formData = Object.keys(data)
          .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`)
          .join('&');
        options.headers['Content-Length'] = Buffer.byteLength(formData);
        req.write(formData);
      } else {
        // Send as JSON
        const jsonData = JSON.stringify(data);
        options.headers['Content-Length'] = Buffer.byteLength(jsonData);
        req.write(jsonData);
      }
    }

    req.end();
  });
}

// Function to extract CSRF token from HTML
function extractCSRFToken(html) {
  const tokenMatch = html.match(/name="__RequestVerificationToken" type="hidden" value="([^"]+)"/);
  return tokenMatch ? tokenMatch[1] : null;
}

async function testDirectAPI() {
  console.log('🚀 Starting Direct API Test...\n');

  try {
    // Step 1: Get the login page to extract CSRF token
    console.log('📄 Step 1: Getting login page to extract CSRF token...');
    const loginPageOptions = {
      hostname: BASE_URL,
      port: 443,
      path: '/studentselfservice',
      method: 'GET',
      protocol: 'https:',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };

    const loginPageResponse = await makeRequest(loginPageOptions);
    const csrfToken = extractCSRFToken(loginPageResponse.body);

    if (!csrfToken) {
      console.log('❌ Failed to extract CSRF token');
      return;
    }

    console.log('✅ CSRF Token extracted:', csrfToken.substring(0, 50) + '...');
    console.log('');

    // Step 2: Call ForgotPasswordClickFunctionality
    console.log('📞 Step 2: Calling ForgotPasswordClickFunctionality...');
    const forgotPasswordOptions = {
      hostname: BASE_URL,
      port: 443,
      path: `/studentselfservice/Login/ForgotpasswordClickFunctionality?UserName=${USERNAME}`,
      method: 'GET',
      protocol: 'https:',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': sessionCookie
      }
    };

    const forgotPasswordResponse = await makeRequest(forgotPasswordOptions);
    console.log('📊 Response Status:', forgotPasswordResponse.statusCode);
    console.log('📄 Response Body:', forgotPasswordResponse.body);
    console.log('');

    // Step 3: Try to get OTP functionality with form-data
    console.log('🔐 Step 3: Calling GetOTPFunctionality with form-data...');
    const otpOptions = {
      hostname: BASE_URL,
      port: 443,
      path: '/studentselfservice/Login/GetOTPFunctionality',
      method: 'POST',
      protocol: 'https:',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': sessionCookie,
        'X-Requested-With': 'XMLHttpRequest',
        'RequestVerificationToken': csrfToken
      }
    };

    const otpData = { 
      UserName: USERNAME,
      __RequestVerificationToken: csrfToken
    };
    const otpResponse = await makeRequest(otpOptions, otpData, true);
    console.log('📊 Response Status:', otpResponse.statusCode);
    console.log('📄 Response Body:', otpResponse.body);
    console.log('');

    console.log('✅ Direct API Test Complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testDirectAPI();
