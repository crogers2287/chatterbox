import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/components/ui/toast';
import { chatterboxAPI } from '@/lib/api';
import axios from 'axios';
import { audiobookAPI } from '@/lib/audiobookApi';
import type { AudiobookVoiceProfile, AudiobookChunk, AudiobookProject } from '@/lib/audiobookApi';
import { DebugAPI } from '@/components/DebugAPI';
import { NetworkDebug } from '@/components/NetworkDebug';
import { usePersistentVoices, usePersistentNarratorSettings } from '@/lib/storage';
import { useStore } from '@/lib/store';
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

export function AudiobookComplete() {
  const [mode, setMode] = useState<'single' | 'multi' | 'batch'>('single');
  const [text, setText] = useState('');
  const [markdownPreview, setMarkdownPreview] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  // Use persistent narrator settings
  const { settings: narratorSettings, updateSettings: updateNarratorSettings } = usePersistentNarratorSettings();
  
  const [voices, setVoices] = useState<AudiobookVoiceProfile[]>([
    {
      voice_id: '1',
      name: 'Narrator',
      character: 'Narrator',
      exaggeration: narratorSettings.exaggeration,
      temperature: narratorSettings.temperature,
      cfg_weight: narratorSettings.cfgWeight,
      min_p: narratorSettings.minP,
      top_p: narratorSettings.topP,
      repetition_penalty: narratorSettings.repetitionPenalty,
      speed_rate: 1.0,
      seed: narratorSettings.seed !== null ? narratorSettings.seed : undefined,
    }
  ]);
  const [chunks, setChunks] = useState<AudiobookChunk[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [showVoiceDialog, setShowVoiceDialog] = useState(false);
  const [editingVoice, setEditingVoice] = useState<AudiobookVoiceProfile | null>(null);
  const [showDebug, setShowDebug] = useState(false);
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

  // Use persistent voices for voice library
  const { 
    voices: savedVoices, 
    loading: voicesLoading, 
    addVoice: addSavedVoice, 
    removeVoice: removeSavedVoice, 
    updateVoice: updateSavedVoice 
  } = usePersistentVoices();
  const [showVoiceLibrary, setShowVoiceLibrary] = useState(false);
  
  // Also get voices from the global store
  const { 
    savedVoices: globalSavedVoices,
    saveVoice: globalSaveVoice,
    loadVoice: globalLoadVoice,
    voiceReference: globalVoiceReference,
    parameters: globalParameters
  } = useStore();

  // File upload refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchInputRef = useRef<HTMLInputElement>(null);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);

  // Update narrator settings when first voice changes - but only on manual changes
  const updateNarratorFromVoice = useCallback((voice: AudiobookVoiceProfile) => {
    if (voice.character === 'Narrator') {
      updateNarratorSettings({
        exaggeration: voice.exaggeration,
        temperature: voice.temperature,
        cfgWeight: voice.cfg_weight,
        minP: voice.min_p,
        topP: voice.top_p,
        repetitionPenalty: voice.repetition_penalty,
        seed: voice.seed || null,
      });
    }
  }, [updateNarratorSettings]);

  // Persist generated projects
  useEffect(() => {
    if (chunks.length > 0 && currentProjectId) {
      const projects = JSON.parse(localStorage.getItem('audiobook-projects') || '[]');
      const projectData = {
        id: currentProjectId,
        name: uploadedFileName || text.split('\n')[0].slice(0, 50) || 'Untitled',
        chunks,
        voices,
        timestamp: Date.now()
      };
      const updatedProjects = [projectData, ...projects.filter((p: any) => p.id !== currentProjectId)].slice(0, 10);
      localStorage.setItem('audiobook-projects', JSON.stringify(updatedProjects));
    }
  }, [chunks, currentProjectId, uploadedFileName, text, voices]);

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

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const textFiles = files.filter(file => 
      file.type === 'text/plain' || 
      file.name.endsWith('.txt') || 
      file.name.endsWith('.md') || 
      file.name.endsWith('.markdown')
    );

    if (textFiles.length === 0) return;

    if (mode === 'batch') {
      // Add to batch
      const newBatchFiles: BatchFile[] = [];
      for (const file of textFiles) {
        const content = await file.text();
        newBatchFiles.push({
          id: `${Date.now()}-${Math.random()}`,
          name: file.name,
          content,
          status: 'pending',
        });
      }
      setBatchFiles([...batchFiles, ...newBatchFiles]);
    } else {
      // Single file mode - load the first file
      const file = textFiles[0];
      const content = await file.text();
      setText(content);
      
      // Set the filename without extension
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      setUploadedFileName(nameWithoutExt);
      
      if (mode === 'multi') {
        const detectedCharacters = detectCharacters(content);
        if (detectedCharacters.length > 0) {
          autoAssignVoices(detectedCharacters);
        }
      }
    }
  }, [mode, batchFiles]);

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
      
      // Set the filename without extension
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      setUploadedFileName(nameWithoutExt);
      
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

  // Split text into chunks
  const splitIntoChunks = (text: string, chunkSize: number): string[] => {
    const words = text.split(/\s+/).filter(word => word.length > 0);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const word of words) {
      if ((currentChunk + ' ' + word).length > chunkSize) {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = word;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + word;
      }
    }

    if (currentChunk.trim()) chunks.push(currentChunk.trim());
    return chunks.filter(chunk => chunk.length > 0);
  };

  // Detect character voice for multi-voice mode
  const detectCharacterVoice = (text: string, voices: AudiobookVoiceProfile[]): number => {
    // Look for character dialogue pattern: "CHARACTER_NAME: dialogue"
    const dialoguePattern = /^([A-Z][A-Z0-9_\s]+):\s*/;
    const match = text.match(dialoguePattern);
    
    if (match) {
      const characterName = match[1].trim();
      const voiceIndex = voices.findIndex(v => 
        v.character?.toLowerCase() === characterName.toLowerCase()
      );
      return voiceIndex >= 0 ? voiceIndex : 0;
    }
    
    return 0; // Default to narrator
  };

  // Generate audiobook
  const generateAudiobook = async () => {
    if (!text.trim()) return;

    setIsGenerating(true);
    try {
      // Split into chapters if needed
      const chapters = splitIntoChapters(text);
      const allChunks: AudiobookChunk[] = [];
      
      // Get project name from uploaded file or first line
      const projectName = uploadedFileName || text.split('\n')[0].slice(0, 50) || 'Untitled Audiobook';
      const projectId = `project-${Date.now()}`;
      setCurrentProjectId(projectId);

      for (const [chapterIndex, chapter] of chapters.entries()) {
        // Split chapter into chunks
        const chunkTexts = splitIntoChunks(chapter.content, settings.chunk_size);
        
        for (const [index, chunkText] of chunkTexts.entries()) {
          // Skip empty chunks
          if (!chunkText.trim()) continue;
          
          const voiceIndex = mode === 'multi' ? detectCharacterVoice(chunkText, voices) : 0;
          const voice = voices[voiceIndex] || voices[0];
          
          const chunk: AudiobookChunk = {
            id: `${projectId}-chunk-${chapterIndex}-${index}`,
            text: chunkText,
            voice_id: voice.voice_id,
            character: voice.character,
            status: 'pending',
          };
          
          allChunks.push(chunk);
        }
      }

      setChunks(allChunks);
      
      // Start generating audio for each chunk
      for (let i = 0; i < allChunks.length; i++) {
        const chunk = allChunks[i];
        
        try {
          setChunks(prev => prev.map(c => 
            c.id === chunk.id ? { ...c, status: 'generating' as const } : c
          ));
          
          // Get the voice profile for this chunk
          const voice = voices.find(v => v.voice_id === chunk.voice_id) || voices[0];
          
          // Add a small delay between chunks to avoid overwhelming the server
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
          // Generate audio using Chatterbox API
          console.log(`Generating audio for chunk ${chunk.id} with voice ${voice.name}`);
          console.log('Chunk text:', chunk.text);
          console.log('Voice settings:', {
            exaggeration: voice.exaggeration,
            temperature: voice.temperature,
            cfg_weight: voice.cfg_weight,
            min_p: voice.min_p,
            top_p: voice.top_p,
            repetition_penalty: voice.repetition_penalty,
            seed: voice.seed,
            speed_rate: voice.speed_rate,
          });
          
          console.log(`Voice object:`, voice);
          console.log(`Voice has file:`, voice.voice_file instanceof File);
          
          const response = await chatterboxAPI.synthesize({
            text: chunk.text,
            exaggeration: voice.exaggeration,
            temperature: voice.temperature,
            cfg_weight: voice.cfg_weight,
            min_p: voice.min_p,
            top_p: voice.top_p,
            repetition_penalty: voice.repetition_penalty,
            seed: voice.seed || undefined,
            speech_rate: voice.speed_rate,
          }, voice.voice_file instanceof File ? voice.voice_file : undefined);
          console.log(`API response for chunk ${chunk.id}:`, response);
          
          if (response.success && response.audio_url) {
            setChunks(prev => prev.map(c => 
              c.id === chunk.id ? { 
                ...c, 
                status: 'completed' as const,
                audio_url: response.audio_url,
                duration: response.duration || 0
              } : c
            ));
          } else {
            throw new Error(response.message || 'Generation failed');
          }
        } catch (error) {
          console.error(`Failed to generate chunk ${chunk.id}:`, error);
          let errorMessage = 'Generation failed';
          if (error instanceof Error) {
            errorMessage = error.message;
          }
          if (axios.isAxiosError(error)) {
            errorMessage = `Network error: ${error.message}`;
            if (error.response) {
              errorMessage += ` (${error.response.status}: ${error.response.statusText})`;
              console.error('API error response:', error.response.data);
            }
          }
          
          setChunks(prev => prev.map(c => 
            c.id === chunk.id ? { 
              ...c, 
              status: 'error' as const,
              error: errorMessage
            } : c
          ));
          
          toast.error('Generation failed', errorMessage);
        }
      }
      
      toast.success('Audiobook generated', `Generated ${allChunks.length} chunks for "${projectName}"`);
    } catch (error) {
      console.error('Failed to generate audiobook:', error);
      toast.error('Generation failed', error instanceof Error ? error.message : 'Failed to generate audiobook');
    } finally {
      setIsGenerating(false);
    }
  };

  // Component methods
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
    const chunk = chunks.find(c => c.id === chunkId);
    if (!chunk) return;

    try {
      // Set status to generating
      setChunks(prev => prev.map(c => 
        c.id === chunkId ? { ...c, status: 'generating' as const } : c
      ));
      
      // Get the voice profile for this chunk
      const voice = voices.find(v => v.voice_id === chunk.voice_id) || voices[0];
      
      // Regenerate audio using Chatterbox API
      const response = await chatterboxAPI.synthesize({
        text: chunk.text,
        exaggeration: voice.exaggeration,
        temperature: voice.temperature,
        cfg_weight: voice.cfg_weight,
        min_p: voice.min_p,
        top_p: voice.top_p,
        repetition_penalty: voice.repetition_penalty,
        seed: voice.seed || undefined,
        speech_rate: voice.speed_rate,
      }, voice.voice_file instanceof File ? voice.voice_file : undefined);
      
      if (response.success && response.audio_url) {
        setChunks(prev => prev.map(c => 
          c.id === chunkId ? { 
            ...c, 
            status: 'completed' as const,
            audio_url: response.audio_url,
            duration: response.duration || 0,
            error: undefined
          } : c
        ));
        toast.success('Chunk regenerated', 'Audio has been regenerated successfully');
      } else {
        throw new Error(response.message || 'Regeneration failed');
      }
    } catch (error) {
      console.error('Failed to regenerate chunk:', error);
      setChunks(prev => prev.map(c => 
        c.id === chunkId ? { 
          ...c, 
          status: 'error' as const,
          error: error instanceof Error ? error.message : 'Regeneration failed'
        } : c
      ));
      toast.error('Regeneration failed', error instanceof Error ? error.message : 'Failed to regenerate chunk');
    }
  };

  const playChunk = (chunk: AudiobookChunk) => {
    if (chunk.audio_url) {
      // Create audio element and play
      const audio = new Audio(chatterboxAPI.getAudioUrl(chunk.audio_url));
      audio.play().catch(error => {
        console.error('Failed to play audio:', error);
        toast.error('Playback failed', 'Could not play audio chunk');
      });
    }
  };

  const exportAudiobook = async () => {
    if (!chunks.length) return;

    try {
      toast.info('Exporting audiobook', 'Concatenating audio files...');
      
      // Get all completed chunks
      const completedChunks = chunks.filter(c => c.status === 'completed' && c.audio_url);
      if (completedChunks.length === 0) {
        toast.error('No audio to export', 'Please generate audio first');
        return;
      }
      
      // Get audio URLs
      const audioUrls = completedChunks.map(c => c.audio_url!);
      
      // Concatenate using Chatterbox API
      const result = await chatterboxAPI.concatenateAudio(audioUrls, 'mp3');
      
      if (result.success && result.audio_url) {
        // Download the concatenated file
        const projectName = uploadedFileName || text.split('\n')[0].slice(0, 50) || 'audiobook';
        const filename = `${projectName}.mp3`;
        
        const a = document.createElement('a');
        a.href = chatterboxAPI.getAudioUrl(result.audio_url);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        toast.success('Export complete', `Downloaded ${filename}`);
      } else {
        throw new Error('Failed to concatenate audio files');
      }
    } catch (error) {
      console.error('Failed to export audiobook:', error);
      toast.error('Export failed', error instanceof Error ? error.message : 'Failed to export audiobook');
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

  // Voice library management - now using global store
  const saveToVoiceLibrary = async (voice: AudiobookVoiceProfile) => {
    console.log('[AudiobookComplete] Saving voice to global library:', voice.name);
    
    // Save the current voice file and parameters to the global store
    if (voice.voice_file instanceof File) {
      // Set the voice file in the global store
      useStore.getState().setVoiceReference(voice.voice_file);
    }
    
    // Set the parameters in the global store
    useStore.getState().updateParameters({
      exaggeration: voice.exaggeration,
      temperature: voice.temperature,
      cfg_weight: voice.cfg_weight,
      min_p: voice.min_p,
      top_p: 1.0, // Default since audiobook doesn't have top_p
      repetition_penalty: voice.repetition_penalty,
      seed: voice.seed || null,
      speech_rate: voice.speed_rate,
    });
    
    // Save the voice using the global store
    await globalSaveVoice(voice.name);
    
    toast.success('Voice saved to library', `${voice.name} is now available globally in your voice library`);
  };

  const loadFromVoiceLibrary = async (voiceId: string) => {
    // First check the global saved voices
    const globalVoice = globalSavedVoices.find(v => v.id === voiceId);
    
    if (globalVoice) {
      console.log('[AudiobookComplete] Loading voice from global library:', globalVoice.name);
      
      // Load the voice into the global store first
      await globalLoadVoice(voiceId);
      
      // Wait a bit for the store to update
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Get the updated global state
      const state = useStore.getState();
      
      const newVoice: AudiobookVoiceProfile = {
        voice_id: `${Date.now()}`,
        name: globalVoice.name,
        character: globalVoice.name,
        exaggeration: globalVoice.parameters?.exaggeration ?? 0.5,
        temperature: globalVoice.parameters?.temperature ?? 0.8,
        cfg_weight: globalVoice.parameters?.cfg_weight ?? 0.5,
        min_p: globalVoice.parameters?.min_p ?? 0.05,
        top_p: globalVoice.parameters?.top_p ?? 1.0,
        repetition_penalty: globalVoice.parameters?.repetition_penalty ?? 1.2,
        speed_rate: globalVoice.parameters?.speech_rate ?? 1.0,
        seed: globalVoice.parameters?.seed || undefined,
        voice_file: globalVoice.voice_file || state.voiceReference || undefined,
      };
      setVoices([...voices, newVoice]);
      toast.success('Voice loaded', `${globalVoice.name} has been added to your project from the global library`);
    } else {
      // Fallback to local saved voices
      const libraryVoice = savedVoices.find(v => v.id === voiceId);
      if (!libraryVoice) return;
      
      const newVoice: AudiobookVoiceProfile = {
        voice_id: `${Date.now()}`,
        name: libraryVoice.name,
        character: libraryVoice.name,
        exaggeration: narratorSettings.exaggeration,
        temperature: narratorSettings.temperature,
        cfg_weight: narratorSettings.cfgWeight,
        min_p: narratorSettings.minP,
        top_p: narratorSettings.topP,
        repetition_penalty: narratorSettings.repetitionPenalty,
        speed_rate: 1.0,
        seed: narratorSettings.seed !== null ? narratorSettings.seed : undefined,
        voice_file: libraryVoice.file || undefined,
      };
      setVoices([...voices, newVoice]);
      toast.success('Voice loaded', `${libraryVoice.name} has been added to your project`);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <DebugAPI />
      {showDebug && <NetworkDebug />}
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <BookOpen className="h-8 w-8" />
          Advanced Audiobook Studio
        </h1>
        <p className="text-muted-foreground">
          Professional audiobook creation with batch processing, markdown support, and voice library
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDebug(!showDebug)}
          className="mt-2"
        >
          {showDebug ? 'Hide' : 'Show'} Network Debug
        </Button>
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
                  <div
                    className={`relative ${isDragging ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    {isDragging && (
                      <div className="absolute inset-0 bg-primary/10 flex items-center justify-center z-10 rounded-lg">
                        <p className="text-lg font-medium">Drop your text file here</p>
                      </div>
                    )}
                    
                    {markdownPreview ? (
                      <div className="prose prose-sm max-w-none min-h-[400px] p-4 bg-muted rounded-lg">
                        <ReactMarkdown>{text}</ReactMarkdown>
                      </div>
                    ) : (
                      <Textarea
                        placeholder="Enter your text here or drag & drop a file..."
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="min-h-[400px] font-mono"
                      />
                    )}
                  </div>
                  
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
                    onClick={() => {
                      loadSavedProjects();
                      setShowProjectDialog(true);
                    }}
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
                  <div
                    className={`relative ${isDragging ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    {isDragging && (
                      <div className="absolute inset-0 bg-primary/10 flex items-center justify-center z-10 rounded-lg">
                        <p className="text-lg font-medium">Drop your text file here</p>
                      </div>
                    )}
                    
                    <Textarea
                      placeholder="Narrator: It was a dark and stormy night...&#10;John: 'I don't think we should go in there.'&#10;Sarah: 'Don't be such a coward!'"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      className="min-h-[400px] font-mono"
                    />
                  </div>
                  
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
                        onSaveToLibrary={() => saveToVoiceLibrary(voice)}
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
                <div
                  className={`relative min-h-[300px] ${isDragging ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {isDragging && (
                    <div className="absolute inset-0 bg-primary/10 flex items-center justify-center z-10 rounded-lg">
                      <p className="text-lg font-medium">Drop your files here</p>
                    </div>
                  )}

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
                      <p className="text-sm mt-1">Drop files here or click "Add Files"</p>
                    </div>
                  )}
                </div>
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

      {/* Generated Files Section */}
      {chunks.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Generated Audio Files</CardTitle>
            <CardDescription>
              {chunks.filter(c => c.status === 'completed').length} of {chunks.length} chunks generated
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
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
            
            {chunks.filter(c => c.status === 'completed').length > 0 && (
              <div className="mt-4 flex items-center justify-between border-t pt-4">
                <div className="text-sm text-muted-foreground">
                  Total duration: {(chunks.reduce((acc, c) => acc + (c.duration || 0), 0) / 60).toFixed(1)} minutes
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={exportAudiobook}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export Audiobook
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recently Generated Projects */}
      {(() => {
        const recentProjects = JSON.parse(localStorage.getItem('audiobook-projects') || '[]');
        return recentProjects.length > 0 ? (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Recent Projects</CardTitle>
              <CardDescription>Your recently generated audiobooks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recentProjects.slice(0, 5).map((project: any) => (
                  <div
                    key={project.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                    onClick={() => {
                      setCurrentProjectId(project.id);
                      setChunks(project.chunks);
                      setVoices(project.voices);
                      setUploadedFileName(project.name);
                      toast.info('Project loaded', `Loaded "${project.name}"`);
                    }}
                  >
                    <div className="flex-1">
                      <p className="font-medium">{project.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {project.chunks.length} chunks • {new Date(project.timestamp).toLocaleDateString()}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon">
                      <FolderOpen className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null;
      })()}

      {/* Voice Settings Dialog */}
      <VoiceSettingsDialog
        open={showVoiceDialog}
        onOpenChange={(open) => {
          setShowVoiceDialog(open);
          if (!open) {
            setEditingVoice(null);
          }
        }}
        voice={editingVoice}
        onSave={(updatedVoice) => {
          console.log('[AudiobookComplete] Saving voice:', updatedVoice);
          console.log('[AudiobookComplete] Voice has file:', updatedVoice.voice_file instanceof File);
          
          // Directly update the voices array
          setVoices(prevVoices => 
            prevVoices.map(v => 
              v.voice_id === updatedVoice.voice_id ? updatedVoice : v
            )
          );
          // Update narrator settings if this is the narrator voice
          updateNarratorFromVoice(updatedVoice);
          setShowVoiceDialog(false);
          setEditingVoice(null);
          // Show success toast
          toast.success('Voice settings saved', `Updated settings for ${updatedVoice.name}`);
        }}
        mode={mode}
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
          setShowProjectDialog(false);
        }}
      />

      {/* Voice Library Dialog */}
      <VoiceLibraryDialog
        open={showVoiceLibrary}
        onOpenChange={setShowVoiceLibrary}
        voices={[
          // Include global saved voices
          ...globalSavedVoices.map(v => ({
            voice_id: v.id,
            name: `[Global] ${v.name}`,
            character: v.name,
            exaggeration: v.parameters?.exaggeration ?? narratorSettings.exaggeration,
            temperature: v.parameters?.temperature ?? narratorSettings.temperature,
            cfg_weight: v.parameters?.cfg_weight ?? narratorSettings.cfgWeight,
            min_p: v.parameters?.min_p ?? narratorSettings.minP,
            top_p: v.parameters?.top_p ?? narratorSettings.topP,
            repetition_penalty: v.parameters?.repetition_penalty ?? narratorSettings.repetitionPenalty,
            speed_rate: v.parameters?.speech_rate ?? 1.0,
            seed: v.parameters?.seed || (narratorSettings.seed !== null ? narratorSettings.seed : undefined),
            voice_file: v.voice_file || undefined,
          })),
          // Include local saved voices
          ...savedVoices.map(v => ({
            voice_id: v.id,
            name: v.name,
            character: v.name,
            exaggeration: narratorSettings.exaggeration,
            temperature: narratorSettings.temperature,
            cfg_weight: narratorSettings.cfgWeight,
            min_p: narratorSettings.minP,
            top_p: narratorSettings.topP,
            repetition_penalty: narratorSettings.repetitionPenalty,
            speed_rate: 1.0,
            seed: narratorSettings.seed !== null ? narratorSettings.seed : undefined,
            voice_file: v.file || undefined,
          }))
        ]}
        onSelect={(voice: AudiobookVoiceProfile) => loadFromVoiceLibrary(voice.voice_id)}
      />
    </div>
  );
}

// Component implementations...
function ChunkItem({ chunk, index, onRegenerate, onPlay }: any) {
  const statusIcons: any = {
    pending: <Clock className="h-4 w-4 text-muted-foreground" />,
    generating: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
    completed: <CheckCircle className="h-4 w-4 text-green-600" />,
    error: <XCircle className="h-4 w-4 text-destructive" />,
  };

  return (
    <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors">
      <div className="mt-1" data-testid={`chunk-status-${chunk.status}`}>{statusIcons[chunk.status]}</div>
      
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
          <Button variant="ghost" size="icon" onClick={onPlay} title="Play">
            <Play className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onRegenerate}
          disabled={chunk.status === 'generating'}
          title="Regenerate"
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
  const statusIcons: any = {
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