import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useStore } from '@/lib/store';

export function DebugChunks() {
  const { chunks } = useStore();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Debug: Chunk Audio URLs</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {chunks.map((chunk, index) => (
            <div key={chunk.id} className="p-2 bg-muted rounded text-xs">
              <div>Chunk {index + 1} (ID: {chunk.id})</div>
              <div className="truncate">Text: {chunk.text.substring(0, 50)}...</div>
              <div>Status: {chunk.status}</div>
              <div className="text-blue-600">Audio URL: {chunk.audioUrl || 'Not generated'}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}