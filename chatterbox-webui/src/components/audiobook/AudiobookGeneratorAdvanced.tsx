import React, { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { audiobookAPI } from '@/lib/audiobookApi';
import type { AudiobookVoiceProfile, AudiobookChunk, AudiobookProject } from '@/lib/audiobookApi';
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
  Settings,
  FileText,
  FolderOpen,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  FileUp,
  Files,
  ChevronRight,
  History,
  Zap,
  Edit3
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ReactMarkdown from 'react-markdown';
import { 
  VoiceSettingsDialog,
  ProjectManagementDialog,
  VoiceLibraryDialog
} from './AudiobookDialogs';

interface BatchFile {
  id: string;
  name: string;
  content: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  chunks?: AudiobookChunk[];
  error?: string;
}

interface ProcessingStats {
  totalFiles: number;
  processedFiles: number;
  totalChunks: number;
  processedChunks: number;
  totalDuration: number;
  estimatedTimeRemaining: number;
}

export function AudiobookGeneratorAdvanced() {
  const [mode, setMode] = useState<'single' | 'multi' | 'batch'>('single');
  const [text, setText] = useState('');
  const [markdownPreview, setMarkdownPreview] = useState(false);
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
  const [savedProjects, setSavedProjects] = useState<AudiobookProject[]>([]);
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  
  // Batch processing state
  const [batchFiles, setBatchFiles] = useState<BatchFile[]>([]);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [processingStats, setProcessingStats] = useState<ProcessingStats>({
    totalFiles: 0,
    processedFiles: 0,
    totalChunks: 0,
    processedChunks: 0,
    totalDuration: 0,
    estimatedTimeRemaining: 0,
  });

  // Voice library
  const [voiceLibrary, setVoiceLibrary] = useState<AudiobookVoiceProfile[]>([]);
  const [showVoiceLibrary, setShowVoiceLibrary] = useState(false);

  // File upload refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchInputRef = useRef<HTMLInputElement>(null);

  // Audiobook settings
  const [settings, setSettings] = useState({
    volume_normalization: true,
    target_db: -18,
    pause_duration: 0.1,
    chunk_size: 500,
    auto_split_chapters: true,
    chapter_pattern: /^(Chapter|CHAPTER|Act|ACT|Part|PART)\s+\d+/m,
    remove_annotations: true,
    preserve_formatting: true,
    voice_assignment_mode: 'auto', // auto, manual, round-robin
  });

  // Character detection for multi-voice
  const detectCharacters = (text: string): string[] => {
    const characterPattern = /^([A-Z][A-Z\s]+):/gm;
    const matches = text.match(characterPattern);
    if (!matches) return [];
    
    const characters = [...new Set(matches.map(m => m.replace(':', '').trim()))];
    return characters;
  };

  // Auto-assign voices to characters
  const autoAssignVoices = (characters: string[]) => {
    const newVoices = characters.map((char, index) => ({
      voice_id: `${Date.now()}-${index}`,
      name: `${char} Voice`,
      character: char,
      exaggeration: 0.5 + (index * 0.1),
      temperature: 0.8,
      cfg_weight: 0.5,
      min_p: 0.05,
      top_p: 1.0,
      repetition_penalty: 1.2,
      speed_rate: 1.0,
      seed: undefined,
    }));
    setVoices(newVoices);
  };

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setText(content);
      
      if (mode === 'multi') {
        const detectedCharacters = detectCharacters(content);
        if (detectedCharacters.length > 0) {
          autoAssignVoices(detectedCharacters);
        }
      }
    };
    reader.readAsText(file);
  };

  // Handle batch file upload
  const handleBatchUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newBatchFiles: BatchFile[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const content = await file.text();
      
      newBatchFiles.push({
        id: `${Date.now()}-${i}`,
        name: file.name,
        content,
        status: 'pending',
      });
    }
    
    setBatchFiles([...batchFiles, ...newBatchFiles]);
  };

  // Process batch files
  const processBatchFiles = async () => {
    setBatchProcessing(true);
    setProcessingStats({
      totalFiles: batchFiles.length,
      processedFiles: 0,
      totalChunks: 0,
      processedChunks: 0,
      totalDuration: 0,
      estimatedTimeRemaining: 0,
    });

    for (let i = 0; i < batchFiles.length; i++) {
      const file = batchFiles[i];
      
      setBatchFiles(prev => prev.map(f => 
        f.id === file.id ? { ...f, status: 'processing' } : f
      ));

      try {
        const response = await audiobookAPI.generateAudiobook({
          text: file.content,
          mode: mode === 'batch' ? 'single' : mode,
          voices,
          settings,
        });

        setBatchFiles(prev => prev.map(f => 
          f.id === file.id ? { 
            ...f, 
            status: 'completed', 
            chunks: response.chunks 
          } : f
        ));

        setProcessingStats(prev => ({
          ...prev,
          processedFiles: prev.processedFiles + 1,
          totalChunks: prev.totalChunks + response.chunks.length,
        }));
      } catch (error) {
        setBatchFiles(prev => prev.map(f => 
          f.id === file.id ? { 
            ...f, 
            status: 'error', 
            error: error instanceof Error ? error.message : 'Unknown error' 
          } : f
        ));
      }
    }

    setBatchProcessing(false);
  };

  // Split text into chapters
  const splitIntoChapters = (text: string): { title: string; content: string }[] => {
    if (!settings.auto_split_chapters) {
      return [{ title: 'Full Text', content: text }];
    }

    const chapters: { title: string; content: string }[] = [];
    const lines = text.split('\n');
    let currentChapter = { title: '', content: '' };
    let inChapter = false;

    for (const line of lines) {
      if (settings.chapter_pattern.test(line)) {
        if (inChapter && currentChapter.content.trim()) {
          chapters.push(currentChapter);
        }
        currentChapter = { title: line.trim(), content: '' };
        inChapter = true;
      } else if (inChapter) {
        currentChapter.content += line + '\n';
      }
    }

    if (currentChapter.content.trim()) {
      chapters.push(currentChapter);
    }

    return chapters.length > 0 ? chapters : [{ title: 'Full Text', content: text }];
  };

  // Generate audiobook
  const generateAudiobook = async () => {
    if (!text.trim()) return;

    setIsGenerating(true);
    try {
      // Split into chapters if needed
      const chapters = splitIntoChapters(text);
      const allChunks: AudiobookChunk[] = [];

      for (const chapter of chapters) {
        const response = await audiobookAPI.generateAudiobook({
          text: chapter.content,
          mode,
          voices,
          settings: {
            ...settings,
            chapter_title: chapter.title,
          },
        });

        allChunks.push(...response.chunks);
      }

      setCurrentProjectId(response.project_id);
      setChunks(allChunks);
    } catch (error) {
      console.error('Failed to generate audiobook:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  // Save project
  const saveProject = async (name: string) => {
    if (!currentProjectId || chunks.length === 0) return;

    const project: AudiobookProject = {
      id: currentProjectId,
      name,
      chunks,
      voices,
      metadata: {
        total_duration: chunks.reduce((sum, c) => sum + (c.duration || 0), 0),
        total_pause_duration: chunks.length * settings.pause_duration,
        created_at: new Date(),
        updated_at: new Date(),
      },
      settings: {
        volume_normalization: settings.volume_normalization,
        target_db: settings.target_db,
        pause_duration_per_break: settings.pause_duration,
        output_format: 'mp3',
      },
    };

    try {
      await audiobookAPI.saveProject(project);
      setSavedProjects([...savedProjects, project]);
    } catch (error) {
      console.error('Failed to save project:', error);
    }
  };

  // Load saved projects
  const loadSavedProjects = async () => {
    try {
      const projects = await audiobookAPI.listProjects();
      setSavedProjects(projects);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  // Voice library management
  const saveToVoiceLibrary = (voice: AudiobookVoiceProfile) => {
    setVoiceLibrary([...voiceLibrary, { ...voice, voice_id: `lib-${Date.now()}` }]);
  };

  const loadFromVoiceLibrary = (libraryVoice: AudiobookVoiceProfile) => {
    const newVoice = { ...libraryVoice, voice_id: `${Date.now()}` };
    setVoices([...voices, newVoice]);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <BookOpen className="h-8 w-8" />
          Advanced Audiobook Studio
        </h1>
        <p className="text-muted-foreground">
          Professional audiobook creation with batch processing, markdown support, and voice library
        </p>
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as 'single' | 'multi' | 'batch')} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="single">
            <Mic className="mr-2 h-4 w-4" />
            Single Voice
          </TabsTrigger>
          <TabsTrigger value="multi">
            <Volume2 className="mr-2 h-4 w-4" />
            Multi Voice
          </TabsTrigger>
          <TabsTrigger value="batch">
            <Files className="mr-2 h-4 w-4" />
            Batch Processing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Main Input Section */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Text Input</CardTitle>
                      <CardDescription>
                        Enter or upload your audiobook text
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <FileUp className="mr-2 h-4 w-4" />
                        Upload File
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".txt,.md,.markdown"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setMarkdownPreview(!markdownPreview)}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        {markdownPreview ? 'Edit' : 'Preview'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {markdownPreview ? (
                    <div className="prose prose-sm max-w-none min-h-[400px] p-4 bg-muted rounded-lg">
                      <ReactMarkdown>{text}</ReactMarkdown>
                    </div>
                  ) : (
                    <Textarea
                      placeholder="Enter your text here or upload a file..."
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      className="min-h-[400px] font-mono"
                    />
                  )}
                  
                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      {text.length} characters | {text.split(/\s+/).filter(Boolean).length} words
                    </div>
                    <Button
                      onClick={generateAudiobook}
                      disabled={isGenerating || !text.trim()}
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Generating...
                        </>
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

              {/* Generation Results */}
              {chunks.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Generated Audio</CardTitle>
                        <CardDescription>
                          {chunks.length} chunks | Total duration: {
                            chunks.reduce((sum, c) => sum + (c.duration || 0), 0).toFixed(1)
                          }s
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowProjectDialog(true)}
                        >
                          <Save className="mr-2 h-4 w-4" />
                          Save Project
                        </Button>
                        <Button
                          size="sm"
                          onClick={exportAudiobook}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Export
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {chunks.map((chunk, index) => (
                        <ChunkItem
                          key={chunk.id}
                          chunk={chunk}
                          index={index}
                          onRegenerate={() => regenerateChunk(chunk.id)}
                          onPlay={() => playChunk(chunk)}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Settings & Voice Section */}
            <div className="space-y-6">
              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => setShowProjectDialog(true)}
                  >
                    <FolderOpen className="mr-2 h-4 w-4" />
                    Load Project
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => setShowVoiceLibrary(true)}
                  >
                    <Mic className="mr-2 h-4 w-4" />
                    Voice Library
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => loadSavedProjects()}
                  >
                    <History className="mr-2 h-4 w-4" />
                    Recent Projects
                  </Button>
                </CardContent>
              </Card>

              {/* Voice Profile */}
              <Card>
                <CardHeader>
                  <CardTitle>Voice Profile</CardTitle>
                </CardHeader>
                <CardContent>
                  <VoiceProfileCard
                    voice={voices[0]}
                    onEdit={() => {
                      setEditingVoice(voices[0]);
                      setShowVoiceDialog(true);
                    }}
                    onSaveToLibrary={() => saveToVoiceLibrary(voices[0])}
                  />
                </CardContent>
              </Card>

              {/* Advanced Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Advanced Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Auto-split Chapters</Label>
                      <input
                        type="checkbox"
                        checked={settings.auto_split_chapters}
                        onChange={(e) => setSettings({
                          ...settings,
                          auto_split_chapters: e.target.checked
                        })}
                        className="h-4 w-4"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Remove Annotations</Label>
                      <input
                        type="checkbox"
                        checked={settings.remove_annotations}
                        onChange={(e) => setSettings({
                          ...settings,
                          remove_annotations: e.target.checked
                        })}
                        className="h-4 w-4"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Chunk Size</Label>
                      <span className="text-sm text-muted-foreground">
                        {settings.chunk_size} chars
                      </span>
                    </div>
                    <Slider
                      value={[settings.chunk_size]}
                      onValueChange={([value]) => setSettings({
                        ...settings,
                        chunk_size: value
                      })}
                      min={100}
                      max={2000}
                      step={100}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="multi" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Multi-voice specific content */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Multi-Voice Text</CardTitle>
                  <CardDescription>
                    Use character names followed by colons for dialogue
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="Narrator: It was a dark and stormy night...&#10;John: 'I don't think we should go in there.'&#10;Sarah: 'Don't be such a coward!'"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="min-h-[400px] font-mono"
                  />
                  
                  <div className="mt-4 flex items-center justify-between">
                    <Button
                      variant="outline"
                      onClick={() => {
                        const chars = detectCharacters(text);
                        if (chars.length > 0) {
                          autoAssignVoices(chars);
                        }
                      }}
                    >
                      <Zap className="mr-2 h-4 w-4" />
                      Auto-detect Characters
                    </Button>
                    <Button onClick={generateAudiobook} disabled={isGenerating}>
                      Generate Multi-Voice
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Character Voices */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Character Voices</CardTitle>
                    <Button size="sm" onClick={addVoice}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {voices.map((voice) => (
                      <VoiceProfileCard
                        key={voice.voice_id}
                        voice={voice}
                        onEdit={() => {
                          setEditingVoice(voice);
                          setShowVoiceDialog(true);
                        }}
                        onDelete={() => deleteVoice(voice.voice_id)}
                        showDelete={voices.length > 1}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="batch" className="mt-6">
          <div className="space-y-6">
            {/* Batch Upload */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Batch Processing</CardTitle>
                    <CardDescription>
                      Process multiple files at once
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => batchInputRef.current?.click()}
                    >
                      <FileUp className="mr-2 h-4 w-4" />
                      Add Files
                    </Button>
                    <input
                      ref={batchInputRef}
                      type="file"
                      multiple
                      accept=".txt,.md,.markdown"
                      onChange={handleBatchUpload}
                      className="hidden"
                    />
                    <Button
                      onClick={processBatchFiles}
                      disabled={batchProcessing || batchFiles.length === 0}
                    >
                      {batchProcessing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Zap className="mr-2 h-4 w-4" />
                          Process All
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {batchProcessing && (
                  <div className="mb-6 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Processing files...</span>
                      <span>{processingStats.processedFiles} / {processingStats.totalFiles}</span>
                    </div>
                    <Progress 
                      value={(processingStats.processedFiles / processingStats.totalFiles) * 100}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  {batchFiles.map((file) => (
                    <BatchFileItem
                      key={file.id}
                      file={file}
                      onRemove={() => setBatchFiles(batchFiles.filter(f => f.id !== file.id))}
                      onExport={() => exportBatchFile(file)}
                    />
                  ))}
                </div>

                {batchFiles.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Files className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No files uploaded yet</p>
                    <p className="text-sm mt-1">Upload text or markdown files to process</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Batch Statistics */}
            {batchFiles.some(f => f.status === 'completed') && (
              <Card>
                <CardHeader>
                  <CardTitle>Batch Statistics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="text-center">
                      <p className="text-2xl font-bold">
                        {batchFiles.filter(f => f.status === 'completed').length}
                      </p>
                      <p className="text-sm text-muted-foreground">Completed</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">
                        {processingStats.totalChunks}
                      </p>
                      <p className="text-sm text-muted-foreground">Total Chunks</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">
                        {(processingStats.totalDuration / 60).toFixed(1)}m
                      </p>
                      <p className="text-sm text-muted-foreground">Total Duration</p>
                    </div>
                  </div>
                  
                  <Button className="w-full mt-4" onClick={exportAllBatch}>
                    <Download className="mr-2 h-4 w-4" />
                    Export All Completed
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Voice Settings Dialog */}
      <VoiceSettingsDialog
        open={showVoiceDialog}
        onOpenChange={setShowVoiceDialog}
        voice={editingVoice}
        onSave={(voice) => {
          if (voice) {
            updateVoice(voice.voice_id, voice);
            setShowVoiceDialog(false);
          }
        }}
      />

      {/* Project Management Dialog */}
      <ProjectManagementDialog
        open={showProjectDialog}
        onOpenChange={setShowProjectDialog}
        projects={savedProjects}
        onLoad={loadProject}
        onSave={() => {
          const name = prompt('Project name:');
          if (name) saveProject(name);
        }}
      />

      {/* Voice Library Dialog */}
      <VoiceLibraryDialog
        open={showVoiceLibrary}
        onOpenChange={setShowVoiceLibrary}
        voices={voiceLibrary}
        onSelect={loadFromVoiceLibrary}
      />
    </div>
  );
}

// Component implementations...
function ChunkItem({ chunk, index, onRegenerate, onPlay }: any) {
  const statusIcons = {
    pending: <Clock className="h-4 w-4 text-muted-foreground" />,
    generating: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
    completed: <CheckCircle className="h-4 w-4 text-green-600" />,
    error: <XCircle className="h-4 w-4 text-destructive" />,
  };

  return (
    <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors">
      <div className="mt-1">{statusIcons[chunk.status]}</div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-muted-foreground">
            Chunk {index + 1}
          </span>
          {chunk.character && (
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
              {chunk.character}
            </span>
          )}
        </div>
        <p className="text-sm break-words line-clamp-2">{chunk.text}</p>
        {chunk.duration && (
          <p className="text-xs text-muted-foreground mt-1">
            Duration: {chunk.duration.toFixed(1)}s
          </p>
        )}
      </div>

      <div className="flex items-center gap-1">
        {chunk.audio_url && (
          <Button variant="ghost" size="icon" onClick={onPlay}>
            <Play className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onRegenerate}
          disabled={chunk.status === 'generating'}
        >
          <RotateCw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function VoiceProfileCard({ voice, onEdit, onDelete, onSaveToLibrary, showDelete = false }: any) {
  return (
    <div className="p-3 bg-muted/50 rounded-lg">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="font-medium">{voice.name}</p>
          {voice.character && (
            <p className="text-sm text-muted-foreground">Character: {voice.character}</p>
          )}
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-muted-foreground">
              Speed: {voice.speed_rate}x
            </span>
            <span className="text-xs text-muted-foreground">
              Temp: {voice.temperature}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Edit3 className="mr-2 h-4 w-4" />
                Edit Settings
              </DropdownMenuItem>
              {onSaveToLibrary && (
                <DropdownMenuItem onClick={onSaveToLibrary}>
                  <Save className="mr-2 h-4 w-4" />
                  Save to Library
                </DropdownMenuItem>
              )}
              {showDelete && onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDelete} className="text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

function BatchFileItem({ file, onRemove, onExport }: any) {
  const statusIcons = {
    pending: <Clock className="h-4 w-4 text-muted-foreground" />,
    processing: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
    completed: <CheckCircle className="h-4 w-4 text-green-600" />,
    error: <XCircle className="h-4 w-4 text-destructive" />,
  };

  return (
    <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
      <div>{statusIcons[file.status]}</div>
      
      <div className="flex-1">
        <p className="font-medium">{file.name}</p>
        {file.error && (
          <p className="text-sm text-destructive mt-1">{file.error}</p>
        )}
        {file.chunks && (
          <p className="text-sm text-muted-foreground mt-1">
            {file.chunks.length} chunks generated
          </p>
        )}
      </div>

      <div className="flex items-center gap-1">
        {file.status === 'completed' && (
          <Button variant="ghost" size="icon" onClick={onExport}>
            <Download className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

  // Component methods implementation
  const addVoice = () => {
    const newVoice: AudiobookVoiceProfile = {
      voice_id: `${Date.now()}`,
      name: `Voice ${voices.length + 1}`,
      character: mode === 'multi' ? `Character ${voices.length + 1}` : undefined,
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

  const playChunk = (chunk: AudiobookChunk) => {
    if (chunk.audio_url) {
      // Implementation would play the audio
      console.log('Playing chunk:', chunk.id);
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

  const exportBatchFile = async (file: BatchFile) => {
    if (file.chunks && file.chunks.length > 0) {
      // Export individual batch file
      console.log('Exporting batch file:', file.name);
    }
  };

  const exportAllBatch = async () => {
    const completedFiles = batchFiles.filter(f => f.status === 'completed');
    for (const file of completedFiles) {
      await exportBatchFile(file);
    }
  };

  const loadProject = async (project: AudiobookProject) => {
    setCurrentProjectId(project.id);
    setChunks(project.chunks);
    setVoices(project.voices);
    setText(project.chunks.map(c => c.text).join('\n\n'));
  };