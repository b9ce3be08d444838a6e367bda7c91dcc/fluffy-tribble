#!/usr/bin/env python3
"""
Simple script to fetch kasabunikhilgoud.online and extract the GitHub link.
This is for legitimate website testing and analysis purposes only.
"""

import requests
from bs4 import BeautifulSoup
import re

def extract_github_link():
    """
    Fetches the portfolio website and extracts the GitHub link.
    """
    try:
        # Open the website
        print("Opening kasabunikhilgoud.online...")
        response = requests.get("https://kasabunikhilgoud.online")
        
        if response.status_code == 200:
            print(f"Successfully fetched page (Status: {response.status_code})")
            print(f"Page title: {response.text[:100]}...")
            
            # Parse the HTML
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Find all links that contain 'github.com'
            github_links = []
            for link in soup.find_all('a', href=True):
                href = link['href']
                if 'github.com' in href.lower():
                    github_links.append({
                        'url': href,
                        'text': link.get_text(strip=True),
                        'title': link.get('title', '')
                    })
            
            if github_links:
                print(f"\nFound {len(github_links)} GitHub link(s):")
                for i, link in enumerate(github_links, 1):
                    print(f"{i}. URL: {link['url']}")
                    print(f"   Text: {link['text']}")
                    print(f"   Title: {link['title']}")
                    print()
                
                # Use the first GitHub link found
                main_github_url = github_links[0]['url']
                print(f"Main GitHub profile: {main_github_url}")
                
                # Optionally fetch the GitHub profile
                print("\nFetching GitHub profile...")
                github_response = requests.get(main_github_url)
                if github_response.status_code == 200:
                    print(f"Successfully accessed GitHub profile (Status: {github_response.status_code})")
                    github_soup = BeautifulSoup(github_response.text, 'html.parser')
                    # Try to get the GitHub username from the page
                    github_title = github_soup.title.string if github_soup.title else "Unknown"
                    print(f"GitHub page title: {github_title}")
                else:
                    print(f"Failed to access GitHub profile (Status: {github_response.status_code})")
                
            else:
                print("No GitHub links found on the page.")
                print("All links found:")
                for link in soup.find_all('a', href=True):
                    print(f"- {link['href']}")
                
        else:
            print(f"Failed to fetch page (Status: {response.status_code})")
            
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    print("Starting GitHub link extraction...")
    print("Note: This script is for legitimate testing purposes only.")
    extract_github_link()
    print("Script completed.")