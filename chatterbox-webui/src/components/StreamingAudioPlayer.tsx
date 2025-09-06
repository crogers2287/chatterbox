import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Play, Pause, Download, Loader2 } from 'lucide-react';

interface StreamingMetrics {
  first_chunk_latency: number;
  total_latency: number;
  rtf: number;
  total_audio_duration: number;
  chunks_generated: number;
}

interface AudioChunkData {
  chunk_id: number;
  audio_chunk: string; // base64 encoded
  sample_rate: number;
  metrics: StreamingMetrics;
}

interface StreamingAudioPlayerProps {
  streamUrl?: string;
  onMetricsUpdate?: (metrics: StreamingMetrics) => void;
  autoPlay?: boolean;
}

export function StreamingAudioPlayer({ 
  streamUrl, 
  onMetricsUpdate,
  autoPlay = true 
}: StreamingAudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [metrics, setMetrics] = useState<StreamingMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceBufferRef = useRef<MediaSourceBuffer | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const nextStartTimeRef = useRef(0);

  // Initialize Web Audio API
  const initializeAudio = useCallback(async () => {
    try {
      // Create audio context if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      // Create audio element
      if (!audioElementRef.current) {
        audioElementRef.current = new Audio();
        audioElementRef.current.addEventListener('timeupdate', () => {
          setCurrentTime(audioElementRef.current!.currentTime);
        });
        audioElementRef.current.addEventListener('loadedmetadata', () => {
          setDuration(audioElementRef.current!.duration);
        });
      }

      // For streaming, we'll use MediaSource API
      if ('MediaSource' in window && MediaSource.isTypeSupported('audio/webm; codecs="opus"')) {
        mediaSourceRef.current = new MediaSource();
        audioElementRef.current.src = URL.createObjectURL(mediaSourceRef.current);
        
        mediaSourceRef.current.addEventListener('sourceopen', () => {
          sourceBufferRef.current = mediaSourceRef.current!.addSourceBuffer('audio/webm; codecs="opus"');
        });
      }
    } catch (err) {
      console.error('Failed to initialize audio:', err);
      setError('Failed to initialize audio player');
    }
  }, []);

  // Process incoming audio chunk
  const processAudioChunk = useCallback(async (chunkData: AudioChunkData) => {
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
      audioChunksRef.current.push(blob);
      
      // Update metrics
      setMetrics(chunkData.metrics);
      if (onMetricsUpdate) {
        onMetricsUpdate(chunkData.metrics);
      }
      
      // For simple implementation, concatenate all chunks and play
      // In production, you'd want to use MediaSource API for true streaming
      if (audioChunksRef.current.length === 1 && autoPlay) {
        // Start playing after first chunk
        playAudio();
      }
      
    } catch (err) {
      console.error('Error processing audio chunk:', err);
      setError('Failed to process audio chunk');
    }
  }, [autoPlay, onMetricsUpdate]);

  // Play concatenated audio
  const playAudio = useCallback(async () => {
    if (!audioElementRef.current || audioChunksRef.current.length === 0) return;
    
    try {
      // Create a single blob from all chunks
      const combinedBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(combinedBlob);
      
      audioElementRef.current.src = audioUrl;
      await audioElementRef.current.play();
      setIsPlaying(true);
      
      // Clean up old URL
      audioElementRef.current.addEventListener('ended', () => {
        URL.revokeObjectURL(audioUrl);
        setIsPlaying(false);
      }, { once: true });
      
    } catch (err) {
      console.error('Error playing audio:', err);
      setError('Failed to play audio');
    }
  }, []);

  // Start streaming
  const startStreaming = useCallback((url: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    
    setError(null);
    setIsBuffering(true);
    audioChunksRef.current = [];
    
    eventSourceRef.current = new EventSource(url);
    
    eventSourceRef.current.addEventListener('audio_chunk', (event) => {
      try {
        const chunkData: AudioChunkData = JSON.parse(event.data);
        processAudioChunk(chunkData);
        setIsBuffering(false);
      } catch (err) {
        console.error('Error parsing chunk data:', err);
      }
    });
    
    eventSourceRef.current.addEventListener('done', (event) => {
      console.log('Streaming complete:', event.data);
      setIsBuffering(false);
      eventSourceRef.current?.close();
    });
    
    eventSourceRef.current.addEventListener('error', (event) => {
      console.error('Streaming error:', event);
      setError('Streaming error occurred');
      setIsBuffering(false);
      eventSourceRef.current?.close();
    });
  }, [processAudioChunk]);

  // Effect to start streaming when URL is provided
  useEffect(() => {
    if (streamUrl) {
      initializeAudio().then(() => {
        startStreaming(streamUrl);
      });
    }
    
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
    };
  }, [streamUrl, initializeAudio, startStreaming]);

  // Playback controls
  const togglePlayPause = () => {
    if (!audioElementRef.current) return;
    
    if (isPlaying) {
      audioElementRef.current.pause();
      setIsPlaying(false);
    } else {
      audioElementRef.current.play();
      setIsPlaying(true);
    }
  };

  const downloadAudio = () => {
    if (audioChunksRef.current.length === 0) return;
    
    const combinedBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
    const url = URL.createObjectURL(combinedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `streaming-audio-${Date.now()}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Streaming Audio Player</h3>
        {isBuffering && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Buffering...
          </div>
        )}
      </div>
      
      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
          {error}
        </div>
      )}
      
      {metrics && (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">First Chunk:</span>{' '}
            <span className="font-mono">{metrics.first_chunk_latency.toFixed(3)}s</span>
          </div>
          <div>
            <span className="text-muted-foreground">RTF:</span>{' '}
            <span className="font-mono">{metrics.rtf.toFixed(3)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Chunks:</span>{' '}
            <span className="font-mono">{metrics.chunks_generated}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Duration:</span>{' '}
            <span className="font-mono">{metrics.total_audio_duration.toFixed(2)}s</span>
          </div>
        </div>
      )}
      
      <div className="space-y-2">
        <Progress 
          value={(currentTime / duration) * 100 || 0} 
          className="h-2"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      
      <div className="flex gap-2">
        <Button
          onClick={togglePlayPause}
          disabled={audioChunksRef.current.length === 0}
          size="sm"
        >
          {isPlaying ? (
            <><Pause className="w-4 h-4 mr-2" /> Pause</>
          ) : (
            <><Play className="w-4 h-4 mr-2" /> Play</>
          )}
        </Button>
        
        <Button
          onClick={downloadAudio}
          disabled={audioChunksRef.current.length === 0}
          variant="outline"
          size="sm"
        >
          <Download className="w-4 h-4 mr-2" />
          Download
        </Button>
      </div>
    </Card>
  );
}