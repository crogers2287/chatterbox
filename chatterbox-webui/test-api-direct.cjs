const http = require('http');
const fs = require('fs');

console.log('=== Direct API Test ===\n');

// Test synthesis
const testData = JSON.stringify({
  text: 'Direct API test',
  speed: 1.0,
  temperature: 0.3,
  top_k: 20,
  top_p: 0.9
});

const options = {
  hostname: 'localhost',
  port: 6095,
  path: '/synthesize-json',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(testData)
  }
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response:', data);
    
    try {
      const json = JSON.parse(data);
      if (json.success && json.audio_url) {
        console.log('\n✓ Synthesis successful!');
        console.log(`Audio URL: ${json.audio_url}`);
        console.log(`Duration: ${json.duration}s`);
        
        // Test downloading the audio
        const audioOptions = {
          hostname: 'localhost',
          port: 6095,
          path: json.audio_url,
          method: 'GET'
        };
        
        const audioReq = http.request(audioOptions, (audioRes) => {
          console.log(`\nDownloading audio... Status: ${audioRes.statusCode}`);
          
          if (audioRes.statusCode === 200) {
            const chunks = [];
            audioRes.on('data', chunk => chunks.push(chunk));
            audioRes.on('end', () => {
              const buffer = Buffer.concat(chunks);
              fs.writeFileSync('test-output.wav', buffer);
              console.log(`✓ Audio saved to test-output.wav (${buffer.length} bytes)`);
            });
          }
        });
        
        audioReq.on('error', err => console.error('Audio download error:', err));
        audioReq.end();
      } else {
        console.log('✗ Synthesis failed:', json.message || 'Unknown error');
      }
    } catch (e) {
      console.error('Parse error:', e);
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (err) => {
  console.error('Request error:', err);
});

req.write(testData);
req.end();