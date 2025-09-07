import { vi } from 'vitest';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
vi.stubGlobal('localStorage', localStorageMock);

// Mock BroadcastChannel
class MockBroadcastChannel {
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  
  constructor(name: string) {
    this.name = name;
  }
  
  postMessage(data: any) {
    // Mock implementation
  }
  
  close() {
    // Mock implementation
  }
}
vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);

// Mock FileReader
class MockFileReader {
  result: string | ArrayBuffer | null = null;
  onloadend: ((event: ProgressEvent<FileReader>) => void) | null = null;
  
  readAsDataURL(blob: Blob) {
    // Mock implementation
    setTimeout(() => {
      this.result = 'data:audio/wav;base64,UklGRiQAAABXQVZF...';
      if (this.onloadend) {
        this.onloadend({} as ProgressEvent<FileReader>);
      }
    }, 10);
  }
  
  readAsArrayBuffer(blob: Blob) {
    // Mock implementation
    setTimeout(() => {
      this.result = new ArrayBuffer(8);
      if (this.onloadend) {
        this.onloadend({} as ProgressEvent<FileReader>);
      }
    }, 10);
  }
}
vi.stubGlobal('FileReader', MockFileReader);

// Mock fetch
vi.stubGlobal('fetch', vi.fn());

// Mock URL.createObjectURL
vi.stubGlobal('URL', {
  createObjectURL: vi.fn().mockReturnValue('blob:http://localhost/mock-blob'),
  revokeObjectURL: vi.fn(),
});

// Mock performance API
vi.stubGlobal('performance', {
  mark: vi.fn(),
  measure: vi.fn(),
  now: vi.fn().mockReturnValue(1000),
  getEntriesByType: vi.fn().mockReturnValue([]),
  getEntriesByName: vi.fn().mockReturnValue([]),
  clearMarks: vi.fn(),
  clearMeasures: vi.fn(),
});

// Clear all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});