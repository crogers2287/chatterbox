import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Play, Pause, Square, Download, Loader2, Volume2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface StreamingMetrics {
  first_chunk_latency: number;
  total_latency: number;
  rtf: number;
  total_audio_duration: number;
  chunks_generated: number;
}

interface AudioChunk {
  id: number;
  blob: Blob;
  duration: number;
  isPlaying: boolean;
  audioElement?: HTMLAudioElement;
}

interface ChunkStreamingPlayerProps {
  onMetricsUpdate?: (metrics: StreamingMetrics) => void;
  className?: string;
}

export const ChunkStreamingPlayer = React.forwardRef<any, ChunkStreamingPlayerProps>(({ 
  onMetricsUpdate,
  className
}, ref) => {
  const [chunks, setChunks] = useState<AudioChunk[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [metrics, setMetrics] = useState<StreamingMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<number | null>(null);
  const [autoPlay, setAutoPlay] = useState(true);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const chunksRef = useRef<AudioChunk[]>([]);

  // Process incoming audio chunk
  const processAudioChunk = useCallback(async (chunkData: any) => {
    try {
      // Decode base64 audio data
      const audioData = atob(chunkData.audio_chunk);
      const arrayBuffer = new ArrayBuffer(audioData.length);
      const uint8Array = new Uint8Array(arrayBuffer);
      
      for (let i = 0; i < audioData.length; i++) {
        uint8Array[i] = audioData.charCodeAt(i);
      }
      
      // Create blob from audio data
      const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
      
      // Create audio element for this chunk
      const audio = new Audio();
      audio.src = URL.createObjectURL(blob);
      
      // Get duration with error handling
      await new Promise((resolve, reject) => {
        audio.addEventListener('loadedmetadata', () => {
          resolve(null);
        }, { once: true });
        
        audio.addEventListener('error', (e) => {
          console.error(`Audio load error for chunk ${chunkData.chunk_id}:`, e);
          reject(e);
        }, { once: true });
        
        // Set timeout for loading metadata
        setTimeout(() => {
          resolve(null); // Continue even if metadata doesn't load
        }, 2000);
      }).catch(err => {
        console.error('Failed to load audio metadata:', err);
      });
      
      const chunk: AudioChunk = {
        id: chunkData.chunk_id,
        blob,
        duration: audio.duration,
        isPlaying: false,
        audioElement: audio
      };
      
      // Add to chunks array
      chunksRef.current = [...chunksRef.current, chunk];
      setChunks([...chunksRef.current]);
      
      // Update metrics
      if (chunkData.metrics) {
        setMetrics(chunkData.metrics);
        if (onMetricsUpdate) {
          onMetricsUpdate(chunkData.metrics);
        }
      }
      
      // Auto-play first chunk if enabled
      if (autoPlay && chunkData.chunk_id === 1 && currentlyPlayingId === null) {
        playChunk(chunk);
      }
      
    } catch (err) {
      console.error('Error processing audio chunk:', err);
      setError(`Failed to process chunk ${chunkData.chunk_id}`);
    }
  }, [autoPlay, currentlyPlayingId, onMetricsUpdate]);

  // Play a specific chunk
  const playChunk = (chunk: AudioChunk) => {
    // Stop any currently playing chunk
    if (currentlyPlayingId !== null && currentlyPlayingId !== chunk.id) {
      const currentChunk = chunksRef.current.find(c => c.id === currentlyPlayingId);
      if (currentChunk?.audioElement) {
        currentChunk.audioElement.pause();
        currentChunk.audioElement.currentTime = 0;
      }
    }
    
    if (chunk.audioElement) {
      chunk.audioElement.play();
      setCurrentlyPlayingId(chunk.id);
      
      // Update playing state
      const updatedChunks = chunksRef.current.map(c => ({
        ...c,
        isPlaying: c.id === chunk.id
      }));
      chunksRef.current = updatedChunks;
      setChunks([...updatedChunks]);
      
      // Handle audio ended
      chunk.audioElement.onended = () => {
        const updatedChunks = chunksRef.current.map(c => ({
          ...c,
          isPlaying: false
        }));
        chunksRef.current = updatedChunks;
        setChunks([...updatedChunks]);
        setCurrentlyPlayingId(null);
        
        // Auto-play next chunk if enabled
        if (autoPlay) {
          const nextChunk = chunksRef.current.find(c => c.id === chunk.id + 1);
          if (nextChunk) {
            playChunk(nextChunk);
          }
        }
      };
    }
  };

  // Pause current chunk
  const pauseChunk = (chunk: AudioChunk) => {
    if (chunk.audioElement) {
      chunk.audioElement.pause();
      
      const updatedChunks = chunksRef.current.map(c => ({
        ...c,
        isPlaying: false
      }));
      chunksRef.current = updatedChunks;
      setChunks([...updatedChunks]);
      setCurrentlyPlayingId(null);
    }
  };

  // Stop all playback
  const stopAll = () => {
    chunksRef.current.forEach(chunk => {
      if (chunk.audioElement) {
        chunk.audioElement.pause();
        chunk.audioElement.currentTime = 0;
      }
    });
    
    const updatedChunks = chunksRef.current.map(c => ({
      ...c,
      isPlaying: false
    }));
    chunksRef.current = updatedChunks;
    setChunks([...updatedChunks]);
    setCurrentlyPlayingId(null);
  };

  // Play all chunks sequentially
  const playAll = () => {
    stopAll();
    if (chunksRef.current.length > 0) {
      playChunk(chunksRef.current[0]);
    }
  };

  // Download all chunks as single file
  const downloadAll = () => {
    if (chunks.length === 0) return;
    
    const combinedBlob = new Blob(
      chunks.map(c => c.blob), 
      { type: 'audio/wav' }
    );
    const url = URL.createObjectURL(combinedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chatterbox-streaming-${Date.now()}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Start streaming from the API
  const startStreaming = (params: any) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    
    // Clear previous chunks
    stopAll();
    chunksRef.current = [];
    setChunks([]);
    setError(null);
    setIsStreaming(true);
    setMetrics(null);
    
    // Create query params
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, String(value));
      }
    });
    
    // Use the API URL from environment
    const apiUrl = import.meta.env.VITE_API_URL || 'http://fred.taile5e8a3.ts.net:6093';
    const streamUrl = `${apiUrl}/synthesize-stream?${queryParams.toString()}`;
    
    console.log('Starting streaming from:', streamUrl);
    
    eventSourceRef.current = new EventSource(streamUrl);
    
    eventSourceRef.current.addEventListener('audio_chunk', async (event) => {
      try {
        const chunkData = JSON.parse(event.data);
        await processAudioChunk(chunkData);
      } catch (err) {
        console.error('Error parsing chunk data:', err);
        setError('Failed to parse audio chunk');
      }
    });
    
    eventSourceRef.current.addEventListener('done', (event) => {
      console.log('Streaming complete:', event.data);
      setIsStreaming(false);
      eventSourceRef.current?.close();
    });
    
    eventSourceRef.current.addEventListener('error', (event) => {
      console.error('Streaming error:', event);
      setError('Streaming connection failed');
      setIsStreaming(false);
      eventSourceRef.current?.close();
    });
  };

  // Expose methods via ref
  React.useImperativeHandle(ref, () => ({
    startStreaming
  }), [startStreaming]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      stopAll();
      chunksRef.current.forEach(chunk => {
        if (chunk.audioElement?.src) {
          URL.revokeObjectURL(chunk.audioElement.src);
        }
      });
    };
  }, []);

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const totalDuration = chunks.reduce((sum, chunk) => sum + (chunk.duration || 0), 0);

  return (
    <Card className={cn("p-4 space-y-4", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Streaming Audio Player</h3>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoPlay}
              onChange={(e) => setAutoPlay(e.target.checked)}
              className="rounded"
            />
            Auto-play chunks
          </label>
          {isStreaming && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Streaming...
            </div>
          )}
        </div>
      </div>
      
      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
          {error}
        </div>
      )}
      
      {/* Overall controls */}
      <div className="flex gap-2">
        <Button
          onClick={playAll}
          disabled={chunks.length === 0}
          size="sm"
          variant="default"
        >
          <Play className="w-4 h-4 mr-2" />
          Play All
        </Button>
        
        <Button
          onClick={stopAll}
          disabled={currentlyPlayingId === null}
          size="sm"
          variant="outline"
        >
          <Square className="w-4 h-4 mr-2" />
          Stop
        </Button>
        
        <Button
          onClick={downloadAll}
          disabled={chunks.length === 0}
          size="sm"
          variant="outline"
        >
          <Download className="w-4 h-4 mr-2" />
          Download All
        </Button>
      </div>

      {/* Chunks list */}
      {chunks.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">
            {chunks.length} chunks • Total duration: {formatTime(totalDuration)}
          </div>
          
          <div className="max-h-64 overflow-y-auto space-y-1 border rounded-lg p-2">
            {chunks.map((chunk) => (
              <div
                key={chunk.id}
                className={cn(
                  "flex items-center gap-2 p-2 rounded hover:bg-gray-50",
                  chunk.isPlaying && "bg-blue-50"
                )}
              >
                <Button
                  size="sm"
                  variant={chunk.isPlaying ? "default" : "outline"}
                  className="h-8 w-8 p-0"
                  onClick={() => chunk.isPlaying ? pauseChunk(chunk) : playChunk(chunk)}
                >
                  {chunk.isPlaying ? (
                    <Pause className="w-3 h-3" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                </Button>
                
                <div className="flex-1 text-sm">
                  <div className="font-medium">Chunk {chunk.id}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatTime(chunk.duration)}
                  </div>
                </div>
                
                {chunk.isPlaying && (
                  <Volume2 className="w-4 h-4 text-blue-600 animate-pulse" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 gap-2 text-sm border-t pt-2">
          <div>
            <span className="text-muted-foreground">First Chunk:</span>{' '}
            <span className="font-mono font-bold text-green-600">
              {metrics.first_chunk_latency.toFixed(3)}s
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">RTF:</span>{' '}
            <span className="font-mono">{metrics.rtf.toFixed(3)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Total Latency:</span>{' '}
            <span className="font-mono">{metrics.total_latency.toFixed(3)}s</span>
          </div>
          <div>
            <span className="text-muted-foreground">Chunks:</span>{' '}
            <span className="font-mono">{metrics.chunks_generated}</span>
          </div>
        </div>
      )}
      
    </Card>
  );
});

ChunkStreamingPlayer.displayName = 'ChunkStreamingPlayer';

// Export a hook to get access to the streaming functionality
export function useChunkStreamingPlayer() {
  const playerRef = useRef<any>(null);
  
  const startStreaming = (params: any) => {
    if (playerRef.current?.startStreaming) {
      playerRef.current.startStreaming(params);
    }
  };
  
  return {
    playerRef,
    startStreaming
  };
}