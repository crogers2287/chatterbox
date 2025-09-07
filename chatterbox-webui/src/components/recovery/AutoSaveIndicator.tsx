import React from 'react';
import { Check, X, Loader2, Save } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { AutoSaveIndicatorProps } from './types';

export function AutoSaveIndicator({
  state,
  showTooltip = true,
  position = 'bottom-right'
}: AutoSaveIndicatorProps) {
  const getIcon = () => {
    switch (state.status) {
      case 'saving':
        return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
      case 'saved':
        return <Check className="h-3 w-3 text-green-500" />;
      case 'error':
        return <X className="h-3 w-3 text-red-500" />;
      case 'idle':
      default:
        return <Save className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const getTooltipText = () => {
    switch (state.status) {
      case 'saving':
        return 'Saving session...';
      case 'saved':
        return state.lastSaveTime 
          ? `Last saved at ${new Date(state.lastSaveTime).toLocaleTimeString()}`
          : 'Session saved';
      case 'error':
        return state.error || 'Save failed';
      case 'idle':
      default:
        return 'Auto-save ready';
    }
  };

  const getPositionClasses = () => {
    switch (position) {
      case 'top-left':
        return 'top-4 left-4';
      case 'top-right':
        return 'top-4 right-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      case 'bottom-right':
      default:
        return 'bottom-4 right-4';
    }
  };

  const getBgColor = () => {
    switch (state.status) {
      case 'saving':
        return 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800';
      case 'saved':
        return 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800';
      case 'error':
        return 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800';
      case 'idle':
      default:
        return 'bg-muted border-muted-foreground/20';
    }
  };

  const indicator = (
    <div
      className={cn(
        "fixed z-40 p-2 rounded-full border transition-all duration-300 shadow-sm",
        getPositionClasses(),
        getBgColor(),
        state.status === 'saving' && "scale-110",
        state.status === 'saved' && "animate-pulse duration-1000"
      )}
      role="status"
      aria-live="polite"
      aria-label={getTooltipText()}
    >
      {getIcon()}
    </div>
  );

  if (!showTooltip) {
    return indicator;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {indicator}
        </TooltipTrigger>
        <TooltipContent
          side={position.includes('top') ? 'bottom' : 'top'}
          align={position.includes('left') ? 'start' : 'end'}
          className="text-sm"
        >
          {getTooltipText()}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}