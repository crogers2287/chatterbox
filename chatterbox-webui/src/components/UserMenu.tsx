import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { User, Settings, LogOut, Shield, BarChart3, BookOpen, Mic } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showUsage, setShowUsage] = useState(false);

  if (!user) return null;

  const usagePercentage = (used: number, max: number) => {
    return max > 0 ? (used / max) * 100 : 0;
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <User className="h-4 w-4" />
            {user.name}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end">
          <DropdownMenuLabel>
            <div>
              <p className="font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {location.pathname === '/audiobook' ? (
            <DropdownMenuItem onClick={() => navigate('/')}>
              <Mic className="mr-2 h-4 w-4" />
              Standard TTS Mode
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => navigate('/audiobook')}>
              <BookOpen className="mr-2 h-4 w-4" />
              Audiobook Mode
            </DropdownMenuItem>
          )}
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem onClick={() => setShowUsage(true)}>
            <BarChart3 className="mr-2 h-4 w-4" />
            Usage & Limits
          </DropdownMenuItem>
          
          <DropdownMenuItem onClick={() => navigate('/settings')}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </DropdownMenuItem>
          
          {user.role === 'admin' && (
            <DropdownMenuItem onClick={() => navigate('/admin')}>
              <Shield className="mr-2 h-4 w-4" />
              Admin Panel
            </DropdownMenuItem>
          )}
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem onClick={logout} className="text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Usage Dialog */}
      <Dialog open={showUsage} onOpenChange={setShowUsage}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Usage & Limits</DialogTitle>
            <DialogDescription>
              Your current usage and account limits
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Sessions</span>
                <span className="text-sm text-muted-foreground">
                  {user.storage.usedSessions} / {user.storage.maxSessions}
                </span>
              </div>
              <Progress 
                value={usagePercentage(user.storage.usedSessions, user.storage.maxSessions)} 
                className="h-2"
              />
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Saved Voices</span>
                <span className="text-sm text-muted-foreground">
                  {user.storage.usedVoices} / {user.storage.maxVoices}
                </span>
              </div>
              <Progress 
                value={usagePercentage(user.storage.usedVoices, user.storage.maxVoices)} 
                className="h-2"
              />
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Audio Minutes</span>
                <span className="text-sm text-muted-foreground">
                  {user.storage.usedAudioMinutes.toFixed(1)} / {user.storage.maxAudioMinutes}
                </span>
              </div>
              <Progress 
                value={usagePercentage(user.storage.usedAudioMinutes, user.storage.maxAudioMinutes)} 
                className="h-2"
              />
            </div>

            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Account created: {new Date(user.createdAt).toLocaleDateString()}
              </p>
              <p className="text-sm text-muted-foreground">
                Account type: {user.role === 'admin' ? 'Administrator' : 'Standard User'}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}