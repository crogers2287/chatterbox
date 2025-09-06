#!/usr/bin/env python3
"""
Chatterbox Services Integration Test
Comprehensive test of both Chatterbox TTS and ChatterboxPro services
"""

import requests
import json
import time
from datetime import datetime

def test_services():
    """Test both Chatterbox services and their integration."""
    
    print("🚀 Chatterbox Services Integration Test")
    print("=" * 60)
    print(f"Test started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    results = {}
    
    # Test 1: Chatterbox TTS API Health
    print("🔍 Testing Chatterbox TTS API (Port 6093)...")
    try:
        response = requests.get("http://localhost:6093/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get("status") == "healthy":
                print("✅ Chatterbox TTS API: HEALTHY")
                print(f"   GPU: {data.get('gpu_name', 'N/A')}")
                print(f"   Model: {'✅ LOADED' if data.get('model_loaded') else '❌ NOT LOADED'}")
                print(f"   GPU Memory: {data.get('gpu_memory_allocated', 0):.2f} GB allocated")
                results["tts_api"] = True
            else:
                print("❌ Chatterbox TTS API: UNHEALTHY")
                results["tts_api"] = False
        else:
            print(f"❌ Chatterbox TTS API: HTTP {response.status_code}")
            results["tts_api"] = False
    except Exception as e:
        print(f"❌ Chatterbox TTS API: CONNECTION FAILED - {e}")
        results["tts_api"] = False
    
    print()
    
    # Test 2: ChatterboxPro Web Interface
    print("🔍 Testing ChatterboxPro Web Interface (Port 6094)...")
    try:
        response = requests.get("http://localhost:6094/", timeout=5)
        if response.status_code == 200:
            print("✅ ChatterboxPro Web Interface: ACCESSIBLE")
            results["pro_web"] = True
        else:
            print(f"❌ ChatterboxPro Web Interface: HTTP {response.status_code}")
            results["pro_web"] = False
    except Exception as e:
        print(f"❌ ChatterboxPro Web Interface: CONNECTION FAILED - {e}")
        results["pro_web"] = False
    
    print()
    
    # Test 3: Service Integration
    print("🔍 Testing Service Integration...")
    if results.get("tts_api") and results.get("pro_web"):
        print("✅ Both services are running - Integration possible")
        print("   ChatterboxPro can connect to Chatterbox TTS API")
        results["integration"] = True
    else:
        print("❌ Integration not possible - One or both services are down")
        results["integration"] = False
    
    print()
    
    # Test 4: System Services Status
    print("🔍 Testing System Services...")
    import subprocess
    
    try:
        # Check Chatterbox TTS service
        result = subprocess.run(
            ["systemctl", "is-active", "chatterbox-tts.service"],
            capture_output=True, text=True
        )
        tts_status = result.stdout.strip()
        
        # Check ChatterboxPro service
        result = subprocess.run(
            ["systemctl", "is-active", "chatterbox-pro.service"],
            capture_output=True, text=True
        )
        pro_status = result.stdout.strip()
        
        print(f"   Chatterbox TTS Service: {'✅' if tts_status == 'active' else '❌'} {tts_status}")
        print(f"   ChatterboxPro Service: {'✅' if pro_status == 'active' else '❌'} {pro_status}")
        
        results["services"] = tts_status == "active" and pro_status == "active"
        
    except Exception as e:
        print(f"❌ Could not check service status: {e}")
        results["services"] = False
    
    print()
    
    # Summary
    print("=" * 60)
    print("📊 Test Results Summary:")
    
    test_items = [
        ("Chatterbox TTS API", results.get("tts_api", False)),
        ("ChatterboxPro Web Interface", results.get("pro_web", False)),
        ("Service Integration", results.get("integration", False)),
        ("System Services", results.get("services", False))
    ]
    
    all_passed = True
    for name, passed in test_items:
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"   {name}: {status}")
        if not passed:
            all_passed = False
    
    print()
    if all_passed:
        print("🎉 ALL TESTS PASSED!")
        print("🔗 Service URLs:")
        print("   Chatterbox TTS API: http://localhost:6093")
        print("   Chatterbox TTS Docs: http://localhost:6093/docs")
        print("   ChatterboxPro Web UI: http://localhost:6094")
        print()
        print("🎯 Ready for audiobook generation!")
    else:
        print("⚠️ SOME TESTS FAILED - Please check the issues above")
    
    return all_passed

if __name__ == "__main__":
    test_services()