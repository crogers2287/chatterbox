import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useStore } from '@/lib/store';
import { chatterboxAPI } from '@/lib/api';
import { Download, Loader2 } from 'lucide-react';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const { chunks } = useStore();
  const [exportFormat, setExportFormat] = useState<'single' | 'chapters'>('single');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState('');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const completedChunks = chunks.filter(c => c.status === 'completed' && c.audioUrl);

  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress(0);
    setExportMessage('');
    setDownloadUrl(null);

    try {
      if (exportFormat === 'single') {
        // Concatenate all audio files into a single MP3
        const audioUrls = completedChunks
          .filter(chunk => chunk.audioUrl)
          .map(chunk => chunk.audioUrl!);
        
        if (audioUrls.length === 0) {
          setExportMessage('No audio files to export');
          return;
        }

        setExportMessage('Preparing export...');
        setExportProgress(25);

        // Filter to only use server-side URLs (not blob URLs)
        const serverUrls = audioUrls.filter(url => url.startsWith('/audio/'));
        
        if (serverUrls.length === 0) {
          setExportMessage('No server-side audio files available for export');
          return;
        }
        
        if (serverUrls.length < audioUrls.length) {
          setExportMessage(`Using ${serverUrls.length} of ${audioUrls.length} files (blob URLs not supported)`);
        }

        setExportMessage('Combining audio files...');
        setExportProgress(50);

        // Call the concatenation API
        const result = await chatterboxAPI.concatenateAudio(serverUrls, 'mp3');
        
        if (result.success && result.audio_url) {
          setExportProgress(80);
          setExportMessage('Preparing download...');
          
          // Simple download approach like archive page
          const fullUrl = chatterboxAPI.getAudioUrl(result.audio_url.replace('/audio/', ''));
          
          setExportProgress(100);
          setExportMessage('Export complete! Download should start automatically.');
          setDownloadUrl(fullUrl);
          
          // Auto-trigger download
          const a = document.createElement('a');
          a.href = fullUrl;
          a.download = `chatterbox_combined_${new Date().toISOString().split('T')[0]}.mp3`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          throw new Error('Failed to create combined audio file');
        }
      } else {
        // Download as separate chapters
        for (let i = 0; i < completedChunks.length; i++) {
          const chunk = completedChunks[i];
          if (chunk.audioUrl) {
            const progress = ((i + 1) / completedChunks.length) * 100;
            setExportProgress(progress);
            setExportMessage(`Downloading file ${i + 1} of ${completedChunks.length}...`);
            
            const response = await fetch(chunk.audioUrl);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            // Use filename if available, otherwise use chapter numbering
            const filename = chunk.filename 
              ? `${chunk.filename.replace(/\.[^/.]+$/, '')}.wav`
              : `chapter-${i + 1}.wav`;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            
            // Small delay between downloads
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        setExportMessage('Export complete!');
      }

      // Don't auto-close if we have a download URL
      if (!downloadUrl) {
        await new Promise(resolve => setTimeout(resolve, 500));
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Export failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // If we got a concatenation result, provide direct download link
      if (exportFormat === 'single' && result?.success && result?.audio_url) {
        const directUrl = chatterboxAPI.getAudioUrl(result.audio_url.replace('/audio/', ''));
        setDownloadUrl(directUrl);
        setExportMessage(`Export failed during download: ${errorMessage}. Use the link below to download manually.`);
        setExportProgress(100);
      } else {
        setExportMessage(`Export failed: ${errorMessage}`);
        setExportProgress(0);
      }
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Export Audio</DialogTitle>
          <DialogDescription>
            Choose how you want to export your generated audio files.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <RadioGroup value={exportFormat} onValueChange={(value: any) => setExportFormat(value)}>
            <div className="flex items-center space-x-2 mb-4">
              <RadioGroupItem value="single" id="single" />
              <Label htmlFor="single" className="flex-1 cursor-pointer">
                <div>
                  <p className="font-medium">Single File</p>
                  <p className="text-sm text-muted-foreground">
                    Combine all audio into one continuous file
                  </p>
                </div>
              </Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="chapters" id="chapters" />
              <Label htmlFor="chapters" className="flex-1 cursor-pointer">
                <div>
                  <p className="font-medium">Separate Chapters</p>
                  <p className="text-sm text-muted-foreground">
                    Export each chunk as a separate audio file
                  </p>
                </div>
              </Label>
            </div>
          </RadioGroup>
          
          <div className="mt-4 p-3 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              {completedChunks.length} audio files ready for export
            </p>
          </div>
          
          {(isExporting || downloadUrl) && (
            <div className="mt-4 space-y-2">
              {isExporting && (
                <>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${exportProgress}%` }}
                    />
                  </div>
                  {exportMessage && (
                    <p className="text-sm text-center text-muted-foreground">
                      {exportMessage}
                    </p>
                  )}
                </>
              )}
              
              {downloadUrl && exportProgress === 100 && (
                <div className="text-center">
                  <a 
                    href={downloadUrl} 
                    download="audiobook.mp3"
                    className="text-sm text-primary hover:underline"
                  >
                    Click here if download didn't start automatically
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => {
              if (downloadUrl) {
                URL.revokeObjectURL(downloadUrl);
                setDownloadUrl(null);
              }
              setExportProgress(0);
              setExportMessage('');
              onOpenChange(false);
            }}
          >
            {isExporting ? 'Cancel' : 'Close'}
          </Button>
          <Button 
            onClick={handleExport} 
            disabled={isExporting || completedChunks.length === 0}
          >
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Export
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}