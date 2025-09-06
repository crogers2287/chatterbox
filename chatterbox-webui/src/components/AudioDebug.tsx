import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStore } from '@/lib/store';
import { chatterboxAPI } from '@/lib/api';

export function AudioDebug() {
  const { chunks } = useStore();
  const [debugInfo, setDebugInfo] = React.useState<string>('');

  const testAudioAccess = async () => {
    let info = 'Audio Debug Info:\n\n';
    
    // Check API base URL
    info += `API Base URL: ${import.meta.env.VITE_API_URL || 'http://localhost:6093'}\n\n`;
    
    // Test each chunk with audio
    for (const chunk of chunks.filter(c => c.audioUrl)) {
      if (!chunk.audioUrl) continue;
      
      info += `Chunk ${chunk.id}:\n`;
      info += `  Status: ${chunk.status}\n`;
      info += `  Audio URL: ${chunk.audioUrl}\n`;
      
      // Extract filename
      const filename = chunk.audioUrl.split('/').pop() || '';
      info += `  Filename: ${filename}\n`;
      
      // Test direct fetch
      try {
        const response = await fetch(chunk.audioUrl);
        info += `  Direct fetch: ${response.ok ? 'OK' : `Failed (${response.status})`}\n`;
        info += `  Content-Type: ${response.headers.get('content-type') || 'unknown'}\n`;
      } catch (e) {
        info += `  Direct fetch: Error - ${e instanceof Error ? e.message : 'unknown'}\n`;
      }
      
      // Test API download
      try {
        const blob = await chatterboxAPI.downloadAudio(filename);
        info += `  API download: OK (${blob.size} bytes)\n`;
      } catch (e) {
        info += `  API download: Error - ${e instanceof Error ? e.message : 'unknown'}\n`;
      }
      
      info += '\n';
    }
    
    setDebugInfo(info);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audio Debug</CardTitle>
      </CardHeader>
      <CardContent>
        <Button onClick={testAudioAccess} className="mb-4">
          Test Audio Access
        </Button>
        {debugInfo && (
          <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-96">
            {debugInfo}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}