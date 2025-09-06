// Test script to debug audio generation
import { chatterboxAPI } from './src/lib/api.js';

async function testGeneration() {
  console.log('Testing audio generation...');
  
  try {
    const response = await chatterboxAPI.synthesize({
      text: 'This is a test of the audiobook generation system.',
      exaggeration: 0.5,
      temperature: 0.8,
      cfg_weight: 0.5,
      min_p: 0.05,
      top_p: 1.0,
      repetition_penalty: 1.2,
      seed: null,
      speech_rate: 1.0,
    });
    
    console.log('Response:', response);
    
    if (response.success && response.audio_url) {
      const fullUrl = chatterboxAPI.getAudioUrl(response.audio_url);
      console.log('Full audio URL:', fullUrl);
      
      // Try to fetch the audio
      const audioResponse = await fetch(fullUrl);
      console.log('Audio fetch status:', audioResponse.status);
      console.log('Audio content type:', audioResponse.headers.get('content-type'));
    }
  } catch (error) {
    console.error('Test failed:', error);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

testGeneration();