import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('swr', () => ({
  default: () => ({ data: null, isLoading: false }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      getAssociateConversation: { invoke: vi.fn(async () => []) },
      createWithConversation: { invoke: vi.fn(async () => undefined) },
    },
  },
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({ info: null, isLoading: false }),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ openPreview: vi.fn() }),
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobManager: () => <div data-testid='cron-job-manager' />,
}));

vi.mock('@/renderer/components/agent/AcpModelSelector', () => ({
  __esModule: true,
  default: () => <div data-testid='acp-model-selector' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/GeminiModelSelector', () => ({
  __esModule: true,
  default: () => <div data-testid='gemini-model-selector' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/useGeminiModelSelection', () => ({
  useGeminiModelSelection: () => ({}),
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection', () => ({
  useAionrsModelSelection: () => ({}),
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsModelSelector', () => ({
  __esModule: true,
  default: () => <div data-testid='aionrs-model-selector' />,
}));

vi.mock('@/renderer/pages/conversation/components/ChatSider', () => ({
  __esModule: true,
  default: () => <div data-testid='chat-sider' />,
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout', () => ({
  __esModule: true,
  default: ({
    headerExtra,
    children,
  }: {
    headerExtra?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <div>
      <div data-testid='chat-layout-header-extra'>{headerExtra}</div>
      <div data-testid='chat-layout-children'>{children}</div>
    </div>
  ),
}));

vi.mock('@/renderer/pages/conversation/platforms/acp/AcpChat', () => ({
  __esModule: true,
  default: () => <div data-testid='acp-chat' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/nanobot/NanobotChat', () => ({
  __esModule: true,
  default: () => <div data-testid='nanobot-chat' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/openclaw/OpenClawChat', () => ({
  __esModule: true,
  default: () => <div data-testid='openclaw-chat' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/remote/RemoteChat', () => ({
  __esModule: true,
  default: () => <div data-testid='remote-chat' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/GeminiChat', () => ({
  __esModule: true,
  default: () => <div data-testid='gemini-chat' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsChat', () => ({
  __esModule: true,
  default: () => <div data-testid='aionrs-chat' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/openclaw/StarOfficeMonitorCard.tsx', () => ({
  __esModule: true,
  default: () => <div data-testid='star-office-monitor-card' />,
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children }: { children?: React.ReactNode }) => <button>{children}</button>,
  Dropdown: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Menu: Object.assign(
    ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    { Item: ({ children }: { children?: React.ReactNode }) => <div>{children}</div> }
  ),
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Typography: {
    Ellipsis: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  },
  Tag: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@icon-park/react', () => ({
  History: () => <span>history</span>,
}));

import ChatConversation from '@/renderer/pages/conversation/components/ChatConversation';
import type { TChatConversation } from '@/common/config/storage';

describe('ChatConversation protected repo indicator', () => {
  it('shows a protected repo badge for ACP conversations with guardrail enabled', () => {
    const conversation = {
      id: 'conv-protected',
      name: 'Protected conversation',
      type: 'acp',
      createTime: Date.now(),
      modifyTime: Date.now(),
      extra: {
        backend: 'claude',
        workspace: '/tmp/repo',
        protectedRepoPolicy: {
          enabled: true,
          backend: 'claude',
          repoId: 'repo',
          repoRoot: '/tmp/repo',
        },
      },
    } as TChatConversation;

    render(<ChatConversation conversation={conversation} />);

    expect(screen.getByText('Protected Repo')).toBeInTheDocument();
  });

  it('does not show a protected repo badge for normal ACP conversations', () => {
    const conversation = {
      id: 'conv-normal',
      name: 'Normal conversation',
      type: 'acp',
      createTime: Date.now(),
      modifyTime: Date.now(),
      extra: {
        backend: 'claude',
        workspace: '/tmp/repo',
      },
    } as TChatConversation;

    render(<ChatConversation conversation={conversation} />);

    expect(screen.queryByText('Protected Repo')).toBeNull();
  });
});
