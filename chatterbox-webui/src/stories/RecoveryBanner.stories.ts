import type { Meta, StoryObj } from '@storybook/react';
import { RecoveryBanner } from '@/components/recovery/RecoveryBanner';
import { RecoverySession } from '@/components/recovery/types';

const meta: Meta<typeof RecoveryBanner> = {
  title: 'Recovery/RecoveryBanner',
  component: RecoveryBanner,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    onRestore: { action: 'onRestore' },
    onDismiss: { action: 'onDismiss' },
    autoHide: {
      control: 'boolean',
      description: 'Whether the banner should auto-hide after a delay',
    },
    autoHideDelay: {
      control: 'number',
      description: 'Delay in milliseconds before auto-hide (if enabled)',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Mock session data
const mockSession: RecoverySession = {
  id: 'session-1',
  timestamp: Date.now() - 300000, // 5 minutes ago
  text: 'This is a sample text that was being processed when the session was interrupted. It contains multiple sentences to demonstrate how longer text is handled.',
  parameters: {
    voice_id: 'sam-voice',
    text_input: 'This is a sample text that was being processed when the session was interrupted.',
    model_id: 'chatterbox',
  },
  voiceId: 'sam-voice',
  audioChunks: [new Blob(['mock audio data'], { type: 'audio/wav' })],
  clipCount: 3,
  duration: 45,
};

const recentSession: RecoverySession = {
  ...mockSession,
  id: 'recent-session',
  timestamp: Date.now() - 30000, // 30 seconds ago
  text: 'Just now',
  clipCount: 1,
};

const oldSession: RecoverySession = {
  ...mockSession,
  id: 'old-session',
  timestamp: Date.now() - 86400000, // 1 day ago
  text: 'This is an older session from yesterday that was interrupted during processing.',
  clipCount: 7,
  duration: 120,
};

const longTextSession: RecoverySession = {
  ...mockSession,
  id: 'long-text-session',
  text: 'This is a very long text session that demonstrates how the recovery banner handles text truncation. The text continues for a while to show that it gets cut off at the appropriate length with ellipsis to maintain a clean UI appearance without overwhelming the user with too much information in the compact banner format.',
  clipCount: 15,
  duration: 300,
};

export const Default: Story = {
  args: {
    session: mockSession,
    autoHide: false,
    autoHideDelay: 10000,
  },
};

export const RecentSession: Story = {
  args: {
    session: recentSession,
    autoHide: false,
  },
};

export const OldSession: Story = {
  args: {
    session: oldSession,
    autoHide: false,
  },
};

export const LongTextTruncation: Story = {
  args: {
    session: longTextSession,
    autoHide: false,
  },
};

export const WithAutoHide: Story = {
  args: {
    session: mockSession,
    autoHide: true,
    autoHideDelay: 5000,
  },
  parameters: {
    docs: {
      description: {
        story: 'This banner will automatically dismiss after 5 seconds.',
      },
    },
  },
};

export const SingleClip: Story = {
  args: {
    session: {
      ...mockSession,
      clipCount: 1,
      text: 'Short text with only one audio clip.',
    },
    autoHide: false,
  },
};

export const ManyClips: Story = {
  args: {
    session: {
      ...mockSession,
      clipCount: 25,
      text: 'This session has many audio clips from a long text processing.',
    },
    autoHide: false,
  },
};