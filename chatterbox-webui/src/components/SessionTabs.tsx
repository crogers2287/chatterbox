import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
// import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useStore } from '@/lib/store';
import { Plus, X, Save, FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SessionTabs() {
  const {
    sessions,
    currentSessionId,
    saveSession,
    loadSession,
    deleteSession,
    newSession,
    chunks
  } = useStore();

  const [renameDialogOpen, setRenameDialogOpen] = React.useState(false);
  const [sessionToRename, setSessionToRename] = React.useState<string | null>(null);
  const [newName, setNewName] = React.useState('');

  const currentSession = sessions.find(s => s.id === currentSessionId);
  
  const handleNewSession = async () => {
    // Save current session if it has chunks
    if (chunks.length > 0 && !currentSessionId) {
      await saveSession(`Session ${new Date().toLocaleDateString()}`);
    }
    newSession();
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this session?')) {
      deleteSession(sessionId);
    }
  };

  const handleRenameSession = () => {
    if (sessionToRename && newName.trim()) {
      const session = sessions.find(s => s.id === sessionToRename);
      if (session) {
        // Update session name in store
        const updatedSessions = sessions.map(s => 
          s.id === sessionToRename ? { ...s, name: newName.trim() } : s
        );
        localStorage.setItem('sessions', JSON.stringify(updatedSessions));
        useStore.setState({ sessions: updatedSessions });
      }
      setRenameDialogOpen(false);
      setSessionToRename(null);
      setNewName('');
    }
  };

  const handleSaveCurrentSession = async () => {
    // Always use the saveSession function to ensure audio is persisted
    await saveSession(currentSession?.name || `Session ${new Date().toLocaleDateString()}`);
  };

  return (
    <div className="w-full">
      <Tabs 
        value={currentSessionId || 'current'} 
        onValueChange={(value) => {
          if (value !== 'current') {
            loadSession(value);
          }
        }}
        className="w-full"
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 overflow-x-auto">
            <TabsList className="inline-flex h-10 items-center justify-start rounded-md bg-muted p-1 text-muted-foreground w-auto min-w-full">
              <TabsTrigger value="current" className="px-3 whitespace-nowrap">
                <FileText className="w-4 h-4 mr-2" />
                {currentSession ? currentSession.name : 'Current Session'}
              </TabsTrigger>
              
              {sessions.map((session) => (
                <TabsTrigger 
                  key={session.id} 
                  value={session.id}
                  className="px-3 group relative whitespace-nowrap"
                >
                  <span 
                    className="cursor-pointer"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setSessionToRename(session.id);
                      setNewName(session.name);
                      setRenameDialogOpen(true);
                    }}
                  >
                    {session.name}
                  </span>
                  <button
                    className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => handleDeleteSession(session.id, e)}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveCurrentSession}
              disabled={chunks.length === 0}
            >
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
            
            <Button
              size="sm"
              variant="outline"
              onClick={handleNewSession}
            >
              <Plus className="w-4 h-4 mr-2" />
              New
            </Button>
          </div>
        </div>
      </Tabs>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Session</DialogTitle>
            <DialogDescription>
              Enter a new name for this session
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Session Name</Label>
              <Input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRenameSession()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRenameSession}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}