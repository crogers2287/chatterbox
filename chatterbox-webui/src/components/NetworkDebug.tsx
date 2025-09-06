import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import axios from 'axios';

interface TestResult {
  test: string;
  success: boolean;
  message: string;
  details?: any;
  timestamp: string;
}

export function NetworkDebug() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [testing, setTesting] = useState(false);

  const addResult = (test: string, success: boolean, message: string, details?: any) => {
    setResults(prev => [{
      test,
      success,
      message,
      details,
      timestamp: new Date().toISOString()
    }, ...prev]);
  };

  const runAllTests = async () => {
    setTesting(true);
    setResults([]);
    
    const API_URL = import.meta.env.VITE_API_URL || 'http://fred.taile5e8a3.ts.net:6093';
    
    // Test 1: Environment Check
    addResult('Environment', true, 'Checking environment variables', {
      VITE_API_URL: import.meta.env.VITE_API_URL,
      API_URL_USED: API_URL,
      ORIGIN: window.location.origin,
      PROTOCOL: window.location.protocol,
      HOSTNAME: window.location.hostname
    });

    // Test 2: Direct Fetch to Health Endpoint
    try {
      const healthResponse = await fetch(`${API_URL}/health`);
      const healthData = await healthResponse.json();
      addResult('Health Check (Fetch)', true, 'Health endpoint accessible', healthData);
    } catch (error: any) {
      addResult('Health Check (Fetch)', false, error.message, {
        error: error.toString(),
        type: error.constructor.name
      });
    }

    // Test 3: Axios Health Check
    try {
      const axiosHealth = await axios.get(`${API_URL}/health`);
      addResult('Health Check (Axios)', true, 'Axios can reach health endpoint', axiosHealth.data);
    } catch (error: any) {
      addResult('Health Check (Axios)', false, 'Axios failed', {
        message: error.message,
        code: error.code,
        response: error.response?.data,
        config: {
          url: error.config?.url,
          method: error.config?.method
        }
      });
    }

    // Test 4: OPTIONS Preflight Check
    try {
      const optionsResponse = await fetch(`${API_URL}/synthesize-json`, {
        method: 'OPTIONS',
        headers: {
          'Origin': window.location.origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type'
        }
      });
      
      const corsHeaders: any = {};
      optionsResponse.headers.forEach((value, key) => {
        if (key.toLowerCase().startsWith('access-control')) {
          corsHeaders[key] = value;
        }
      });
      
      addResult('CORS Preflight', optionsResponse.ok, `Status: ${optionsResponse.status}`, corsHeaders);
    } catch (error: any) {
      addResult('CORS Preflight', false, error.message, { error: error.toString() });
    }

    // Test 5: Simple POST with Fetch
    try {
      const postResponse = await fetch(`${API_URL}/synthesize-json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: 'Test' })
      });
      
      const postData = await postResponse.json();
      addResult('POST (Fetch)', postResponse.ok, 'Synthesis request successful', postData);
    } catch (error: any) {
      addResult('POST (Fetch)', false, error.message, {
        error: error.toString(),
        type: error.constructor.name
      });
    }

    // Test 6: POST with Axios
    try {
      const axiosPost = await axios.post(`${API_URL}/synthesize-json`, { text: 'Axios test' });
      addResult('POST (Axios)', true, 'Axios synthesis successful', axiosPost.data);
    } catch (error: any) {
      const isNetworkError = error.code === 'ERR_NETWORK';
      addResult('POST (Axios)', false, isNetworkError ? 'Network Error - Check console' : error.message, {
        code: error.code,
        message: error.message,
        networkError: isNetworkError,
        response: error.response?.data,
        request: error.request ? 'XMLHttpRequest made but no response' : undefined
      });
    }

    // Test 7: Test through API wrapper
    try {
      const { chatterboxAPI } = await import('@/lib/api');
      const apiResult = await chatterboxAPI.synthesize({ text: 'API wrapper test' });
      addResult('API Wrapper', true, 'API wrapper successful', apiResult);
    } catch (error: any) {
      addResult('API Wrapper', false, error.message, {
        error: error.toString(),
        stack: error.stack
      });
    }

    setTesting(false);
  };

  return (
    <Card className="w-full max-w-4xl mx-auto mt-4">
      <CardHeader>
        <CardTitle>Network Debugging</CardTitle>
        <CardDescription>
          Run comprehensive network tests to diagnose audio generation issues
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button 
          onClick={runAllTests} 
          disabled={testing}
          className="mb-4"
        >
          {testing ? 'Running Tests...' : 'Run All Tests'}
        </Button>
        
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {results.map((result, index) => (
            <div 
              key={index}
              className={`p-3 rounded-lg border ${
                result.success 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">{result.test}</h4>
                <span className={`text-sm ${result.success ? 'text-green-600' : 'text-red-600'}`}>
                  {result.success ? '✓ Success' : '✗ Failed'}
                </span>
              </div>
              <p className="text-sm mt-1">{result.message}</p>
              {result.details && (
                <pre className="text-xs mt-2 p-2 bg-white rounded overflow-x-auto">
                  {JSON.stringify(result.details, null, 2)}
                </pre>
              )}
              <p className="text-xs text-gray-500 mt-1">
                {new Date(result.timestamp).toLocaleTimeString()}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}