import requests
import time
import os

# Create directory for captcha images
captcha_dir = 'captcha_images'
if not os.path.exists(captcha_dir):
    os.makedirs(captcha_dir)

# Base URL for captcha
captcha_url = "https://nnrg.beessoftware.cloud/studentselfservice/Login/GetCaptcha"

# Download 20 captcha images
print("Downloading 20 captcha images from direct URL...")
for i in range(20):
    try:
        # Add timestamp to prevent caching
        timestamp = int(time.time() * 1000)
        url_with_params = f"{captcha_url}?t={timestamp}"
        
        print(f"Downloading image {i+1}/20...")
        
        # Make request with session to maintain cookies
        session = requests.Session()
        
        # First visit the main page to establish session
        session.get('https://nnrg.beessoftware.cloud/studentselfservice')
        
        # Then request the captcha
        response = session.get(url_with_params)
        
        if response.status_code == 200:
            # Save the image
            filename = os.path.join(captcha_dir, f'captcha_{i+1}.png')
            with open(filename, 'wb') as f:
                f.write(response.content)
            print(f"Saved: {filename}")
        else:
            print(f"Failed to download image {i+1}. Status code: {response.status_code}")
        
        # Small delay between requests
        time.sleep(1)
        
    except Exception as e:
        print(f"Error downloading image {i+1}: {e}")

print("Download complete!")
