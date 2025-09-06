import React from 'react';
import { chatterboxAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import axios from 'axios';

export function DebugAPI() {
  const testAPI = async () => {
    console.log('=== API Debug Test ===');
    console.log('Environment:', import.meta.env);
    console.log('API URL from env:', import.meta.env.VITE_API_URL);
    console.log('Window origin:', window.location.origin);
    
    try {
      // Test 1: Direct fetch with full error handling
      console.log('\n1. Testing direct fetch...');
      try {
        const directResponse = await fetch('http://fred.taile5e8a3.ts.net:6093/health');
        const directData = await directResponse.json();
        console.log('Direct fetch successful:', directData);
      } catch (e) {
        console.error('Direct fetch failed:', e);
      }
      
      // Test 2: Via chatterboxAPI
      console.log('\n2. Testing via chatterboxAPI...');
      try {
        const apiResponse = await chatterboxAPI.health();
        console.log('API wrapper successful:', apiResponse);
      } catch (e) {
        console.error('API wrapper failed:', e);
      }
      
      // Test 3: Synthesize with minimal params
      console.log('\n3. Testing synthesize with minimal params...');
      try {
        const synthResponse = await chatterboxAPI.synthesize({
          text: 'Test'
        });
        console.log('Synthesize successful:', synthResponse);
      } catch (e) {
        console.error('Synthesize failed:', e);
        if (axios.isAxiosError(e)) {
          console.error('Axios error details:', {
            message: e.message,
            code: e.code,
            config: {
              url: e.config?.url,
              method: e.config?.method,
              baseURL: e.config?.baseURL,
              data: e.config?.data
            },
            response: e.response ? {
              status: e.response.status,
              statusText: e.response.statusText,
              data: e.response.data,
              headers: e.response.headers
            } : null
          });
        }
      }
      
      // Test 4: Test with all params
      console.log('\n4. Testing synthesize with all params...');
      try {
        const synthResponse = await chatterboxAPI.synthesize({
          text: 'Full test',
          exaggeration: 0.5,
          temperature: 0.8,
          cfg_weight: 0.5,
          min_p: 0.05,
          top_p: 1.0,
          repetition_penalty: 1.2,
          speech_rate: 1.0
        });
        console.log('Full synthesize successful:', synthResponse);
      } catch (e) {
        console.error('Full synthesize failed:', e);
      }
      
    } catch (error) {
      console.error('Test failed:', error);
    }
  };
  
  return (
    <div className="fixed bottom-4 left-4 z-50">
      <Button onClick={testAPI} variant="destructive">
        Debug API
      </Button>
    </div>
  );
}