import { useEffect } from 'react';

export function useDebugStorage() {
  useEffect(() => {
    // Log initial state
    console.log('[Storage Debug] Initial localStorage state:', {
      keys: Object.keys(localStorage),
      savedVoices: localStorage.getItem('chatterbox_saved_voices'),
      oldSavedVoices: localStorage.getItem('savedVoices'),
      currentUserId: localStorage.getItem('currentUserId'),
    });

    // Monitor storage changes
    const originalSetItem = localStorage.setItem;
    const originalRemoveItem = localStorage.removeItem;
    const originalClear = localStorage.clear;

    localStorage.setItem = function(key: string, value: string) {
      console.log(`[Storage Debug] setItem('${key}', '${value.substring(0, 100)}...')`);
      return originalSetItem.apply(this, [key, value]);
    };

    localStorage.removeItem = function(key: string) {
      console.log(`[Storage Debug] removeItem('${key}')`);
      return originalRemoveItem.apply(this, [key]);
    };

    localStorage.clear = function() {
      console.log('[Storage Debug] clear() called!');
      console.trace('Clear called from:');
      return originalClear.apply(this);
    };

    return () => {
      // Restore original functions
      localStorage.setItem = originalSetItem;
      localStorage.removeItem = originalRemoveItem;
      localStorage.clear = originalClear;
    };
  }, []);
}