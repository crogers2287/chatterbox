import React, { useRef, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic, Upload, X, Play, Pause, CircleDot, Square, MicOff } from 'lucide-react';
import { useStore } from '@/lib/store';

export function VoiceReference() {
  const { voiceReference, setVoiceReference } = useStore();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioUrlRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clean up the previous audio URL when component unmounts or file changes
    return () => {
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'audio/*': ['.mp3', '.wav', '.m4a', '.ogg', '.flac'],
    },
    multiple: false,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        console.log('[VoiceReference] File uploaded:', file.name, file.size, file.type);
        setVoiceReference(file);
        
        // Clean up previous URL
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
        }
        
        // Create new URL
        audioUrlRef.current = URL.createObjectURL(file);
        if (audioRef.current) {
          audioRef.current.src = audioUrlRef.current;
        }
      }
    },
  });

  const removeVoiceReference = () => {
    console.log('[VoiceReference] Removing voice reference');
    setVoiceReference(null);
    setIsPlaying(false);
    
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    
    if (audioRef.current) {
      audioRef.current.src = '';
    }
  };

  const togglePlayback = () => {
    if (!audioRef.current || !voiceReference) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { 
          type: mediaRecorder.mimeType 
        });
        
        // Convert to WAV format for better compatibility
        const file = new File([blob], `voice-recording-${Date.now()}.webm`, {
          type: mediaRecorder.mimeType,
          lastModified: Date.now()
        });
        
        setVoiceReference(file);
        
        // Create URL for playback
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
        }
        audioUrlRef.current = URL.createObjectURL(blob);
        if (audioRef.current) {
          audioRef.current.src = audioUrlRef.current;
        }
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Failed to access microphone. Please ensure you have granted microphone permissions.');
    }
  };
  
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voice Reference</CardTitle>
        <CardDescription>
          Upload a short audio sample to clone the voice (optional)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!voiceReference ? (
          isRecording ? (
            <div className="space-y-4">
              <div className="border-2 border-destructive rounded-lg p-8 text-center bg-destructive/10">
                <CircleDot className="mx-auto h-12 w-12 text-destructive mb-4 animate-pulse" />
                <p className="text-lg font-medium mb-2">Recording...</p>
                <p className="text-2xl font-mono mb-4">{formatTime(recordingTime)}</p>
                <Button
                  onClick={stopRecording}
                  variant="destructive"
                  size="lg"
                >
                  <Square className="mr-2 h-4 w-4" />
                  Stop Recording
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  isDragActive ? 'border-primary bg-primary/10' : 'border-muted-foreground/25 hover:border-primary'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-1">
                  {isDragActive
                    ? 'Drop the audio file here...'
                    : 'Drag & drop an audio file here, or click to select'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Supports: .mp3, .wav, .m4a, .ogg, .flac
                </p>
              </div>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or</span>
                </div>
              </div>
              
              <div className="flex justify-center">
                <Button
                  onClick={startRecording}
                  variant="default"
                  size="lg"
                  className="w-full max-w-xs"
                >
                  <Mic className="mr-2 h-4 w-4" />
                  Record Voice Sample
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div className="flex items-center space-x-3">
                <Mic className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{voiceReference.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(voiceReference.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={togglePlayback}
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={removeVoiceReference}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Voice reference uploaded successfully
              </p>
            </div>
          </div>
        )}
        
        <audio
          ref={audioRef}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
      </CardContent>
    </Card>
  );
}