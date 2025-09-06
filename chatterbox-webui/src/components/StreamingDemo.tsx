import React, { useState, useRef } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import { ChunkStreamingPlayer } from './ChunkStreamingPlayer';
import { chatterboxAPI } from '../lib/api';
import type { StreamingMetrics } from '../lib/api';
import { Loader2 } from 'lucide-react';

export function StreamingDemo() {
  const [text, setText] = useState('Welcome to Chatterbox streaming TTS! This demonstrates real-time audio synthesis with low latency.');
  const [isGenerating, setIsGenerating] = useState(false);
  const [useStreaming, setUseStreaming] = useState(true);
  
  // TTS Parameters
  const [exaggeration, setExaggeration] = useState(0.5);
  const [temperature, setTemperature] = useState(0.8);
  const [cfgWeight, setCfgWeight] = useState(0.5);
  const [chunkSize, setChunkSize] = useState(50);
  
  // Metrics
  const [metrics, setMetrics] = useState<StreamingMetrics | null>(null);
  const [regularDuration, setRegularDuration] = useState<number | null>(null);
  
  // Ref to streaming player
  const playerRef = useRef<any>(null);

  const handleGenerate = async () => {
    if (!text.trim()) return;
    
    setIsGenerating(true);
    setMetrics(null);
    setRegularDuration(null);
    
    try {
      if (useStreaming) {
        // Use streaming synthesis with the new player
        if (playerRef.current?.startStreaming) {
          playerRef.current.startStreaming({
            text,
            exaggeration,
            temperature,
            cfg_weight: cfgWeight,
            chunk_size: chunkSize,
          });
        }
      } else {
        // Use regular synthesis for comparison
        const startTime = Date.now();
        const response = await chatterboxAPI.synthesize({
          text,
          exaggeration,
          temperature,
          cfg_weight: cfgWeight,
        });
        
        const endTime = Date.now();
        setRegularDuration((endTime - startTime) / 1000);
        
        if (response.audio_url) {
          // For regular synthesis, we'll just show the metrics
          console.log('Regular synthesis complete:', response);
        }
      }
    } catch (error) {
      console.error('Generation error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-4">Streaming TTS Demo</h2>
        
        <div className="space-y-4">
          {/* Text Input */}
          <div>
            <Label htmlFor="text">Text to synthesize</Label>
            <Textarea
              id="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter text to synthesize..."
              rows={3}
              className="mt-1"
            />
          </div>
          
          {/* Streaming Toggle */}
          <div className="flex items-center space-x-2">
            <Switch
              id="streaming"
              checked={useStreaming}
              onCheckedChange={setUseStreaming}
            />
            <Label htmlFor="streaming">
              Use Streaming (vs Regular Synthesis)
            </Label>
          </div>
          
          {/* Parameters */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Exaggeration: {exaggeration.toFixed(2)}</Label>
              <Slider
                value={[exaggeration]}
                onValueChange={([v]) => setExaggeration(v)}
                min={0.1}
                max={2.0}
                step={0.1}
                className="mt-1"
              />
            </div>
            
            <div>
              <Label>Temperature: {temperature.toFixed(2)}</Label>
              <Slider
                value={[temperature]}
                onValueChange={([v]) => setTemperature(v)}
                min={0.05}
                max={2.0}
                step={0.05}
                className="mt-1"
              />
            </div>
            
            <div>
              <Label>CFG Weight: {cfgWeight.toFixed(2)}</Label>
              <Slider
                value={[cfgWeight]}
                onValueChange={([v]) => setCfgWeight(v)}
                min={0.0}
                max={1.0}
                step={0.1}
                className="mt-1"
              />
            </div>
            
            {useStreaming && (
              <div>
                <Label>Chunk Size: {chunkSize}</Label>
                <Slider
                  value={[chunkSize]}
                  onValueChange={([v]) => setChunkSize(v)}
                  min={10}
                  max={200}
                  step={10}
                  className="mt-1"
                />
              </div>
            )}
          </div>
          
          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !text.trim()}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              `Generate ${useStreaming ? 'Streaming' : 'Regular'} Audio`
            )}
          </Button>
        </div>
      </Card>
      
      {/* Streaming Audio Player */}
      {useStreaming && (
        <ChunkStreamingPlayer
          ref={playerRef}
          onMetricsUpdate={setMetrics}
        />
      )}
      
      {/* Comparison Metrics */}
      {(metrics || regularDuration !== null) && (
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-3">Performance Metrics</h3>
          
          {metrics && (
            <div className="space-y-2">
              <h4 className="font-medium text-green-600">Streaming Synthesis</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">First Chunk Latency:</span>{' '}
                  <span className="font-mono font-bold text-green-600">
                    {metrics.first_chunk_latency.toFixed(3)}s
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Real-time Factor:</span>{' '}
                  <span className="font-mono">{metrics.rtf.toFixed(3)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Duration:</span>{' '}
                  <span className="font-mono">{metrics.total_audio_duration.toFixed(2)}s</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Chunks Generated:</span>{' '}
                  <span className="font-mono">{metrics.chunks_generated}</span>
                </div>
              </div>
            </div>
          )}
          
          {regularDuration !== null && (
            <div className="space-y-2 mt-4">
              <h4 className="font-medium text-blue-600">Regular Synthesis</h4>
              <div className="text-sm">
                <span className="text-muted-foreground">Total Latency:</span>{' '}
                <span className="font-mono font-bold text-blue-600">
                  {regularDuration.toFixed(3)}s
                </span>
              </div>
            </div>
          )}
          
          {metrics && regularDuration !== null && (
            <div className="mt-4 p-3 bg-gray-50 rounded-md">
              <p className="text-sm font-medium">
                Streaming is{' '}
                <span className="text-green-600">
                  {(regularDuration / metrics.first_chunk_latency).toFixed(1)}x faster
                </span>{' '}
                to first audio output!
              </p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}