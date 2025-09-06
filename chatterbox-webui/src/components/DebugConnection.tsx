import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

export function DebugConnection() {
  const [result, setResult] = useState<string>('');
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:6093';

  const testConnection = async () => {
    setResult('Testing connection...');
    try {
      const response = await fetch(`${apiUrl}/health`);
      const data = await response.json();
      setResult(`Success! Connected to API at ${apiUrl}\n${JSON.stringify(data, null, 2)}`);
    } catch (error) {
      setResult(`Failed to connect to API at ${apiUrl}\nError: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Debug Connection</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm mb-4">API URL: {apiUrl}</p>
        <Button onClick={testConnection}>Test Connection</Button>
        {result && (
          <pre className="mt-4 p-4 bg-muted rounded text-xs">{result}</pre>
        )}
      </CardContent>
    </Card>
  );
}