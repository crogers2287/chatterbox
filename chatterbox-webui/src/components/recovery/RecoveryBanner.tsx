import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { X, RotateCcw, Clock, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RecoveryBannerProps } from './types';

export function RecoveryBanner({
  session,
  onRestore,
  onDismiss,
  autoHide = false,
  autoHideDelay = 10000
}: RecoveryBannerProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (autoHide && autoHideDelay > 0) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, autoHideDelay);

      return () => clearTimeout(timer);
    }
  }, [autoHide, autoHideDelay]);

  useEffect(() => {
    // Trigger slide-in animation
    const timer = setTimeout(() => setIsAnimating(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffMins > 0) {
      return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    } else {
      return 'Just now';
    }
  };

  const handleRestore = () => {
    setIsVisible(false);
    onRestore(session.id);
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => onDismiss(session.id), 300);
  };

  if (!isVisible) {
    return null;
  }

  const textPreview = session.text.length > 60 
    ? session.text.substring(0, 60) + '...' 
    : session.text;

  return (
    <div className={cn(
      "fixed top-4 left-1/2 transform -translate-x-1/2 z-50 transition-all duration-300 ease-in-out max-w-md w-full mx-4",
      isAnimating ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
    )}>
      <Card className="p-4 bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <RotateCcw className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <div className="min-w-0">
              <h3 className="font-medium text-sm text-blue-900 dark:text-blue-100">
                Session Recovery Available
              </h3>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1 truncate">
                "{textPreview}"
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs text-blue-600 dark:text-blue-400">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{formatTimestamp(session.timestamp)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Volume2 className="h-3 w-3" />
                  <span>{session.clipCount} clip{session.clipCount !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              onClick={handleRestore}
              className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white"
            >
              Restore
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              className="h-8 w-8 p-0 hover:bg-blue-100 dark:hover:bg-blue-900"
              aria-label="Dismiss recovery notification"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}