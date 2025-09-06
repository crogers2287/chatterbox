import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStore } from '@/lib/store';
import { RefreshCw, Zap, Cpu, Sparkles } from 'lucide-react';

interface ParameterSliderProps {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function ParameterSlider({ label, description, value, min, max, step, onChange }: ParameterSliderProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <span className="text-sm text-muted-foreground">{value.toFixed(2)}</span>
      </div>
      <Slider
        value={[value]}
        onValueChange={(values) => onChange(values[0])}
        min={min}
        max={max}
        step={step}
        className="w-full"
      />
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

export function TTSParameters() {
  const { parameters, updateParameters, useStreaming, setUseStreaming, ttsEngine, setTTSEngine } = useStore();

  return (
    <Card>
      <CardHeader>
        <CardTitle>TTS Parameters</CardTitle>
        <CardDescription>
          Adjust voice synthesis parameters to control output quality
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">TTS Engine</label>
          <Select value={ttsEngine || 'chatterbox'} onValueChange={setTTSEngine}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select TTS engine" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="chatterbox">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  <span>Chatterbox (GPU)</span>
                </div>
              </SelectItem>
              <SelectItem value="vibevoice">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  <span>Microsoft VibeVoice</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Choose between Chatterbox (high-quality, GPU-accelerated) or VibeVoice (fast, CPU-based)
          </p>
        </div>
        
        <ParameterSlider
          label="Exaggeration"
          description="Controls the emotional intensity and expressiveness of the voice"
          value={parameters.exaggeration}
          min={0.1}
          max={2.0}
          step={0.1}
          onChange={(value) => updateParameters({ exaggeration: value })}
        />

        <ParameterSlider
          label="Temperature"
          description="Controls randomness in generation (higher = more varied)"
          value={parameters.temperature}
          min={0.05}
          max={5.0}
          step={0.05}
          onChange={(value) => updateParameters({ temperature: value })}
        />

        <ParameterSlider
          label="CFG Weight"
          description="Classifier-free guidance weight for voice similarity"
          value={parameters.cfg_weight}
          min={0.0}
          max={1.0}
          step={0.05}
          onChange={(value) => updateParameters({ cfg_weight: value })}
        />

        <ParameterSlider
          label="Min P"
          description="Minimum probability threshold for token selection"
          value={parameters.min_p}
          min={0.0}
          max={1.0}
          step={0.01}
          onChange={(value) => updateParameters({ min_p: value })}
        />

        <ParameterSlider
          label="Top P"
          description="Cumulative probability threshold for nucleus sampling"
          value={parameters.top_p}
          min={0.0}
          max={1.0}
          step={0.05}
          onChange={(value) => updateParameters({ top_p: value })}
        />

        <ParameterSlider
          label="Repetition Penalty"
          description="Penalty for repeating tokens (reduces repetition)"
          value={parameters.repetition_penalty}
          min={1.0}
          max={2.0}
          step={0.05}
          onChange={(value) => updateParameters({ repetition_penalty: value })}
        />

        <ParameterSlider
          label="Speech Rate"
          description="Speed of speech (0.5x = slower, 2.0x = faster)"
          value={parameters.speech_rate}
          min={0.5}
          max={2.0}
          step={0.1}
          onChange={(value) => updateParameters({ speech_rate: value })}
        />

        <div className="pt-4 border-t space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Streaming Mode</label>
                <Zap className="h-4 w-4 text-yellow-500" />
              </div>
              <p className="text-xs text-muted-foreground">
                Enable real-time audio streaming for faster response
              </p>
            </div>
            <Switch
              checked={useStreaming}
              onCheckedChange={setUseStreaming}
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Random Seed</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={parameters.seed !== null && parameters.seed !== undefined ? parameters.seed : ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const value = e.target.value ? parseInt(e.target.value) : null;
                  updateParameters({ seed: value });
                }}
                placeholder="Random"
                className="flex-1"
              />
              <Button
                size="icon"
                variant="outline"
                onClick={() => {
                  const randomSeed = Math.floor(Math.random() * 999999) + 1;
                  updateParameters({ seed: randomSeed });
                }}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Set a seed for reproducible results (leave empty for random)
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}