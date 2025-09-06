import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AudiobookVoiceProfile, AudiobookProject } from '@/lib/audiobookApi';
import { 
  Mic, 
  Save, 
  Upload,
  Trash2,
  Play,
  FolderOpen,
  Clock,
  FileText
} from 'lucide-react';

interface VoiceSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voice: AudiobookVoiceProfile | null;
  onSave: (voice: AudiobookVoiceProfile) => void;
  mode?: 'single' | 'multi';
}

export function VoiceSettingsDialog({ 
  open, 
  onOpenChange, 
  voice, 
  onSave,
  mode = 'single' 
}: VoiceSettingsDialogProps) {
  const [editingVoice, setEditingVoice] = useState<AudiobookVoiceProfile | null>(null);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);

  React.useEffect(() => {
    if (voice) {
      setEditingVoice({ ...voice });
      // Reset voice file when opening dialog
      setVoiceFile(voice.voice_file instanceof File ? voice.voice_file : null);
    }
  }, [voice]);

  const handleSave = () => {
    if (editingVoice) {
      // Add voice file to the voice object
      const voiceToSave = {
        ...editingVoice,
        voice_file: voiceFile || editingVoice.voice_file || undefined
      };
      
      console.log('Saving voice with file:', voiceFile);
      
      // Call onSave with the edited voice including file
      onSave(voiceToSave);
    }
  };

  if (!editingVoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Voice Settings</DialogTitle>
          <DialogDescription>
            Configure voice parameters for {editingVoice.name}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="voice-name">Voice Name</Label>
              <Input
                id="voice-name"
                value={editingVoice.name}
                onChange={(e) => setEditingVoice({
                  ...editingVoice,
                  name: e.target.value
                })}
                placeholder="e.g., Narrator, Character Name"
              />
            </div>
            
            {mode === 'multi' && (
              <div className="space-y-2">
                <Label htmlFor="character-name">Character Name</Label>
                <Input
                  id="character-name"
                  value={editingVoice.character || ''}
                  onChange={(e) => setEditingVoice({
                    ...editingVoice,
                    character: e.target.value
                  })}
                  placeholder="Character name for dialogue matching"
                />
                <p className="text-xs text-muted-foreground">
                  This name will be matched in the text (e.g., "John:" will use this voice)
                </p>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="voice-file">Voice Reference (Optional)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="voice-file"
                  type="file"
                  accept="audio/*"
                  onChange={(e) => setVoiceFile(e.target.files?.[0] || null)}
                  className="flex-1"
                />
                {voiceFile && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setVoiceFile(null)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Upload a 10-30 second audio sample for voice cloning
              </p>
            </div>
          </div>

          {/* Voice Parameters */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Voice Parameters</h4>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Exaggeration</Label>
                  <span className="text-xs text-muted-foreground">
                    {editingVoice.exaggeration.toFixed(1)}
                  </span>
                </div>
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
                <p className="text-xs text-muted-foreground">
                  How much to emphasize voice characteristics
                </p>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Temperature</Label>
                  <span className="text-xs text-muted-foreground">
                    {editingVoice.temperature.toFixed(2)}
                  </span>
                </div>
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
                <p className="text-xs text-muted-foreground">
                  Randomness in voice generation
                </p>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Speed Rate</Label>
                  <span className="text-xs text-muted-foreground">
                    {editingVoice.speed_rate.toFixed(1)}x
                  </span>
                </div>
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
                <p className="text-xs text-muted-foreground">
                  Speaking speed multiplier
                </p>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>CFG Weight</Label>
                  <span className="text-xs text-muted-foreground">
                    {editingVoice.cfg_weight.toFixed(1)}
                  </span>
                </div>
                <Slider
                  value={[editingVoice.cfg_weight]}
                  onValueChange={([value]) => setEditingVoice({
                    ...editingVoice,
                    cfg_weight: value
                  })}
                  min={0}
                  max={1}
                  step={0.1}
                />
                <p className="text-xs text-muted-foreground">
                  Classifier-free guidance strength
                </p>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Min P</Label>
                  <span className="text-xs text-muted-foreground">
                    {editingVoice.min_p.toFixed(2)}
                  </span>
                </div>
                <Slider
                  value={[editingVoice.min_p]}
                  onValueChange={([value]) => setEditingVoice({
                    ...editingVoice,
                    min_p: value
                  })}
                  min={0}
                  max={1}
                  step={0.05}
                />
                <p className="text-xs text-muted-foreground">
                  Minimum probability threshold
                </p>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Repetition Penalty</Label>
                  <span className="text-xs text-muted-foreground">
                    {editingVoice.repetition_penalty.toFixed(1)}
                  </span>
                </div>
                <Slider
                  value={[editingVoice.repetition_penalty]}
                  onValueChange={([value]) => setEditingVoice({
                    ...editingVoice,
                    repetition_penalty: value
                  })}
                  min={1}
                  max={2}
                  step={0.1}
                />
                <p className="text-xs text-muted-foreground">
                  Penalty for repeated patterns
                </p>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="voice-seed">Seed (Optional)</Label>
              <Input
                id="voice-seed"
                type="number"
                value={editingVoice.seed || ''}
                onChange={(e) => setEditingVoice({
                  ...editingVoice,
                  seed: e.target.value ? parseInt(e.target.value) : undefined
                })}
                placeholder="Random seed for consistent generation"
              />
              <p className="text-xs text-muted-foreground">
                Use the same seed to get consistent voice output
              </p>
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" />
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ProjectManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: AudiobookProject[];
  onLoad: (project: AudiobookProject) => void;
  onSave: () => void;
}

export function ProjectManagementDialog({
  open,
  onOpenChange,
  projects,
  onLoad,
  onSave
}: ProjectManagementDialogProps) {
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Project Management</DialogTitle>
          <DialogDescription>
            Save your current project or load a previous one
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Button onClick={onSave} className="w-full">
              <Save className="mr-2 h-4 w-4" />
              Save Current Project
            </Button>
          </div>
          
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Recent Projects</h4>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {projects.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FolderOpen className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No saved projects yet</p>
                </div>
              ) : (
                projects.map((project) => (
                  <div
                    key={project.id}
                    className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                      selectedProject === project.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedProject(project.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h5 className="font-medium">{project.name}</h5>
                        <p className="text-sm text-muted-foreground mt-1">
                          {project.chunks.length} chunks • {
                            (project.metadata.total_duration / 60).toFixed(1)
                          } minutes
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Created: {new Date(project.metadata.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {project.voices.length} {project.voices.length === 1 ? 'voice' : 'voices'}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const project = projects.find(p => p.id === selectedProject);
              if (project) {
                onLoad(project);
                onOpenChange(false);
              }
            }}
            disabled={!selectedProject}
          >
            <Upload className="mr-2 h-4 w-4" />
            Load Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface VoiceLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voices: AudiobookVoiceProfile[];
  onSelect: (voice: AudiobookVoiceProfile) => void;
}

export function VoiceLibraryDialog({
  open,
  onOpenChange,
  voices,
  onSelect
}: VoiceLibraryDialogProps) {
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);
  const [previewVoice, setPreviewVoice] = useState<AudiobookVoiceProfile | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Voice Library</DialogTitle>
          <DialogDescription>
            Select a voice profile from your library
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4 md:grid-cols-2">
          {/* Voice List */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium mb-2">Saved Voices</h4>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {voices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Mic className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No voices in library</p>
                  <p className="text-xs mt-1">Save voices from your projects</p>
                </div>
              ) : (
                voices.map((voice) => (
                  <div
                    key={voice.voice_id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedVoice === voice.voice_id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'
                    }`}
                    onClick={() => {
                      setSelectedVoice(voice.voice_id);
                      setPreviewVoice(voice);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{voice.name}</p>
                        {voice.character && (
                          <p className="text-xs text-muted-foreground">
                            Character: {voice.character}
                          </p>
                        )}
                      </div>
                      <Mic className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          
          {/* Voice Preview */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Voice Details</h4>
            {previewVoice ? (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-sm font-medium">{previewVoice.name}</p>
                  {previewVoice.character && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Character: {previewVoice.character}
                    </p>
                  )}
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Speed:</span>
                    <span>{previewVoice.speed_rate}x</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Temperature:</span>
                    <span>{previewVoice.temperature}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Exaggeration:</span>
                    <span>{previewVoice.exaggeration}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CFG Weight:</span>
                    <span>{previewVoice.cfg_weight}</span>
                  </div>
                  {previewVoice.seed && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Seed:</span>
                      <span>{previewVoice.seed}</span>
                    </div>
                  )}
                </div>
                
                <div className="pt-4 space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Preview Voice (Coming Soon)
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-muted/50 rounded-lg text-center text-muted-foreground">
                Select a voice to see details
              </div>
            )}
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (previewVoice) {
                onSelect(previewVoice);
                onOpenChange(false);
              }
            }}
            disabled={!selectedVoice}
          >
            <Upload className="mr-2 h-4 w-4" />
            Use This Voice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}