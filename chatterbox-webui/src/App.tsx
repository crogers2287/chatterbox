import React, { useEffect } from 'react';
import { TextInput } from '@/components/TextInput';
import { VoiceReference } from '@/components/VoiceReference';
import { TTSParameters } from '@/components/TTSParameters';
import { Playlist } from '@/components/Playlist';
import { StatusBar } from '@/components/StatusBar';
import { SavedVoices } from '@/components/SavedVoices';
import { Sessions } from '@/components/Sessions';
import { BatchProcessing } from '@/components/BatchProcessing';
import { SessionTabs } from '@/components/SessionTabs';
import { UserMenu } from '@/components/UserMenu';
import { BookOpen, Archive } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { StreamingDemo } from '@/components/StreamingDemo';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDebugStorage } from '@/hooks/useDebugStorage';
import { Button } from '@/components/ui/button';
import '@/lib/diagnostics'; // Auto-run diagnostics in dev mode

function App() {
  // Debug storage issues
  useDebugStorage();
  
  // Prevent default drag and drop behavior that opens files in browser
  useEffect(() => {
    const preventDefaults = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      document.addEventListener(eventName, preventDefaults, false);
      document.body.addEventListener(eventName, preventDefaults, false);
    });

    return () => {
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.removeEventListener(eventName, preventDefaults, false);
        document.body.removeEventListener(eventName, preventDefaults, false);
      });
    };
  }, []);
  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <BookOpen className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">Chatterbox TTS</h1>
              <span className="text-sm text-muted-foreground hidden sm:inline">
                High-quality text-to-speech synthesis with voice cloning
              </span>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open('/archive.html', '_blank')}
                className="flex items-center gap-2"
              >
                <Archive className="h-4 w-4" />
                Archive
              </Button>
              <UserMenu />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="main" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="main">Main TTS</TabsTrigger>
            <TabsTrigger value="streaming">Streaming Demo</TabsTrigger>
          </TabsList>
          
          <TabsContent value="main" className="space-y-6">
            {/* Session Tabs */}
            <div className="mb-6">
              <SessionTabs />
            </div>
            
            <div className="grid gap-6 xl:grid-cols-12 lg:grid-cols-3">
              {/* Left Column - Input & Voice */}
              <div className="xl:col-span-3 lg:col-span-1 space-y-6">
                <TextInput />
                <VoiceReference />
                <TTSParameters />
              </div>

              {/* Middle Column - Playlist */}
              <div className="xl:col-span-6 lg:col-span-1">
                <Playlist />
              </div>

              {/* Right Column - Saved Voices & Batch */}
              <div className="xl:col-span-3 lg:col-span-1 space-y-6">
                <SavedVoices />
                <BatchProcessing />
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="streaming">
            <StreamingDemo />
          </TabsContent>
        </Tabs>
      </main>

      {/* Status Bar */}
      <StatusBar />
    </div>
  );
}

export default App;