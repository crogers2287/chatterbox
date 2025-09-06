import React, { useState } from 'react';
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
import { Save, Trash2, Upload, Plus, Clock } from 'lucide-react';

export function Sessions() {
  const { 
    sessions, 
    currentSessionId,
    saveSession, 
    loadSession, 
    deleteSession,
    newSession,
    chunks 
  } = useStore();
  
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [sessionName, setSessionName] = useState('');

  const handleSave = async () => {
    await saveSession(sessionName.trim() || undefined);
    setSessionName('');
    setSaveDialogOpen(false);
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleString();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Sessions</CardTitle>
            <CardDescription>
              Manage your text-to-speech sessions
            </CardDescription>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={newSession}
              disabled={chunks.length === 0}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Session
            </Button>
            
            <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" disabled={chunks.length === 0}>
                  <Save className="mr-2 h-4 w-4" />
                  Save Current
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Save Session</DialogTitle>
                  <DialogDescription>
                    Save the current chunks and settings as a session
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Input
                    placeholder="Session name..."
                    value={sessionName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSessionName(e.target.value)}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleSave()}
                  />
                  <p className="text-sm text-muted-foreground mt-2">
                    {chunks.length} chunks will be saved
                  </p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave}>
                    Save Session
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {sessions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No saved sessions yet.</p>
            <p className="text-sm mt-1">Save your current work to create a session.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  currentSessionId === session.id ? 'bg-primary/10 border border-primary' : 'bg-muted/50'
                }`}
              >
                <div className="flex-1">
                  <p className="font-medium">{session.name}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(session.updatedAt)}
                    </span>
                    <span>{session.chunks.length} chunks</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => await loadSession(session.id)}
                    disabled={currentSessionId === session.id}
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteSession(session.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}