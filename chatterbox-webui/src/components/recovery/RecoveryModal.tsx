import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RotateCcw, Search, X, SelectAll, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RecoveryModalProps } from './types';
import { SessionCard } from './SessionCard';

export function RecoveryModal({
  sessions,
  isOpen,
  onClose,
  onRestoreSession,
  onRestoreSelected,
  onRestoreAll,
  onDeleteSession
}: RecoveryModalProps) {
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'timestamp' | 'clipCount'>('timestamp');

  // Reset selected sessions when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedSessions(new Set());
      setSearchTerm('');
    }
  }, [isOpen]);

  const filteredSessions = sessions
    .filter(session => 
      searchTerm === '' || 
      session.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.voiceId.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'timestamp') {
        return b.timestamp - a.timestamp; // Most recent first
      } else {
        return b.clipCount - a.clipCount; // Most clips first
      }
    });

  const handleSelectSession = (sessionId: string) => {
    const newSelected = new Set(selectedSessions);
    if (newSelected.has(sessionId)) {
      newSelected.delete(sessionId);
    } else {
      newSelected.add(sessionId);
    }
    setSelectedSessions(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedSessions.size === filteredSessions.length) {
      // Deselect all
      setSelectedSessions(new Set());
    } else {
      // Select all filtered sessions
      setSelectedSessions(new Set(filteredSessions.map(s => s.id)));
    }
  };

  const handleRestoreSelected = () => {
    if (selectedSessions.size > 0) {
      onRestoreSelected(Array.from(selectedSessions));
      onClose();
    }
  };

  const handleRestoreAll = () => {
    onRestoreAll();
    onClose();
  };

  const handleRestoreSession = (sessionId: string) => {
    onRestoreSession(sessionId);
    onClose();
  };

  const getTotalClips = () => {
    return sessions.reduce((total, session) => total + session.clipCount, 0);
  };

  const getSelectedClips = () => {
    return sessions
      .filter(session => selectedSessions.has(session.id))
      .reduce((total, session) => total + session.clipCount, 0);
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Session Recovery
          </DialogTitle>
          <DialogDescription>
            {sessions.length} session{sessions.length !== 1 ? 's' : ''} available for recovery 
            ({getTotalClips()} total audio clips)
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {/* Search and Controls */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search sessions by text or voice..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'timestamp' | 'clipCount')}
              className="px-3 py-2 border border-input bg-background rounded-md text-sm"
            >
              <option value="timestamp">Sort by Date</option>
              <option value="clipCount">Sort by Clips</option>
            </select>
            
            <Button
              variant="outline"
              onClick={handleSelectAll}
              className="whitespace-nowrap"
            >
              <SelectAll className="h-4 w-4 mr-1" />
              {selectedSessions.size === filteredSessions.length ? 'Deselect All' : 'Select All'}
            </Button>
          </div>

          {/* Session List */}
          <div className="flex-1 border rounded-md overflow-y-auto">
            <div className="p-4 space-y-3">
              {filteredSessions.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-muted-foreground mb-2">
                    {searchTerm ? 'No matching sessions' : 'No sessions found'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {searchTerm 
                      ? 'Try adjusting your search terms.' 
                      : 'No recovery sessions are available.'}
                  </p>
                </div>
              ) : (
                filteredSessions.map(session => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    isSelected={selectedSessions.has(session.id)}
                    onSelect={handleSelectSession}
                    onRestore={handleRestoreSession}
                    onDelete={onDeleteSession}
                    showPreview={true}
                  />
                ))
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="text-sm text-muted-foreground">
              {selectedSessions.size > 0 && (
                <span>
                  {selectedSessions.size} session{selectedSessions.size !== 1 ? 's' : ''} selected
                  ({getSelectedClips()} clips)
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              
              {selectedSessions.size > 0 && (
                <Button onClick={handleRestoreSelected}>
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Restore Selected ({selectedSessions.size})
                </Button>
              )}
              
              <Button 
                onClick={handleRestoreAll}
                variant="destructive"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Restore All Sessions
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}