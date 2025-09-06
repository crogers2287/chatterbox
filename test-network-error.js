// Simple test to check network connectivity
const axios = require('axios');

async function testAPI() {
    console.log('Testing Chatterbox API...');
    
    try {
        // Test 1: Health check
        console.log('\n1. Testing health endpoint...');
        const healthResponse = await axios.get('http://localhost:6093/health');
        console.log('Health check successful:', healthResponse.data);
        
        // Test 2: Synthesize
        console.log('\n2. Testing synthesize-json endpoint...');
        const synthesizeResponse = await axios.post('http://localhost:6093/synthesize-json', {
            text: 'Network test',
            exaggeration: 0.5,
            temperature: 0.8,
            cfg_weight: 0.5,
            min_p: 0.05,
            top_p: 1.0,
            repetition_penalty: 1.2,
            speech_rate: 1.0
        });
        console.log('Synthesize successful:', synthesizeResponse.data);
        
        // Test 3: Audio URL
        if (synthesizeResponse.data.audio_url) {
            console.log('\n3. Testing audio retrieval...');
            const audioUrl = `http://localhost:6093${synthesizeResponse.data.audio_url}`;
            console.log('Audio URL:', audioUrl);
            
            const audioResponse = await axios.get(audioUrl, {
                responseType: 'arraybuffer'
            });
            console.log('Audio retrieved successfully, size:', audioResponse.data.byteLength, 'bytes');
        }
        
    } catch (error) {
        console.error('\nError occurred:');
        console.error('Message:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        } else if (error.request) {
            console.error('No response received');
            console.error('Request:', error.request);
        } else {
            console.error('Error details:', error);
        }
    }
}

testAPI();