import ddddocr
import os
import sys

def solve_captcha(image_path):
    """
    Solve captcha using ddddocr library
    """
    try:
        # Initialize the ddddocr classifier
        ocr = ddddocr.DdddOcr(show_ad=False)
        
        # Read the image as bytes
        with open(image_path, 'rb') as f:
            img_bytes = f.read()
            
        # Perform OCR
        result = ocr.classification(img_bytes)
        
        return result
    except Exception as e:
        print(f"Error solving captcha: {e}")
        return None

def test_on_sample():
    """
    Test the captcha solver on sample images
    """
    captcha_dir = 'captcha_images'
    
    if not os.path.exists(captcha_dir):
        print(f"Directory {captcha_dir} does not exist")
        return
    
    # Test on all images in the directory
    for filename in os.listdir(captcha_dir):
        if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp')):
            filepath = os.path.join(captcha_dir, filename)
            print(f"\nProcessing: {filename}")
            
            result = solve_captcha(filepath)
            
            if result:
                print(f"Predicted Text: {result}")
            else:
                print("Failed to solve captcha")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        # Solve specific image
        image_path = sys.argv[1]
        if os.path.exists(image_path):
            result = solve_captcha(image_path)
            print(f"Result: {result}")
        else:
            print(f"File not found: {image_path}")
    else:
        # Test on all sample images
        test_on_sample()
