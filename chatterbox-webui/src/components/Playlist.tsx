import React, { useRef, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStore } from '@/lib/store';
import { chatterboxAPI } from '@/lib/api';
import { ExportDialog } from '@/components/ExportDialog';
import { ChunkStreamingPlayer } from '@/components/ChunkStreamingPlayer';
import ArchiveManager from '@/lib/archiveManager';
import { 
  Play, 
  Pause, 
  RotateCw, 
  Trash2, 
  Download, 
  Loader2,
  CheckCircle,
  XCircle,
  Volume2,
  FileDown,
  StopCircle
} from 'lucide-react';

interface ChunkItemProps {
  chunk: import('@/lib/store').TextChunk;
  onRegenerate: () => void;
  onRemove: () => void;
  onPlay: () => void;
  onDownload: () => void;
  isPlaying: boolean;
  loadingAudio: string | null;
}

function ChunkItem({ chunk, onRegenerate, onRemove, onPlay, onDownload, isPlaying, loadingAudio }: ChunkItemProps) {
  const statusIcons = {
    pending: <div className="h-4 w-4 rounded-full bg-muted" />,
    generating: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
    completed: <CheckCircle className="h-4 w-4 text-green-600" />,
    error: <XCircle className="h-4 w-4 text-destructive" />,
  };

  return (
    <div className="flex items-start space-x-3 p-4 bg-muted/50 rounded-lg">
      <div className="mt-1">{statusIcons[chunk.status]}</div>
      
      <div className="flex-1 min-w-0">
        {chunk.filename && (
          <p className="text-xs font-medium text-muted-foreground mb-1">
            {chunk.filename}
          </p>
        )}
        <p className="text-sm break-words">{chunk.text}</p>
        {chunk.error && (
          <p className="text-xs text-destructive mt-1">{chunk.error}</p>
        )}
        {chunk.duration && (
          <p className="text-xs text-muted-foreground mt-1">
            Duration: {chunk.duration.toFixed(1)}s
          </p>
        )}
      </div>

      <div className="flex items-center space-x-1">
        {chunk.audioUrl && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={onPlay}
              disabled={chunk.status === 'generating' || loadingAudio === chunk.id}
            >
              {loadingAudio === chunk.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={onDownload}
              disabled={chunk.status === 'generating'}
              title="Download this chunk"
            >
              <Download className="h-4 w-4" />
            </Button>
          </>
        )}
        
        <Button
          variant="ghost"
          size="icon"
          onClick={onRegenerate}
          disabled={chunk.status === 'generating'}
        >
          <RotateCw className="h-4 w-4" />
        </Button>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={chunk.status === 'generating'}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function Playlist() {
  const { 
    chunks, 
    updateChunk, 
    removeChunk, 
    clearChunks,
    isGenerating,
    setIsGenerating,
    currentGeneratingId,
    setCurrentGeneratingId,
    parameters,
    voiceReference,
    cancelGeneration,
    useStreaming,
    ttsEngine
  } = useStore();

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioCache = useRef<Map<string, string>>(new Map());
  const [loadingAudio, setLoadingAudio] = useState<string | null>(null);
  const streamingPlayerRef = useRef<any>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [playQueue, setPlayQueue] = useState<string[]>([]);

  // Helper function to handle chunk completion with auto-play
  const handleChunkCompletion = (chunkId: string, audioUrl: string) => {
    if (autoPlay && !playingId && playQueue.length === 0) {
      // Start playing immediately if nothing is playing
      setTimeout(() => playAudio(chunkId, audioUrl), 100);
    } else if (autoPlay) {
      // Add to queue to play later
      setPlayQueue(prev => [...prev, chunkId]);
    }
  };

  const generateAudio = async (chunkId: string) => {
    const chunk = chunks.find(c => c.id === chunkId);
    if (!chunk) return;

    // Clear cached audio URL if exists (important for regeneration)
    const cachedUrl = audioCache.current.get(chunkId);
    if (cachedUrl && cachedUrl.startsWith('blob:')) {
      URL.revokeObjectURL(cachedUrl);
      audioCache.current.delete(chunkId);
    }

    setIsGenerating(true);
    setCurrentGeneratingId(chunkId);
    updateChunk(chunkId, { status: 'generating', error: undefined });

    try {
      console.log('[Playlist] Synthesizing with voice reference:', voiceReference);
      console.log('[Playlist] Parameters:', parameters);
      console.log('[Playlist] Using streaming:', useStreaming);
      
      if (useStreaming) {
        // Use streaming synthesis
        let firstChunkReceived = false;
        let audioChunks: Blob[] = [];
        
        const eventSource = chatterboxAPI.synthesizeStream(
          {
            text: chunk.text,
            ...parameters,
            engine: ttsEngine,
            chunk_size: 50
          },
          voiceReference || undefined,
          {
            onChunk: async (data) => {
              if (!firstChunkReceived) {
                firstChunkReceived = true;
                console.log('[Playlist] First chunk received');
              }
              
              // Decode base64 audio chunk
              if (data.audio_chunk) {
                const audioData = atob(data.audio_chunk);
                const arrayBuffer = new ArrayBuffer(audioData.length);
                const uint8Array = new Uint8Array(arrayBuffer);
                for (let i = 0; i < audioData.length; i++) {
                  uint8Array[i] = audioData.charCodeAt(i);
                }
                const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
                audioChunks.push(blob);
              }
            },
            onComplete: async () => {
              console.log('[Playlist] Streaming complete, combining chunks');
              // Combine all audio chunks into a single blob
              const combinedBlob = new Blob(audioChunks, { type: 'audio/wav' });
              const audioUrl = URL.createObjectURL(combinedBlob);
              
              // Convert to base64 for persistence
              const reader = new FileReader();
              const audioData = await new Promise<string>((resolve) => {
                reader.onloadend = () => {
                  const base64 = reader.result as string;
                  resolve(base64);
                };
                reader.readAsDataURL(combinedBlob);
              });
              
              updateChunk(chunkId, {
                status: 'completed',
                audioUrl: audioUrl,
                audioData: audioData,
                duration: audioChunks.length * 0.5, // Estimate, will be updated when played
              });
              
              // Archive the generated audio (streaming)
              try {
                const archive = ArchiveManager.getInstance();
                archive.addAudioItem({
                  text: chunk.text,
                  audioUrl: audioUrl,
                  audioData: audioData,
                  duration: audioChunks.length * 0.5,
                  parameters: parameters,
                  voiceId: voiceReference?.id,
                  voiceName: voiceReference?.name
                });
              } catch (archiveError) {
                console.warn('Failed to archive streaming audio:', archiveError);
                // Don't fail the generation if archiving fails
              }
              
              // Handle auto-play for batch generation
              handleChunkCompletion(chunkId, audioUrl);
            },
            onError: (error) => {
              throw error;
            }
          }
        );
      } else {
        // Use regular synthesis
        console.log('[Playlist] Regular synthesis - voiceReference:', voiceReference, {
          name: voiceReference?.name,
          size: voiceReference?.size,
          type: voiceReference?.type
        });
        const response = await chatterboxAPI.synthesize(
          {
            text: chunk.text,
            ...parameters,
            engine: ttsEngine
          },
          voiceReference || undefined
        );

        if (response.success && response.audio_url) {
          const audioUrl = chatterboxAPI.getAudioUrl(
            response.audio_url.replace('/audio/', '')
          );
          
          // Download audio and convert to base64 for persistence
          try {
            const audioFilename = response.audio_url.replace('/audio/', '');
            const blob = await chatterboxAPI.downloadAudio(audioFilename);
            
            // Create blob URL for playback
            const blobUrl = URL.createObjectURL(blob);
            
            // Convert to base64 for persistence
            const reader = new FileReader();
            const audioData = await new Promise<string>((resolve) => {
              reader.onloadend = () => {
                const base64 = reader.result as string;
                resolve(base64);
              };
              reader.readAsDataURL(blob);
            });
            
            updateChunk(chunkId, {
              status: 'completed',
              audioUrl: blobUrl,
              audioData: audioData,
              duration: response.duration,
            });
            
            // Archive the generated audio
            try {
              const archive = ArchiveManager.getInstance();
              archive.addAudioItem({
                text: chunk.text,
                audioUrl: response.audio_url,
                audioData: audioData,
                duration: response.duration || 0,
                parameters: parameters,
                voiceId: voiceReference?.id,
                voiceName: voiceReference?.name
              });
            } catch (archiveError) {
              console.warn('Failed to archive audio:', archiveError);
              // Don't fail the generation if archiving fails
            }
            
            // Handle auto-play for batch generation
            handleChunkCompletion(chunkId, blobUrl);
          } catch (err) {
            console.error('Failed to download audio for persistence:', err);
            // Fallback to just URL without persistence
            updateChunk(chunkId, {
              status: 'completed',
              audioUrl: audioUrl,
              duration: response.duration,
            });
            
            // Still archive even without local persistence
            const archive = ArchiveManager.getInstance();
            archive.addAudioItem({
              text: chunk.text,
              audioUrl: response.audio_url,
              duration: response.duration || 0,
              parameters: parameters,
              voiceId: voiceReference?.id,
              voiceName: voiceReference?.name
            });
          }
        } else {
          throw new Error(response.message || 'Generation failed');
        }
      }
    } catch (error) {
      updateChunk(chunkId, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Generation failed',
      });
    } finally {
      setIsGenerating(false);
      setCurrentGeneratingId(null);
    }
  };

  const generateAll = async () => {
    const pendingChunks = chunks.filter(c => c.status === 'pending' || c.status === 'error');
    
    // Set generating state for the entire batch
    setIsGenerating(true);
    
    // Enable auto-play for batch generation
    setAutoPlay(true);
    setPlayQueue([]);
    
    // Use a consistent seed for batch generation to maintain voice consistency
    const batchSeed = parameters.seed || Math.floor(Math.random() * 1000000);
    
    // Process chunks in parallel with a concurrency limit (2 for dual GPU)
    const CONCURRENT_LIMIT = 2;
    const results = [];
    
    for (let i = 0; i < pendingChunks.length; i += CONCURRENT_LIMIT) {
      // Check if generation was cancelled by user
      const state = useStore.getState();
      if (!state.isGenerating) {
        break;
      }
      
      // Get the next batch of chunks to process
      const batch = pendingChunks.slice(i, i + CONCURRENT_LIMIT);
      
      // Process batch in parallel
      console.log(`Processing batch ${Math.floor(i/CONCURRENT_LIMIT) + 1}: ${batch.map(c => c.id).join(', ')}`);
      
      const batchPromises = batch.map(chunk => 
        generateSingleChunkWithSeed(chunk.id, batchSeed).catch(err => {
          console.error(`Failed to generate chunk ${chunk.id}:`, err);
          // Mark chunk as failed instead of just returning null
          updateChunk(chunk.id, {
            status: 'error',
            error: err instanceof Error ? err.message : 'Generation failed',
          });
          return { chunkId: chunk.id, success: false, error: err };
        })
      );
      
      // Wait for this batch to complete before starting the next
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Log batch completion
      const successCount = batchResults.filter(r => r !== null && r !== undefined).length;
      console.log(`Batch ${Math.floor(i/CONCURRENT_LIMIT) + 1} completed: ${successCount}/${batch.length} successful`);
    }
    
    // Clear generating state when done
    setIsGenerating(false);
    setCurrentGeneratingId(null);
    
    // Disable auto-play after batch completes
    setAutoPlay(false);
    setPlayQueue([]);
  };
  
  // Helper function for generating a single chunk without affecting global state
  const generateSingleChunk = async (chunkId: string) => {
    return generateSingleChunkWithSeed(chunkId, parameters.seed);
  };
  
  // Helper function for generating with a specific seed
  const generateSingleChunkWithSeed = async (chunkId: string, seed: number | null) => {
    const chunk = chunks.find(c => c.id === chunkId);
    if (!chunk) throw new Error(`Chunk ${chunkId} not found`);

    console.log(`Starting generation for chunk ${chunkId} with seed ${seed}`);

    // Don't set current generating ID when in batch mode to allow multiple concurrent generations
    if (!useStore.getState().isGenerating || chunks.filter(c => c.status === 'generating').length === 0) {
      setCurrentGeneratingId(chunkId);
    }
    updateChunk(chunkId, { status: 'generating', error: undefined });

    // Add timeout wrapper
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Generation timeout (60s)')), 60000);
    });

    const generationPromise = (async () => {
      console.log('[Playlist] Batch synthesizing with voice reference:', voiceReference);
      console.log('[Playlist] Using seed:', seed);
      console.log('[Playlist] Using streaming:', useStreaming);
      
      if (useStreaming) {
        // Use streaming synthesis for batch
        let audioChunks: Blob[] = [];
        
        await new Promise<void>((resolve, reject) => {
          chatterboxAPI.synthesizeStream(
            {
              text: chunk.text,
              ...parameters,
              engine: ttsEngine,
              seed: seed,
              chunk_size: 50
            },
            voiceReference || undefined,
            {
              onChunk: async (data) => {
                if (data.audio_chunk) {
                  const audioData = atob(data.audio_chunk);
                  const arrayBuffer = new ArrayBuffer(audioData.length);
                  const uint8Array = new Uint8Array(arrayBuffer);
                  for (let i = 0; i < audioData.length; i++) {
                    uint8Array[i] = audioData.charCodeAt(i);
                  }
                  const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
                  audioChunks.push(blob);
                }
              },
              onComplete: async () => {
                const combinedBlob = new Blob(audioChunks, { type: 'audio/wav' });
                const audioUrl = URL.createObjectURL(combinedBlob);
                
                // Convert to base64 for persistence
                const reader = new FileReader();
                const audioData = await new Promise<string>((resolve) => {
                  reader.onloadend = () => {
                    const base64 = reader.result as string;
                    resolve(base64);
                  };
                  reader.readAsDataURL(combinedBlob);
                });
                
                updateChunk(chunkId, {
                  status: 'completed',
                  audioUrl: audioUrl,
                  audioData: audioData,
                  duration: audioChunks.length * 0.5,
                });
                
                // Handle auto-play for batch generation
                handleChunkCompletion(chunkId, audioUrl);
                resolve();
              },
              onError: (error) => {
                reject(error);
              }
            }
          );
        });
      } else {
        // Use regular synthesis for batch
        const response = await chatterboxAPI.synthesize(
          {
            text: chunk.text,
            ...parameters,
            engine: ttsEngine,
            seed: seed
          },
          voiceReference || undefined
        );

        if (response.success && response.audio_url) {
          const audioUrl = chatterboxAPI.getAudioUrl(
            response.audio_url.replace('/audio/', '')
          );
          
          // Download audio and convert to base64 for persistence
          try {
            const audioFilename = response.audio_url.replace('/audio/', '');
            const blob = await chatterboxAPI.downloadAudio(audioFilename);
            
            // Create blob URL for playback
            const blobUrl = URL.createObjectURL(blob);
            
            // Convert to base64 for persistence
            const reader = new FileReader();
            const audioData = await new Promise<string>((resolve) => {
              reader.onloadend = () => {
                const base64 = reader.result as string;
                resolve(base64);
              };
              reader.readAsDataURL(blob);
            });
            
            updateChunk(chunkId, {
              status: 'completed',
              audioUrl: blobUrl,
              audioData: audioData,
              duration: response.duration,
            });
            
            // Archive the generated audio
            try {
              const archive = ArchiveManager.getInstance();
              archive.addAudioItem({
                text: chunk.text,
                audioUrl: response.audio_url,
                audioData: audioData,
                duration: response.duration || 0,
                parameters: parameters,
                voiceId: voiceReference?.id,
                voiceName: voiceReference?.name
              });
            } catch (archiveError) {
              console.warn('Failed to archive audio:', archiveError);
              // Don't fail the generation if archiving fails
            }
            
            // Handle auto-play for batch generation
            handleChunkCompletion(chunkId, blobUrl);
          } catch (err) {
            console.error('Failed to download audio for persistence:', err);
            // Fallback to just URL without persistence
            updateChunk(chunkId, {
              status: 'completed',
              audioUrl: audioUrl,
              duration: response.duration,
            });
            
            // Still archive even without local persistence
            const archive = ArchiveManager.getInstance();
            archive.addAudioItem({
              text: chunk.text,
              audioUrl: response.audio_url,
              duration: response.duration || 0,
              parameters: parameters,
              voiceId: voiceReference?.id,
              voiceName: voiceReference?.name
            });
          }
        } else {
          throw new Error(response.message || 'Generation failed');
        }
      }
    })();

    // Race between generation and timeout
    try {
      await Promise.race([generationPromise, timeoutPromise]);
      console.log(`Successfully completed generation for chunk ${chunkId}`);
    } catch (error) {
      console.error(`Generation failed for chunk ${chunkId}:`, error);
      updateChunk(chunkId, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Generation failed',
      });
      throw error; // Re-throw to bubble up to batch handler
    }
  };

  const playAudio = async (chunkId: string, audioUrl: string) => {
    if (!audioRef.current) return;

    if (playingId === chunkId) {
      audioRef.current.pause();
      setPlayingId(null);
    } else {
      // Stop current audio if playing
      if (playingId) {
        audioRef.current.pause();
      }
      
      setLoadingAudio(chunkId);
      
      try {
        // Check if we have cached audio
        let cachedUrl = audioCache.current.get(chunkId);
        
        if (!cachedUrl) {
          // Extract filename from URL
          const filename = audioUrl.split('/').pop() || '';
          
          // Download audio using the API method to handle any auth/CORS issues
          try {
            const blob = await chatterboxAPI.downloadAudio(filename);
            cachedUrl = URL.createObjectURL(blob);
            audioCache.current.set(chunkId, cachedUrl);
          } catch (downloadError) {
            console.error('Failed to download audio through API:', downloadError);
            // Fallback to direct URL
            cachedUrl = audioUrl;
          }
        }
        
        // Set source and play
        audioRef.current.src = cachedUrl;
        await audioRef.current.play();
        setPlayingId(chunkId);
      } catch (err) {
        console.error('Failed to play audio:', err);
        // Show user-friendly error
        const chunk = chunks.find(c => c.id === chunkId);
        if (chunk) {
          updateChunk(chunkId, { 
            error: `Playback failed: ${err instanceof Error ? err.message : 'Unknown error'}` 
          });
        }
        // Clear from cache if failed
        const cachedUrl = audioCache.current.get(chunkId);
        if (cachedUrl && cachedUrl.startsWith('blob:')) {
          URL.revokeObjectURL(cachedUrl);
        }
        audioCache.current.delete(chunkId);
        setPlayingId(null);
      } finally {
        setLoadingAudio(null);
      }
    }
  };

  const downloadChunk = async (chunk: import('@/lib/store').TextChunk) => {
    if (!chunk.audioUrl) return;
    
    try {
      // Extract filename from URL
      const audioFilename = chunk.audioUrl.split('/').pop() || '';
      
      // Use the API download method
      const blob = await chatterboxAPI.downloadAudio(audioFilename);
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Use filename if available, otherwise use chunk numbering
      const filename = chunk.filename 
        ? `${chunk.filename.replace(/\.[^/.]+$/, '')}.wav`
        : `chunk-${chunks.indexOf(chunk) + 1}.wav`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download chunk:', chunk.id, error);
      // Try direct link as fallback
      try {
        const a = document.createElement('a');
        a.href = chunk.audioUrl;
        a.download = chunk.filename || `chunk-${chunks.indexOf(chunk) + 1}.wav`;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (directError) {
        console.error('Direct download also failed:', directError);
        // Show error to user
        updateChunk(chunk.id, { 
          error: `Download failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
        });
      }
    }
  };

  const downloadAll = async () => {
    const completedChunks = chunks.filter(c => c.status === 'completed' && c.audioUrl);
    
    for (const chunk of completedChunks) {
      if (chunk.audioUrl) {
        try {
          // Use fetch directly to avoid axios interceptors
          const response = await fetch(chunk.audioUrl);
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `chunk-${chunk.id}.wav`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          // Small delay between downloads
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error('Failed to download chunk:', chunk.id, error);
        }
      }
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      setPlayingId(null);
      // Play next in queue if auto-play is enabled
      if (autoPlay && playQueue.length > 0) {
        const nextId = playQueue[0];
        setPlayQueue(prev => prev.slice(1));
        const chunk = chunks.find(c => c.id === nextId);
        if (chunk?.audioUrl) {
          setTimeout(() => playAudio(nextId, chunk.audioUrl), 100);
        }
      }
    };
    
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('ended', handleEnded);
    };
  }, [autoPlay, playQueue, chunks]);

  const completedCount = chunks.filter(c => c.status === 'completed').length;
  const totalCount = chunks.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Playlist</CardTitle>
            <CardDescription>
              {totalCount > 0 ? `${completedCount} / ${totalCount} completed` : 'No chunks added yet'}
            </CardDescription>
          </div>
          
          {totalCount > 0 && (
            <div className="flex items-center space-x-2">
              {isGenerating ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={cancelGeneration}
                >
                  <StopCircle className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generateAll}
                  disabled={!chunks.some(c => c.status === 'pending' || c.status === 'error')}
                >
                  <Volume2 className="mr-2 h-4 w-4" />
                  {chunks.some(c => c.status === 'completed') ? 'Generate Remaining' : 'Generate All'}
                </Button>
              )}
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowExportDialog(true)}
                disabled={completedCount === 0}
              >
                <FileDown className="mr-2 h-4 w-4" />
                Export
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={clearChunks}
                disabled={isGenerating}
              >
                Clear
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        {chunks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No text chunks yet.</p>
            <p className="text-sm mt-1">Add text to start generating audio.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {chunks.map((chunk) => (
              <ChunkItem
                key={chunk.id}
                chunk={chunk}
                onRegenerate={() => generateAudio(chunk.id)}
                onRemove={() => {
                  removeChunk(chunk.id);
                  // Clean up cached audio
                  const cachedUrl = audioCache.current.get(chunk.id);
                  if (cachedUrl && cachedUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(cachedUrl);
                  }
                  audioCache.current.delete(chunk.id);
                }}
                onPlay={() => chunk.audioUrl && playAudio(chunk.id, chunk.audioUrl)}
                onDownload={() => downloadChunk(chunk)}
                isPlaying={playingId === chunk.id}
                loadingAudio={loadingAudio}
              />
            ))}
          </div>
        )}
        
        <audio ref={audioRef} className="hidden" />
        
        <ExportDialog 
          open={showExportDialog} 
          onOpenChange={setShowExportDialog} 
        />
      </CardContent>
    </Card>
  );
}