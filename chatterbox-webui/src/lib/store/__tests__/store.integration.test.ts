import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { useStore, disposePersistenceMiddleware } from '../index';
import { storageManager } from '../../storage';

// Mock dependencies
vi.mock('../../storage', () => ({
  storageManager: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
  recoveryStorage: {
    getAvailableSessions: vi.fn().mockResolvedValue([]),
    markSessionAsUsed: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../voiceApi', () => ({
  voiceAPI: {
    saveVoice: vi.fn(),
    listVoices: vi.fn().mockResolvedValue([]),
    deleteVoice: vi.fn().mockResolvedValue(true),
  },
}));

const mockStorageManager = storageManager as {
  get: Mock;
  set: Mock;
  delete: Mock;
};

describe('Store Integration Tests', () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    mockStorageManager.get.mockResolvedValue(null);
    mockStorageManager.set.mockResolvedValue(undefined);
    mockStorageManager.delete.mockResolvedValue(undefined);
  });
  
  afterEach(() => {
    disposePersistenceMiddleware();
  });
  
  describe('Store Initialization', () => {
    it('should initialize with correct default state', () => {
      const state = useStore.getState();
      
      // Core app state
      expect(state.chunks).toEqual([]);
      expect(state.voiceReference).toBeNull();
      expect(state.parameters).toEqual({
        exaggeration: 0.5,
        temperature: 0.8,
        cfg_weight: 0.5,
        min_p: 0.05,
        top_p: 1.0,
        repetition_penalty: 1.2,
        seed: null,
        speech_rate: 1.0,
      });
      expect(state.ttsEngine).toBe('chatterbox');
      expect(state.useStreaming).toBe(false);
      
      // Generation state
      expect(state.isGenerating).toBe(false);
      expect(state.currentGeneratingId).toBeNull();
      
      // System status
      expect(state.systemStatus).toEqual({
        healthy: false,
        gpuAvailable: false,
        modelLoaded: false,
      });
      
      // Sessions and batch
      expect(state.sessions).toEqual([]);
      expect(state.currentSessionId).toBeNull();
      expect(state.batchItems).toEqual([]);
      
      // Recovery state
      expect(state.availableSessions).toEqual([]);
      expect(state.restoreInProgress).toBe(false);
      expect(state.autoSaveEnabled).toBe(true);
      expect(state.autoSaveInterval).toBe(2);
    });
  });
  
  describe('Text Chunk Management', () => {
    it('should add chunks correctly', () => {
      const state = useStore.getState();
      
      state.addChunk('Test chunk 1');
      state.addChunk('Test chunk 2');
      
      const updatedState = useStore.getState();
      expect(updatedState.chunks).toHaveLength(2);
      expect(updatedState.chunks[0].text).toBe('Test chunk 1');
      expect(updatedState.chunks[0].status).toBe('pending');
      expect(updatedState.chunks[1].text).toBe('Test chunk 2');
    });
    
    it('should update chunks correctly', () => {
      const state = useStore.getState();
      state.addChunk('Test chunk');
      
      const chunkId = useStore.getState().chunks[0].id;
      state.updateChunk(chunkId, { status: 'completed', audioUrl: 'test.wav' });
      
      const updatedState = useStore.getState();
      expect(updatedState.chunks[0].status).toBe('completed');
      expect(updatedState.chunks[0].audioUrl).toBe('test.wav');
    });
    
    it('should remove chunks correctly', () => {
      const state = useStore.getState();
      state.addChunk('Test chunk 1');
      state.addChunk('Test chunk 2');
      
      const chunkId = useStore.getState().chunks[0].id;
      state.removeChunk(chunkId);
      
      const updatedState = useStore.getState();
      expect(updatedState.chunks).toHaveLength(1);
      expect(updatedState.chunks[0].text).toBe('Test chunk 2');
    });
    
    it('should clear all chunks', () => {
      const state = useStore.getState();
      state.addChunk('Test chunk 1');
      state.addChunk('Test chunk 2');
      
      state.clearChunks();
      
      const updatedState = useStore.getState();
      expect(updatedState.chunks).toHaveLength(0);
    });
  });
  
  describe('Parameters Management', () => {
    it('should update parameters correctly', () => {
      const state = useStore.getState();
      
      state.updateParameters({ temperature: 0.9, seed: 12345 });
      
      const updatedState = useStore.getState();
      expect(updatedState.parameters.temperature).toBe(0.9);
      expect(updatedState.parameters.seed).toBe(12345);
      // Other parameters should remain unchanged
      expect(updatedState.parameters.exaggeration).toBe(0.5);
      expect(updatedState.parameters.cfg_weight).toBe(0.5);
    });
  });
  
  describe('Engine and Streaming Settings', () => {
    it('should update TTS engine', () => {
      const state = useStore.getState();
      
      state.setTTSEngine('vibevoice');
      
      const updatedState = useStore.getState();
      expect(updatedState.ttsEngine).toBe('vibevoice');
    });
    
    it('should update streaming setting', () => {
      const state = useStore.getState();
      
      state.setUseStreaming(true);
      
      const updatedState = useStore.getState();
      expect(updatedState.useStreaming).toBe(true);
    });
  });
  
  describe('System Status Management', () => {
    it('should update system status correctly', () => {
      const state = useStore.getState();
      
      state.updateSystemStatus({
        healthy: true,
        gpuAvailable: true,
      });
      
      const updatedState = useStore.getState();
      expect(updatedState.systemStatus.healthy).toBe(true);
      expect(updatedState.systemStatus.gpuAvailable).toBe(true);
      expect(updatedState.systemStatus.modelLoaded).toBe(false); // Unchanged
    });
  });
  
  describe('Batch Processing', () => {
    it('should manage batch items correctly', () => {
      const state = useStore.getState();
      
      state.addBatchItem('Batch text 1', 'file1.txt');
      state.addBatchItem('Batch text 2', 'file2.txt');
      
      let updatedState = useStore.getState();
      expect(updatedState.batchItems).toHaveLength(2);
      expect(updatedState.batchItems[0].text).toBe('Batch text 1');
      expect(updatedState.batchItems[0].filename).toBe('file1.txt');
      
      const itemId = updatedState.batchItems[0].id;
      state.updateBatchItem(itemId, { text: 'Updated text' });
      
      updatedState = useStore.getState();
      expect(updatedState.batchItems[0].text).toBe('Updated text');
      
      state.removeBatchItem(itemId);
      
      updatedState = useStore.getState();
      expect(updatedState.batchItems).toHaveLength(1);
      expect(updatedState.batchItems[0].text).toBe('Batch text 2');
      
      state.clearBatchItems();
      
      updatedState = useStore.getState();
      expect(updatedState.batchItems).toHaveLength(0);
    });
    
    it('should process batch correctly', () => {
      const state = useStore.getState();
      
      state.addBatchItem('Batch text 1');
      state.addBatchItem('Batch text 2');
      
      state.processBatch();
      
      const updatedState = useStore.getState();
      expect(updatedState.batchItems).toHaveLength(0); // Batch items cleared
      expect(updatedState.chunks).toHaveLength(2); // Added as chunks
      expect(updatedState.chunks[0].text).toBe('Batch text 1');
      expect(updatedState.chunks[1].text).toBe('Batch text 2');
    });
  });
  
  describe('Session Management', () => {
    it('should create new session correctly', () => {
      const state = useStore.getState();
      
      state.addChunk('Session chunk');
      state.updateParameters({ temperature: 0.9 });
      
      state.newSession();
      
      const updatedState = useStore.getState();
      expect(updatedState.chunks).toHaveLength(0);
      expect(updatedState.voiceReference).toBeNull();
      expect(updatedState.currentSessionId).toBeNull();
      // Parameters should be preserved
      expect(updatedState.parameters.temperature).toBe(0.9);
    });
  });
  
  describe('Generation State Management', () => {
    it('should manage generation state correctly', () => {
      const state = useStore.getState();
      
      state.setIsGenerating(true);
      state.setCurrentGeneratingId('chunk-123');
      
      let updatedState = useStore.getState();
      expect(updatedState.isGenerating).toBe(true);
      expect(updatedState.currentGeneratingId).toBe('chunk-123');
      
      state.setIsGenerating(false);
      state.setCurrentGeneratingId(null);
      
      updatedState = useStore.getState();
      expect(updatedState.isGenerating).toBe(false);
      expect(updatedState.currentGeneratingId).toBeNull();
    });
    
    it('should handle generation cancellation correctly', () => {
      const state = useStore.getState();
      
      state.addChunk('Chunk 1');
      state.addChunk('Chunk 2');
      
      // Set one chunk as generating
      const chunk1Id = useStore.getState().chunks[0].id;
      state.updateChunk(chunk1Id, { status: 'generating' });
      state.setIsGenerating(true);
      state.setCurrentGeneratingId(chunk1Id);
      
      // Cancel generation
      state.cancelGeneration();
      
      const updatedState = useStore.getState();
      expect(updatedState.isGenerating).toBe(false);
      expect(updatedState.currentGeneratingId).toBeNull();
      
      // The generating chunk should be marked as error
      const cancelledChunk = updatedState.chunks.find(c => c.id === chunk1Id);
      expect(cancelledChunk?.status).toBe('error');
      expect(cancelledChunk?.error).toBe('Cancelled by user');
      
      // Other chunks should be unchanged
      const otherChunk = updatedState.chunks.find(c => c.id !== chunk1Id);
      expect(otherChunk?.status).toBe('pending');
    });
  });
  
  describe('Recovery Integration', () => {
    it('should have recovery state integrated', () => {
      const state = useStore.getState();
      
      // Recovery state should be available
      expect(state.availableSessions).toBeDefined();
      expect(state.restoreInProgress).toBeDefined();
      expect(state.autoSaveEnabled).toBeDefined();
      expect(state.autoSaveInterval).toBeDefined();
      
      // Recovery actions should be available
      expect(typeof state.discoverRecoverySessions).toBe('function');
      expect(typeof state.restoreSession).toBe('function');
      expect(typeof state.dismissRecovery).toBe('function');
      expect(typeof state.setAutoSaveEnabled).toBe('function');
    });
    
    it('should manage auto-save settings', () => {
      const state = useStore.getState();
      
      state.setAutoSaveEnabled(false);
      state.setAutoSaveInterval(5);
      
      const updatedState = useStore.getState();
      expect(updatedState.autoSaveEnabled).toBe(false);
      expect(updatedState.autoSaveInterval).toBe(5);
    });
  });
});