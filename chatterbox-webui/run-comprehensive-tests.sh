#!/bin/bash

# Comprehensive test script for Chatterbox TTS Web UI

echo "=== Chatterbox TTS Web UI Comprehensive Testing ==="
echo "Testing against:"
echo "  - Frontend: http://localhost:5173"
echo "  - API Load Balancer: http://localhost:6095"
echo ""

# Create screenshots directory
mkdir -p screenshots
rm -f screenshots/*.png

# Check if servers are running
echo "Checking server status..."
if ! curl -s http://localhost:5173 > /dev/null; then
    echo "ERROR: Frontend not running on port 5173"
    echo "Please start the frontend with: npm run dev"
    exit 1
fi

if ! curl -s http://localhost:6095/health > /dev/null; then
    echo "WARNING: API load balancer may not be running on port 6095"
    echo "Tests will proceed but may fail"
fi

# Install dependencies if needed
if [ ! -d "node_modules/@playwright" ]; then
    echo "Installing Playwright..."
    npm install --save-dev @playwright/test
    npx playwright install chromium
fi

# Run tests with detailed output
echo ""
echo "Running comprehensive tests..."
npx playwright test tests/comprehensive-tts.spec.ts \
    --reporter=list \
    --max-failures=5 \
    --trace=on \
    --screenshot=on \
    --video=on

# Generate HTML report
echo ""
echo "Generating test report..."
npx playwright show-report

echo ""
echo "=== Test Results ==="
echo "Screenshots saved in: ./screenshots/"
echo "Test report available at: ./playwright-report/index.html"
echo "Videos and traces available in: ./test-results/"