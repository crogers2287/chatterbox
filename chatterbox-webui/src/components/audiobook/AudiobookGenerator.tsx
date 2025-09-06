import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { audiobookAPI } from '@/lib/audiobookApi';
import type { AudiobookVoiceProfile, AudiobookChunk } from '@/lib/audiobookApi';
import { 
  BookOpen, 
  Mic, 
  Plus, 
  Trash2, 
  Play, 
  Pause,
  RotateCw,
  Download,
  Save,
  Upload,
  Volume2,
  Settings
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function AudiobookGenerator() {
  const [mode, setMode] = useState<'single' | 'multi'>('single');
  const [text, setText] = useState('');
  const [voices, setVoices] = useState<AudiobookVoiceProfile[]>([
    {
      voice_id: '1',
      name: 'Narrator',
      character: 'Narrator',
      exaggeration: 0.5,
      temperature: 0.8,
      cfg_weight: 0.5,
      min_p: 0.05,
      top_p: 1.0,
      repetition_penalty: 1.2,
      speed_rate: 1.0,
      seed: undefined,
    }
  ]);
  const [chunks, setChunks] = useState<AudiobookChunk[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [showVoiceDialog, setShowVoiceDialog] = useState(false);
  const [editingVoice, setEditingVoice] = useState<AudiobookVoiceProfile | null>(null);

  // Audiobook settings
  const [settings, setSettings] = useState({
    volume_normalization: true,
    target_db: -18,
    pause_duration: 0.1,
    chunk_size: 500,
  });

  const addVoice = () => {
    const newVoice: AudiobookVoiceProfile = {
      voice_id: `${Date.now()}`,
      name: `Voice ${voices.length + 1}`,
      character: `Character ${voices.length + 1}`,
      exaggeration: 0.5,
      temperature: 0.8,
      cfg_weight: 0.5,
      min_p: 0.05,
      top_p: 1.0,
      repetition_penalty: 1.2,
      speed_rate: 1.0,
      seed: undefined,
    };
    setVoices([...voices, newVoice]);
    setEditingVoice(newVoice);
    setShowVoiceDialog(true);
  };

  const updateVoice = (voiceId: string, updates: Partial<AudiobookVoiceProfile>) => {
    setVoices(voices.map(v => 
      v.voice_id === voiceId ? { ...v, ...updates } : v
    ));
  };

  const deleteVoice = (voiceId: string) => {
    if (voices.length > 1) {
      setVoices(voices.filter(v => v.voice_id !== voiceId));
    }
  };

  const generateAudiobook = async () => {
    if (!text.trim()) return;

    setIsGenerating(true);
    try {
      const response = await audiobookAPI.generateAudiobook({
        text,
        mode,
        voices,
        settings,
      });

      setCurrentProjectId(response.project_id);
      setChunks(response.chunks);
    } catch (error) {
      console.error('Failed to generate audiobook:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const regenerateChunk = async (chunkId: string) => {
    if (!currentProjectId) return;

    try {
      const updatedChunk = await audiobookAPI.regenerateChunk(
        currentProjectId,
        chunkId
      );
      
      setChunks(chunks.map(c => 
        c.id === chunkId ? updatedChunk : c
      ));
    } catch (error) {
      console.error('Failed to regenerate chunk:', error);
    }
  };

  const exportAudiobook = async () => {
    if (!currentProjectId) return;

    try {
      const result = await audiobookAPI.exportAudiobook(currentProjectId, 'mp3');
      
      // Download the file
      const a = document.createElement('a');
      a.href = result.download_url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to export audiobook:', error);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <BookOpen className="h-8 w-8" />
          Audiobook Generator
        </h1>
        <p className="text-muted-foreground">
          Create professional audiobooks with multiple voices and intelligent pause insertion
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Input Section */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Text Input</CardTitle>
              <CardDescription>
                Enter your audiobook text. Use character names followed by colons for multi-voice mode.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Enter your text here... For multi-voice, use format like 'Character: dialogue'"
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="min-h-[300px] font-mono"
              />
              
              <div className="mt-4 flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label>Mode:</Label>
                  <Tabs value={mode} onValueChange={(v) => setMode(v as 'single' | 'multi')}>
                    <TabsList>
                      <TabsTrigger value="single">Single Voice</TabsTrigger>
                      <TabsTrigger value="multi">Multi Voice</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                
                <Button
                  onClick={generateAudiobook}
                  disabled={isGenerating || !text.trim()}
                  className="ml-auto"
                >
                  {isGenerating ? (
                    <>Generating...</>
                  ) : (
                    <>
                      <BookOpen className="mr-2 h-4 w-4" />
                      Generate Audiobook
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Chunks Display */}
          {chunks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Generated Chunks</CardTitle>
                <CardDescription>
                  {chunks.length} chunks generated
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {chunks.map((chunk, index) => (
                    <div key={chunk.id} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          Chunk {index + 1} {chunk.character && `(${chunk.character})`}
                        </p>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {chunk.text}
                        </p>
                        {chunk.duration && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Duration: {chunk.duration.toFixed(1)}s
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {chunk.audio_url && (
                          <Button variant="ghost" size="icon">
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => regenerateChunk(chunk.id)}
                          disabled={chunk.status === 'generating'}
                        >
                          <RotateCw className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                
                {chunks.every(c => c.status === 'completed') && (
                  <Button onClick={exportAudiobook} className="w-full mt-4">
                    <Download className="mr-2 h-4 w-4" />
                    Export Audiobook
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Voice & Settings Section */}
        <div className="space-y-6">
          {/* Voice Profiles */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Voice Profiles</CardTitle>
                <Button size="sm" onClick={addVoice}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Voice
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {voices.map((voice) => (
                  <div
                    key={voice.voice_id}
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{voice.name}</p>
                      {voice.character && (
                        <p className="text-sm text-muted-foreground">
                          Character: {voice.character}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingVoice(voice);
                          setShowVoiceDialog(true);
                        }}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      {voices.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteVoice(voice.voice_id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Audiobook Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Audiobook Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Volume Normalization</Label>
                  <input
                    type="checkbox"
                    checked={settings.volume_normalization}
                    onChange={(e) => setSettings({
                      ...settings,
                      volume_normalization: e.target.checked
                    })}
                    className="h-4 w-4"
                  />
                </div>
              </div>
              
              {settings.volume_normalization && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Target Volume (dB)</Label>
                    <span className="text-sm text-muted-foreground">
                      {settings.target_db} dB
                    </span>
                  </div>
                  <Slider
                    value={[settings.target_db]}
                    onValueChange={([value]) => setSettings({
                      ...settings,
                      target_db: value
                    })}
                    min={-30}
                    max={0}
                    step={1}
                  />
                </div>
              )}
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Pause Duration (per line break)</Label>
                  <span className="text-sm text-muted-foreground">
                    {settings.pause_duration}s
                  </span>
                </div>
                <Slider
                  value={[settings.pause_duration]}
                  onValueChange={([value]) => setSettings({
                    ...settings,
                    pause_duration: value
                  })}
                  min={0}
                  max={2}
                  step={0.1}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Chunk Size (characters)</Label>
                <Input
                  type="number"
                  value={settings.chunk_size}
                  onChange={(e) => setSettings({
                    ...settings,
                    chunk_size: parseInt(e.target.value)
                  })}
                  min={100}
                  max={2000}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Voice Settings Dialog */}
      <Dialog open={showVoiceDialog} onOpenChange={setShowVoiceDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Voice Settings</DialogTitle>
            <DialogDescription>
              Configure voice parameters for {editingVoice?.name}
            </DialogDescription>
          </DialogHeader>
          
          {editingVoice && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Voice Name</Label>
                <Input
                  value={editingVoice.name}
                  onChange={(e) => setEditingVoice({
                    ...editingVoice,
                    name: e.target.value
                  })}
                />
              </div>
              
              {mode === 'multi' && (
                <div className="space-y-2">
                  <Label>Character Name</Label>
                  <Input
                    value={editingVoice.character || ''}
                    onChange={(e) => setEditingVoice({
                      ...editingVoice,
                      character: e.target.value
                    })}
                    placeholder="Character name for dialogue matching"
                  />
                </div>
              )}
              
              <div className="space-y-2">
                <Label>Voice Reference</Label>
                <Input type="file" accept="audio/*" />
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Exaggeration ({editingVoice.exaggeration})</Label>
                  <Slider
                    value={[editingVoice.exaggeration]}
                    onValueChange={([value]) => setEditingVoice({
                      ...editingVoice,
                      exaggeration: value
                    })}
                    min={0.1}
                    max={2}
                    step={0.1}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Temperature ({editingVoice.temperature})</Label>
                  <Slider
                    value={[editingVoice.temperature]}
                    onValueChange={([value]) => setEditingVoice({
                      ...editingVoice,
                      temperature: value
                    })}
                    min={0.05}
                    max={5}
                    step={0.05}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Speed Rate ({editingVoice.speed_rate})</Label>
                  <Slider
                    value={[editingVoice.speed_rate]}
                    onValueChange={([value]) => setEditingVoice({
                      ...editingVoice,
                      speed_rate: value
                    })}
                    min={0.5}
                    max={2}
                    step={0.1}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Seed (optional)</Label>
                  <Input
                    type="number"
                    value={editingVoice.seed || ''}
                    onChange={(e) => setEditingVoice({
                      ...editingVoice,
                      seed: e.target.value ? parseInt(e.target.value) : undefined
                    })}
                    placeholder="Random seed"
                  />
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVoiceDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              if (editingVoice) {
                updateVoice(editingVoice.voice_id, editingVoice);
                setShowVoiceDialog(false);
              }
            }}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}