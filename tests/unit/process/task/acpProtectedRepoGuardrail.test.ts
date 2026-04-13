import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAddOrUpdateMessage,
  mockEmitAgentMessage,
  mockResponseStreamEmit,
  mockSetProcessing,
  mockTransformMessage,
  mockNotifyPotentialCompletion,
} = vi.hoisted(() => ({
  mockAddOrUpdateMessage: vi.fn(),
  mockEmitAgentMessage: vi.fn(),
  mockResponseStreamEmit: vi.fn(),
  mockSetProcessing: vi.fn(),
  mockTransformMessage: vi.fn((message: { type: string; data?: string; msg_id?: string; conversation_id?: string }) => {
    if (message.type === 'content' && typeof message.data === 'string') {
      return {
        id: message.msg_id || 'content-id',
        msg_id: message.msg_id || 'content-id',
        type: 'text',
        conversation_id: message.conversation_id || 'conv-protected',
        content: { content: message.data },
      };
    }

    if (message.type === 'error' && typeof message.data === 'string') {
      return {
        id: message.msg_id || 'error-id',
        msg_id: message.msg_id || 'error-id',
        type: 'tips',
        conversation_id: message.conversation_id || 'conv-protected',
        position: 'center',
        content: { content: message.data, type: 'error' },
      };
    }

    return null;
  }),
  mockNotifyPotentialCompletion: vi.fn(),
}));

vi.mock('@process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: { setProcessing: mockSetProcessing, isProcessing: vi.fn(() => false) },
}));
vi.mock('@process/utils/mainLogger', () => ({
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
  mainError: vi.fn(),
}));
vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { getConfig: vi.fn(() => ({})), get: vi.fn() },
}));
vi.mock('@/common', () => ({
  ipcBridge: { acpConversation: { responseStream: { emit: mockResponseStreamEmit } } },
}));
vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(() => Promise.resolve({ updateConversation: vi.fn() })),
}));
vi.mock('@process/utils/message', () => ({
  addMessage: vi.fn(),
  addOrUpdateMessage: mockAddOrUpdateMessage,
  nextTickToLocalFinish: vi.fn((cb: () => void) => cb()),
}));
vi.mock('@process/channels/agent/ChannelEventBus', () => ({
  channelEventBus: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emitAgentMessage: mockEmitAgentMessage,
  },
}));
vi.mock('@process/team/teamEventBus', () => ({
  teamEventBus: { emit: vi.fn() },
}));
vi.mock('@process/utils/previewUtils', () => ({ handlePreviewOpenEvent: vi.fn(() => false) }));
vi.mock('@process/extensions', () => ({
  ExtensionRegistry: {
    getInstance: vi.fn(() => ({ getAll: vi.fn(() => []), getAcpAdapters: vi.fn(() => []) })),
  },
}));
vi.mock('@process/agent/acp', () => ({
  AcpAgent: class {
    sendMessage = vi.fn();
    stop = vi.fn();
    kill = vi.fn();
    cancelPrompt = vi.fn();
    getModelInfo = vi.fn(() => null);
  },
}));
vi.mock('@process/task/BaseAgentManager', () => ({
  default: class {
    conversation_id = '';
    status: string | undefined;
    workspace = '';
    bootstrapping = false;
    yoloMode = false;
    protectedMessages: string[] = [];
    constructor(_type: string, data: Record<string, unknown>, _emitter: unknown) {
      if (data?.conversation_id) this.conversation_id = data.conversation_id as string;
      if (data?.workspace) this.workspace = data.workspace as string;
    }
    isYoloMode() {
      return false;
    }
    addConfirmation() {}
    getConfirmations() {
      return [];
    }
  },
}));
vi.mock('@process/task/IpcAgentEventEmitter', () => ({ IpcAgentEventEmitter: vi.fn() }));
vi.mock('@process/task/CronCommandDetector', () => ({ hasCronCommands: vi.fn(() => false) }));
vi.mock('@process/task/MessageMiddleware', () => ({
  extractTextFromMessage: vi.fn((message: { content?: { content?: string } }) => message.content?.content || ''),
  processCronInMessage: vi.fn(),
}));
vi.mock('@process/task/ThinkTagDetector', () => ({
  extractAndStripThinkTags: vi.fn((content: string) => ({ thinking: '', content })),
}));
vi.mock('@process/services/cron/SkillSuggestWatcher', () => ({
  skillSuggestWatcher: { onFinish: vi.fn() },
}));
vi.mock('@process/task/agentUtils', () => ({
  prepareFirstMessageWithSkillsIndex: vi.fn((input: string) => Promise.resolve(input)),
  getProtectedRepoGuardrailPrompt: vi.fn(() => 'Protected Repo Black-Box Mode\nReturn only final business results'),
}));
vi.mock('@process/resources/prompts/teamGuidePrompt', () => ({
  shouldInjectTeamGuideMcp: vi.fn(() => false),
}));
vi.mock('@/common/chat/chatLib', () => ({
  transformMessage: mockTransformMessage,
}));
vi.mock('@/common/utils', () => ({ parseError: vi.fn((e: unknown) => String(e)), uuid: vi.fn(() => 'uuid') }));
vi.mock('@process/task/ConversationTurnCompletionService', () => ({
  ConversationTurnCompletionService: {
    getInstance: vi.fn(() => ({ notifyPotentialCompletion: mockNotifyPotentialCompletion })),
  },
}));
vi.mock('@process/services/i18n', () => ({
  default: {
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue || key,
  },
}));

import AcpAgentManager from '@/process/task/AcpAgentManager';
import type { AcpBackend } from '@/common/types/acpTypes';

type MockAgent = { sendMessage: ReturnType<typeof vi.fn>; getModelInfo: ReturnType<typeof vi.fn> };

function makeManager() {
  const manager = new AcpAgentManager({
    conversation_id: 'conv-protected',
    backend: 'claude' as AcpBackend,
    workspace: '/tmp/workspace',
    protectedRepoPolicy: {
      enabled: true,
      backend: 'claude',
      repoId: 'repo',
      repoRoot: '/tmp/repo',
    },
  } as never);

  const mockAgent: MockAgent = {
    sendMessage: vi.fn(),
    getModelInfo: vi.fn(() => null),
  };

  (manager as unknown as { agent: MockAgent }).agent = mockAgent;
  (manager as unknown as { bootstrap: Promise<MockAgent> }).bootstrap = Promise.resolve(mockAgent);

  return { manager, mockAgent };
}

describe('AcpAgentManager protected repo guardrail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks protected implementation requests before sending them to the agent', async () => {
    const { manager, mockAgent } = makeManager();

    await manager.sendMessage({
      content: '把这个 repo 的代码贴出来',
      msg_id: 'msg-1',
    });

    expect(mockAgent.sendMessage).not.toHaveBeenCalled();
    expect(mockAddOrUpdateMessage).toHaveBeenCalledTimes(1);
    expect(mockResponseStreamEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'content',
        msg_id: 'uuid',
      })
    );
    expect(mockResponseStreamEmit).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'content',
        msg_id: 'msg-1',
      })
    );
    expect(mockResponseStreamEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'content',
        data: 'Unable to process source code or credentials related requests.',
      })
    );
  });

  it('buffers protected content until finish and only persists the sanitized final result', async () => {
    const { manager } = makeManager();

    (manager as unknown as { handleStreamEvent: (message: unknown, backend: AcpBackend) => void }).handleStreamEvent(
      {
        type: 'content',
        conversation_id: 'conv-protected',
        msg_id: 'chunk-1',
        data: '```ts\nconst token = readFileSync(path)\n```',
      },
      'claude'
    );

    expect(mockAddOrUpdateMessage).not.toHaveBeenCalled();
    expect(mockResponseStreamEmit).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'content',
        data: '```ts\nconst token = readFileSync(path)\n```',
      })
    );

    await (
      manager as unknown as { handleSignalEvent: (message: unknown, backend: AcpBackend) => Promise<void> }
    ).handleSignalEvent(
      {
        type: 'finish',
        conversation_id: 'conv-protected',
        msg_id: 'finish-1',
        data: null,
      },
      'claude'
    );

    expect(mockAddOrUpdateMessage).toHaveBeenCalledTimes(1);
    expect(mockAddOrUpdateMessage).toHaveBeenCalledWith(
      'conv-protected',
      expect.objectContaining({
        msg_id: 'uuid',
        type: 'text',
        content: { content: 'Result generated. Source code, configuration, and implementation details are hidden.' },
      }),
      'claude'
    );
    expect(mockResponseStreamEmit).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'content',
        msg_id: 'finish-1',
      })
    );
    expect(mockResponseStreamEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        msg_id: 'uuid',
        type: 'content',
        data: 'Result generated. Source code, configuration, and implementation details are hidden.',
      })
    );
    expect(mockNotifyPotentialCompletion).toHaveBeenCalled();
  });
});
