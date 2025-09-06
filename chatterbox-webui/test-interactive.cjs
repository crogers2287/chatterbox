// Interactive test script for Chatterbox TTS Web UI
const http = require('http');

console.log('=== Chatterbox TTS API Test ===\n');

// Test API endpoints
const endpoints = [
  { name: 'Load Balancer', port: 6095 },
  { name: 'GPU 0', port: 6093 },
  { name: 'GPU 1', port: 6094 }
];

async function testEndpoint(name, port) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: port,
      path: '/health',
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log(`✓ ${name} (port ${port}): Connected`);
        try {
          const json = JSON.parse(data);
          console.log(`  - Model loaded: ${json.model_loaded}`);
          console.log(`  - GPU: ${json.gpu_name}`);
          console.log(`  - Memory: ${json.gpu_memory_allocated.toFixed(1)}GB / ${json.gpu_memory_total.toFixed(1)}GB\n`);
        } catch (e) {
          console.log(`  - Response: ${data}\n`);
        }
        resolve(true);
      });
    });

    req.on('error', (err) => {
      console.log(`✗ ${name} (port ${port}): ${err.message}\n`);
      resolve(false);
    });

    req.on('timeout', () => {
      console.log(`✗ ${name} (port ${port}): Timeout\n`);
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

async function testSynthesis() {
  console.log('\n=== Testing Synthesis ===\n');
  
  const testData = JSON.stringify({
    text: 'Hello, this is a test of the Chatterbox TTS system.',
    speed: 1.0,
    temperature: 0.3,
    top_k: 20,
    top_p: 0.9
  });

  const options = {
    hostname: 'localhost',
    port: 6095,
    path: '/api/synthesize',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(testData)
    },
    timeout: 30000
  };

  return new Promise((resolve) => {
    const startTime = Date.now();
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`Response received in ${duration}s`);
        
        try {
          const json = JSON.parse(data);
          if (json.success) {
            console.log(`✓ Synthesis successful!`);
            console.log(`  - Audio URL: ${json.audio_url}`);
            console.log(`  - Duration: ${json.duration?.toFixed(2)}s`);
            console.log(`  - GPU Used: ${json.gpu_id}`);
          } else {
            console.log(`✗ Synthesis failed: ${json.message}`);
          }
        } catch (e) {
          console.log(`✗ Invalid response: ${data}`);
        }
        resolve();
      });
    });

    req.on('error', (err) => {
      console.log(`✗ Request failed: ${err.message}`);
      resolve();
    });

    req.write(testData);
    req.end();
  });
}

// Run tests
(async () => {
  console.log('Testing API endpoints...\n');
  
  for (const endpoint of endpoints) {
    await testEndpoint(endpoint.name, endpoint.port);
  }

  await testSynthesis();

  console.log('\n=== Test Complete ===');
})();