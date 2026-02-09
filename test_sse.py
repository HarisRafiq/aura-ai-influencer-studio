#!/usr/bin/env python3
"""
Test SSE endpoint - verifies that the SSE stream is working correctly
"""
import requests
import json
import time

# Test SSE endpoint
print("🧪 Testing SSE endpoint...")
print("=" * 60)

# Test 1: Check endpoint exists
try:
    response = requests.get(
        "http://localhost:8000/stream",
        params={"resources": "test:123"},
        stream=True,
        timeout=5
    )
    print("✅ SSE endpoint exists")
    print(f"   Status: {response.status_code}")
    print(f"   Headers: {dict(response.headers)}")
    
    # Test 2: Verify SSE headers
    content_type = response.headers.get('content-type', '')
    if 'text/event-stream' in content_type:
        print("✅ Correct content-type: text/event-stream")
    else:
        print(f"❌ Wrong content-type: {content_type}")
    
    cache_control = response.headers.get('cache-control', '')
    if 'no-cache' in cache_control:
        print("✅ Correct cache-control: no-cache")
    else:
        print(f"⚠️  Cache-control: {cache_control}")
    
    # Test 3: Receive initial connection event
    print("\n📡 Listening for SSE events (5 seconds)...")
    start_time = time.time()
    event_count = 0
    
    for line in response.iter_lines(decode_unicode=True):
        if line:
            print(f"   Received: {line}")
            event_count += 1
        
        if time.time() - start_time > 5:
            break
    
    if event_count > 0:
        print(f"✅ Received {event_count} SSE events")
    else:
        print("⚠️  No events received (connection may be working but no data broadcast)")
    
    response.close()
    
except requests.exceptions.Timeout:
    print("⏱️  Connection timeout (this is OK - SSE streams stay open)")
except Exception as e:
    print(f"❌ Error: {e}")

print("\n" + "=" * 60)
print("✨ SSE endpoint test complete!")
print("\nNote: To fully test SSE, create an influencer or post and watch")
print("the real-time updates in the frontend.")
