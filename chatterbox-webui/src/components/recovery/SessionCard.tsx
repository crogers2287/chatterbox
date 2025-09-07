import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Play, Pause, RotateCcw, Trash2, Clock, Volume2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SessionCardProps } from './types';

export function SessionCard({
  session,
  isSelected,
  onSelect,
  onRestore,
  onDelete,
  showPreview = true
}: SessionCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  };

  const formatDuration = (duration: number | undefined) => {
    if (!duration) return 'Unknown';
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handlePlayPreview = async () => {
    if (isPlaying) {
      // Stop current playback
      if (currentAudio) {
        currentAudio.pause();
        setCurrentAudio(null);
      }
      setIsPlaying(false);
      return;
    }

    // Start playback of first audio chunk
    if (session.audioChunks.length > 0) {
      const audioBlob = session.audioChunks[0];
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        setIsPlaying(false);
        setCurrentAudio(null);
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = () => {
        setIsPlaying(false);
        setCurrentAudio(null);
        URL.revokeObjectURL(audioUrl);
      };

      try {
        await audio.play();
        setIsPlaying(true);
        setCurrentAudio(audio);
      } catch (error) {
        console.error('Failed to play preview:', error);
        URL.revokeObjectURL(audioUrl);
      }
    }
  };

  const textPreview = session.text.length > 120 
    ? session.text.substring(0, 120) + '...' 
    : session.text;

  const { date, time } = formatTimestamp(session.timestamp);

  return (
    <Card className={cn(
      "p-4 transition-all duration-200 hover:shadow-md",
      isSelected && "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950/30"
    )}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(session.id)}
          className="mt-1 h-4 w-4 rounded border border-input bg-background text-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={`Select session from ${date}`}
        />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Clock className="h-4 w-4" />
                <span>{date} at {time}</span>
              </div>
              
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Volume2 className="h-3 w-3" />
                  <span>{session.clipCount} clip{session.clipCount !== 1 ? 's' : ''}</span>
                </div>
                
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  <span>{session.voiceId}</span>
                </div>
                
                {session.duration && (
                  <div className="flex items-center gap-1">
                    <span>{formatDuration(session.duration)}</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              {showPreview && session.audioChunks.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handlePlayPreview}
                  className="h-8 w-8 p-0"
                  aria-label={isPlaying ? "Stop preview" : "Play preview"}
                >
                  {isPlaying ? 
                    <Pause className="h-4 w-4" /> : 
                    <Play className="h-4 w-4" />
                  }
                </Button>
              )}
              
              <Button
                size="sm"
                onClick={() => onRestore(session.id)}
                className="h-8 px-3"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Restore
              </Button>
              
              {onDelete && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDelete(session.id)}
                  className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950"
                  aria-label="Delete session"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          
          <div className="bg-muted/50 p-3 rounded-md">
            <p className="text-sm text-foreground leading-relaxed">
              "{textPreview}"
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}