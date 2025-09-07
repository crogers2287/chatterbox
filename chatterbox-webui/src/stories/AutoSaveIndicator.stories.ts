import type { Meta, StoryObj } from '@storybook/react';
import { AutoSaveIndicator } from '@/components/recovery/AutoSaveIndicator';
import { AutoSaveState } from '@/components/recovery/types';

const meta: Meta<typeof AutoSaveIndicator> = {
  title: 'Recovery/AutoSaveIndicator',
  component: AutoSaveIndicator,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    showTooltip: {
      control: 'boolean',
      description: 'Whether to show tooltip on hover',
    },
    position: {
      control: 'select',
      options: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
      description: 'Position of the indicator on screen',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const idleState: AutoSaveState = {
  status: 'idle',
};

const savingState: AutoSaveState = {
  status: 'saving',
};

const savedState: AutoSaveState = {
  status: 'saved',
  lastSaveTime: Date.now() - 30000, // 30 seconds ago
};

const errorState: AutoSaveState = {
  status: 'error',
  error: 'Failed to save session - network error',
};

export const Idle: Story = {
  args: {
    state: idleState,
    showTooltip: true,
    position: 'bottom-right',
  },
};

export const Saving: Story = {
  args: {
    state: savingState,
    showTooltip: true,
    position: 'bottom-right',
  },
};

export const Saved: Story = {
  args: {
    state: savedState,
    showTooltip: true,
    position: 'bottom-right',
  },
};

export const Error: Story = {
  args: {
    state: errorState,
    showTooltip: true,
    position: 'bottom-right',
  },
};

export const TopLeft: Story = {
  args: {
    state: savedState,
    showTooltip: true,
    position: 'top-left',
  },
};

export const TopRight: Story = {
  args: {
    state: savingState,
    showTooltip: true,
    position: 'top-right',
  },
};

export const BottomLeft: Story = {
  args: {
    state: errorState,
    showTooltip: true,
    position: 'bottom-left',
  },
};

export const WithoutTooltip: Story = {
  args: {
    state: savedState,
    showTooltip: false,
    position: 'bottom-right',
  },
  parameters: {
    docs: {
      description: {
        story: 'Indicator without tooltip - useful for minimal UI.',
      },
    },
  },
};

export const AllStatesDemo: Story = {
  render: (args) => (
    <div className="relative w-full h-screen">
      <AutoSaveIndicator
        {...args}
        state={idleState}
        position="top-left"
      />
      <AutoSaveIndicator
        {...args}
        state={savingState}
        position="top-right"
      />
      <AutoSaveIndicator
        {...args}
        state={savedState}
        position="bottom-left"
      />
      <AutoSaveIndicator
        {...args}
        state={errorState}
        position="bottom-right"
      />
      <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
        <p>All indicator states and positions</p>
      </div>
    </div>
  ),
  args: {
    showTooltip: true,
  },
};