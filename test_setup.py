#!/usr/bin/env python3
"""Test if all services are properly set up"""
import requests
import sys
import time

def test_service(name, url, expected_status=200):
    try:
        response = requests.get(url, timeout=5)
        if response.status_code == expected_status:
            print(f"✓ {name} is running at {url}")
            return True
        else:
            print(f"✗ {name} returned status {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print(f"✗ {name} is not reachable at {url}")
        return False
    except Exception as e:
        print(f"✗ {name} error: {e}")
        return False

def main():
    print("Chatterbox Setup Test")
    print("=" * 50)
    
    services = [
        ("Chatterbox API", "http://fred.taile5e8a3.ts.net:6093/health"),
        ("Web UI", "http://100.98.154.42:5173/"),
        ("Audiobook API (if running)", "http://fred.taile5e8a3.ts.net:7860/"),
    ]
    
    results = []
    for name, url in services:
        results.append(test_service(name, url))
    
    print("\nAuthentication Test:")
    print("- Development mode with VITE_BYPASS_AUTH=true")
    print("- No login required, auto-authenticated as admin")
    
    print("\nTo access the services:")
    print("1. Web UI: http://100.98.154.42:5173/")
    print("2. Standard TTS Mode: Available on main page")
    print("3. Audiobook Mode: Click user menu → 'Audiobook Mode'")
    
    print("\nNote: The Audiobook backend (port 7860) needs to be started separately:")
    print("  cd /home/crogers2287/chatterbox")
    print("  source venv/bin/activate")
    print("  python launch_audiobook.py")
    
    if all(results[:2]):  # Check if at least API and UI are running
        print("\n✓ Core services are running successfully!")
        return 0
    else:
        print("\n✗ Some services are not running properly")
        return 1

if __name__ == "__main__":
    sys.exit(main())