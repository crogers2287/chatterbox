import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { create } from 'zustand';
import { createRecoverySlice, RecoverySlice } from '../slices/recoverySlice';
import { recoveryStorage, RecoverySession } from '../../storage';

// Mock the recovery storage
vi.mock('../../storage', () => ({
  recoveryStorage: {
    getAvailableSessions: vi.fn(),
    markSessionAsUsed: vi.fn(),
  },
}));

const mockRecoveryStorage = recoveryStorage as {
  getAvailableSessions: Mock;
  markSessionAsUsed: Mock;
};

// Mock recovery sessions for testing
const mockRecoverySessions: RecoverySession[] = [
  {
    id: 'session-1',
    metadata: {
      lastUpdated: Date.now() - 1000 * 60 * 30, // 30 minutes ago
      version: '1.0',
      userAgent: 'Test Agent',
      url: 'http://localhost:5173',
      title: 'Test Session',
    },
    stateData: {
      chunks: [{ id: '1', text: 'Test chunk', status: 'completed' }],
      parameters: { temperature: 0.8 },
    },
  },
  {
    id: 'session-2',
    metadata: {
      lastUpdated: Date.now() - 1000 * 60 * 60 * 25, // 25 hours ago (too old)
      version: '1.0',
      userAgent: 'Test Agent',
      url: 'http://localhost:5173',
      title: 'Old Session',
    },
    stateData: {
      chunks: [],
      parameters: { temperature: 0.7 },
    },
  },
  {
    id: 'session-3',
    metadata: {
      lastUpdated: Date.now() - 1000 * 60 * 10, // 10 minutes ago
      version: '1.0',
      userAgent: 'Test Agent',
      url: 'http://localhost:5173',
      title: 'Recent Session',
    },
    stateData: {
      chunks: [{ id: '2', text: 'Another chunk', status: 'pending' }],
      parameters: { temperature: 0.9 },
    },
  },
];

describe('Recovery Slice', () => {
  let store: ReturnType<typeof create<RecoverySlice>>;
  
  beforeEach(() => {
    // Reset mocks
    mockRecoveryStorage.getAvailableSessions.mockClear();
    mockRecoveryStorage.markSessionAsUsed.mockClear();
    
    // Create test store
    store = create<RecoverySlice>()(createRecoverySlice);
  });
  
  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = store.getState();
      
      expect(state.availableSessions).toEqual([]);
      expect(state.restoreInProgress).toBe(false);
      expect(state.restoreProgress).toBe(0);
      expect(state.restoreError).toBeNull();
      expect(state.showRecoveryBanner).toBe(false);
      expect(state.showRecoveryModal).toBe(false);
      expect(state.lastAutoSaveTime).toBeNull();
      expect(state.autoSaveEnabled).toBe(true);
      expect(state.autoSaveInterval).toBe(2);
    });
  });
  
  describe('discoverRecoverySessions', () => {
    it('should discover and filter valid sessions', async () => {
      mockRecoveryStorage.getAvailableSessions.mockResolvedValue(mockRecoverySessions);
      
      await store.getState().discoverRecoverySessions();
      
      const state = store.getState();
      
      // Should only include sessions from last 24 hours (session-1 and session-3)
      expect(state.availableSessions).toHaveLength(2);
      expect(state.availableSessions[0].id).toBe('session-1');
      expect(state.availableSessions[1].id).toBe('session-3');
      expect(state.showRecoveryBanner).toBe(true);
    });
    
    it('should handle no valid sessions', async () => {
      // Return only old sessions
      mockRecoveryStorage.getAvailableSessions.mockResolvedValue([mockRecoverySessions[1]]);
      
      await store.getState().discoverRecoverySessions();
      
      const state = store.getState();
      expect(state.availableSessions).toHaveLength(0);
      expect(state.showRecoveryBanner).toBe(false);
    });
    
    it('should handle discovery errors', async () => {
      mockRecoveryStorage.getAvailableSessions.mockRejectedValue(new Error('Network error'));
      
      await store.getState().discoverRecoverySessions();
      
      const state = store.getState();
      expect(state.availableSessions).toHaveLength(0);
      expect(state.restoreError).toBe('Failed to discover recovery sessions');
    });
  });
  
  describe('restoreSession', () => {
    beforeEach(async () => {
      mockRecoveryStorage.getAvailableSessions.mockResolvedValue([mockRecoverySessions[0]]);
      await store.getState().discoverRecoverySessions();
    });
    
    it('should restore a valid session', async () => {
      mockRecoveryStorage.markSessionAsUsed.mockResolvedValue(undefined);
      
      await store.getState().restoreSession('session-1');
      
      const state = store.getState();
      
      expect(state.restoreInProgress).toBe(false);
      expect(state.restoreProgress).toBe(0);
      expect(state.restoreError).toBeNull();
      expect(state.availableSessions).toHaveLength(0); // Session should be removed
      expect(state.showRecoveryBanner).toBe(false);
      expect(state.showRecoveryModal).toBe(false);
      
      expect(mockRecoveryStorage.markSessionAsUsed).toHaveBeenCalledWith('session-1');
    });
    
    it('should handle session not found', async () => {
      await store.getState().restoreSession('non-existent-session');
      
      const state = store.getState();
      expect(state.restoreError).toBe('Session not found');
      expect(state.restoreInProgress).toBe(false);
    });
    
    it('should handle restore errors', async () => {
      mockRecoveryStorage.markSessionAsUsed.mockRejectedValue(new Error('Storage error'));
      
      await store.getState().restoreSession('session-1');
      
      const state = store.getState();
      expect(state.restoreError).toBe('Storage error');
      expect(state.restoreInProgress).toBe(false);
      expect(state.restoreProgress).toBe(0);
    });
    
    it('should show progress during restore', async () => {
      let progressUpdates: number[] = [];
      
      // Mock a slow markSessionAsUsed to capture progress updates
      mockRecoveryStorage.markSessionAsUsed.mockImplementation(async () => {
        // Capture progress at different stages
        const state = store.getState();
        progressUpdates.push(state.restoreProgress);
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      
      await store.getState().restoreSession('session-1');
      
      // Should have progressed through different stages
      expect(progressUpdates.some(p => p > 0)).toBe(true);
    });
  });
  
  describe('dismissRecovery', () => {
    beforeEach(async () => {
      mockRecoveryStorage.getAvailableSessions.mockResolvedValue(mockRecoverySessions.slice(0, 2));
      await store.getState().discoverRecoverySessions();
    });
    
    it('should dismiss specific session', async () => {
      mockRecoveryStorage.markSessionAsUsed.mockResolvedValue(undefined);
      
      await store.getState().dismissRecovery('session-1');
      
      const state = store.getState();
      expect(state.availableSessions).toHaveLength(0); // Only one valid session was loaded
      expect(state.showRecoveryBanner).toBe(false);
      
      expect(mockRecoveryStorage.markSessionAsUsed).toHaveBeenCalledWith('session-1');
    });
    
    it('should just hide UI when no sessionId provided', async () => {
      const initialSessionCount = store.getState().availableSessions.length;
      
      await store.getState().dismissRecovery();
      
      const state = store.getState();
      expect(state.availableSessions).toHaveLength(initialSessionCount); // Sessions unchanged
      expect(state.showRecoveryBanner).toBe(false);
      expect(state.showRecoveryModal).toBe(false);
      
      expect(mockRecoveryStorage.markSessionAsUsed).not.toHaveBeenCalled();
    });
    
    it('should handle dismiss errors gracefully', async () => {
      mockRecoveryStorage.markSessionAsUsed.mockRejectedValue(new Error('Storage error'));
      
      // Should not throw
      await expect(store.getState().dismissRecovery('session-1')).resolves.toBeUndefined();
    });
  });
  
  describe('dismissAllRecovery', () => {
    beforeEach(async () => {
      mockRecoveryStorage.getAvailableSessions.mockResolvedValue([mockRecoverySessions[0]]);
      await store.getState().discoverRecoverySessions();
    });
    
    it('should dismiss all sessions', async () => {
      mockRecoveryStorage.markSessionAsUsed.mockResolvedValue(undefined);
      
      await store.getState().dismissAllRecovery();
      
      const state = store.getState();
      expect(state.availableSessions).toHaveLength(0);
      expect(state.showRecoveryBanner).toBe(false);
      expect(state.showRecoveryModal).toBe(false);
      
      expect(mockRecoveryStorage.markSessionAsUsed).toHaveBeenCalledWith('session-1');
    });
    
    it('should handle errors when dismissing all sessions', async () => {
      mockRecoveryStorage.markSessionAsUsed.mockRejectedValue(new Error('Storage error'));
      
      // Should not throw
      await expect(store.getState().dismissAllRecovery()).resolves.toBeUndefined();
    });
  });
  
  describe('UI State Management', () => {
    it('should manage recovery banner visibility', () => {
      expect(store.getState().showRecoveryBanner).toBe(false);
      
      store.getState().setShowRecoveryBanner(true);
      expect(store.getState().showRecoveryBanner).toBe(true);
      
      store.getState().setShowRecoveryBanner(false);
      expect(store.getState().showRecoveryBanner).toBe(false);
    });
    
    it('should manage recovery modal visibility', () => {
      expect(store.getState().showRecoveryModal).toBe(false);
      
      store.getState().setShowRecoveryModal(true);
      expect(store.getState().showRecoveryModal).toBe(true);
      
      store.getState().setShowRecoveryModal(false);
      expect(store.getState().showRecoveryModal).toBe(false);
    });
  });
  
  describe('Auto-save Configuration', () => {
    it('should manage auto-save enabled flag', () => {
      expect(store.getState().autoSaveEnabled).toBe(true);
      
      store.getState().setAutoSaveEnabled(false);
      expect(store.getState().autoSaveEnabled).toBe(false);
      
      store.getState().setAutoSaveEnabled(true);
      expect(store.getState().autoSaveEnabled).toBe(true);
    });
    
    it('should manage auto-save interval', () => {
      expect(store.getState().autoSaveInterval).toBe(2);
      
      store.getState().setAutoSaveInterval(5);
      expect(store.getState().autoSaveInterval).toBe(5);
      
      store.getState().setAutoSaveInterval(1);
      expect(store.getState().autoSaveInterval).toBe(1);
    });
  });
  
  describe('Internal State Updates', () => {
    it('should manage restore progress', () => {
      expect(store.getState().restoreInProgress).toBe(false);
      expect(store.getState().restoreProgress).toBe(0);
      
      store.getState().setRestoreInProgress(true);
      store.getState().setRestoreProgress(50);
      
      expect(store.getState().restoreInProgress).toBe(true);
      expect(store.getState().restoreProgress).toBe(50);
      
      store.getState().setRestoreInProgress(false);
      store.getState().setRestoreProgress(100);
      
      expect(store.getState().restoreInProgress).toBe(false);
      expect(store.getState().restoreProgress).toBe(100);
    });
    
    it('should manage restore errors', () => {
      expect(store.getState().restoreError).toBeNull();
      
      store.getState().setRestoreError('Test error');
      expect(store.getState().restoreError).toBe('Test error');
      
      store.getState().setRestoreError(null);
      expect(store.getState().restoreError).toBeNull();
    });
  });
});