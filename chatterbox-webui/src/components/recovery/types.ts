// Recovery system types for UI components

export interface RecoverySession {
  id: string;
  timestamp: number;
  text: string;
  parameters: TTSParams;
  voiceId: string;
  audioChunks: Blob[];
  duration?: number;
  clipCount: number;
}

export interface TTSParams {
  voice_id: string;
  text_input: string;
  voice_settings?: {
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
  };
  model_id: string;
}

export interface AutoSaveState {
  status: 'saving' | 'saved' | 'error' | 'idle';
  lastSaveTime?: number;
  error?: string;
}

export interface RecoveryBannerProps {
  session: RecoverySession;
  onRestore: (sessionId: string) => void;
  onDismiss: (sessionId: string) => void;
  autoHide?: boolean;
  autoHideDelay?: number;
}

export interface RecoveryModalProps {
  sessions: RecoverySession[];
  isOpen: boolean;
  onClose: () => void;
  onRestoreSession: (sessionId: string) => void;
  onRestoreSelected: (sessionIds: string[]) => void;
  onRestoreAll: () => void;
  onDeleteSession?: (sessionId: string) => void;
}

export interface AutoSaveIndicatorProps {
  state: AutoSaveState;
  showTooltip?: boolean;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export interface SessionCardProps {
  session: RecoverySession;
  isSelected: boolean;
  onSelect: (sessionId: string) => void;
  onRestore: (sessionId: string) => void;
  onDelete?: (sessionId: string) => void;
  showPreview?: boolean;
}