import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useStore } from '@/lib/store';
import { Save, Trash2, Copy, Mic, Check, RefreshCw } from 'lucide-react';

export function SavedVoices() {
  const { 
    savedVoices, 
    saveVoice, 
    loadVoice, 
    deleteVoice,
    loadVoicesFromServer,
    parameters,
    voiceReference 
  } = useStore();
  
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [voiceName, setVoiceName] = useState('');
  const [activeVoiceId, setActiveVoiceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load voices from server on component mount
  useEffect(() => {
    loadVoicesFromServer();
  }, [loadVoicesFromServer]);

  const handleRefresh = async () => {
    setIsLoading(true);
    await loadVoicesFromServer();
    setIsLoading(false);
  };

  const handleSave = async () => {
    if (voiceName.trim()) {
      console.log('[SavedVoices] Saving voice:', voiceName.trim());
      console.log('[SavedVoices] Current parameters:', parameters);
      console.log('[SavedVoices] Voice reference:', voiceReference);
      await saveVoice(voiceName.trim());
      console.log('[SavedVoices] Voice saved successfully');
      setVoiceName('');
      setSaveDialogOpen(false);
    }
  };

  const copySeedToClipboard = (seed: number | null) => {
    if (seed !== null) {
      navigator.clipboard.writeText(seed.toString());
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Saved Voices</CardTitle>
            <CardDescription>
              Global voices shared across all users
            </CardDescription>
          </div>
          
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleRefresh} disabled={isLoading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            
            <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Save className="mr-2 h-4 w-4" />
                  Save Current
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Save Voice Configuration</DialogTitle>
                  <DialogDescription>
                    Save the current parameters and seed for later use
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Input
                    placeholder="Voice name..."
                    value={voiceName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVoiceName(e.target.value)}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleSave()}
                  />
                  <p className="text-sm text-muted-foreground mt-2">
                    {parameters.seed ? (
                      <>Seed: {parameters.seed}</>
                    ) : (
                      <>A random seed will be generated to ensure voice consistency</>
                    )}
                  </p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={!voiceName.trim()}>
                    Save Voice
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {savedVoices.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No saved voices yet.</p>
            <p className="text-sm mt-1">Save your current settings to reuse them later.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {savedVoices.map((voice) => {
              const isActive = activeVoiceId === voice.id;
              
              return (
                <div
                  key={voice.id}
                  className={`
                    flex items-center justify-between p-3 rounded-lg cursor-pointer
                    transition-all duration-200 hover:scale-[1.02]
                    ${isActive 
                      ? 'bg-primary text-primary-foreground ring-2 ring-primary' 
                      : 'bg-muted/50 hover:bg-muted'
                    }
                  `}
                  onClick={async () => {
                    console.log('[SavedVoices] Activating voice:', voice.name, voice.id);
                    await loadVoice(voice.id);
                    setActiveVoiceId(voice.id);
                    console.log('[SavedVoices] Voice activated');
                  }}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{voice.name}</p>
                      {isActive && (
                        <Check className="h-4 w-4" />
                      )}
                      {(voice.voiceReferenceData || voice.voiceReferenceUrl) && (
                        <span title="Voice sample included">
                          <Mic className={`h-3 w-3 ${isActive ? 'text-primary-foreground' : 'text-primary'}`} />
                        </span>
                      )}
                    </div>
                    <div className={`flex items-center gap-4 text-xs mt-1 ${isActive ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                      {voice.parameters && voice.parameters.seed !== null && voice.parameters.seed !== undefined && (
                        <span className="flex items-center gap-1">
                          Seed: {voice.parameters.seed}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              copySeedToClipboard(voice.parameters.seed);
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </span>
                      )}
                      {voice.parameters && (
                        <>
                          <span>Temp: {voice.parameters.temperature}</span>
                          <span>Exag: {voice.parameters.exaggeration}</span>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Button
                      variant={isActive ? "secondary" : "ghost"}
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteVoice(voice.id);
                        if (isActive) setActiveVoiceId(null);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}