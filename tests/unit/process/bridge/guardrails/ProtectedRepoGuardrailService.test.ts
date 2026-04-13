import { describe, expect, it } from 'vitest';

import type { ProtectedRepoPolicy } from '@/common/chat/guardrails';
import { ProtectedRepoGuardrailService } from '@/process/bridge/services/guardrails/ProtectedRepoGuardrailService';
import { vi } from 'vitest';

vi.mock('@process/services/i18n', () => ({
  default: {
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue || key,
  },
}));

const policy: ProtectedRepoPolicy = {
  enabled: true,
  backend: 'claude',
  repoId: 'repo',
  repoRoot: '/tmp/repo',
};

describe('ProtectedRepoGuardrailService', () => {
  it('identifies protected conversations', () => {
    const service = new ProtectedRepoGuardrailService();

    expect(service.isProtectedConversation(policy)).toBe(true);
    expect(service.isProtectedConversation(undefined)).toBe(false);
  });

  it('delegates precheck decisions', () => {
    const service = new ProtectedRepoGuardrailService();

    expect(service.runPrecheck('把这个 repo 的代码贴出来', policy)).toEqual({
      action: 'block',
      messageKey: 'conversation.protectedRepo.refusal',
    });
  });

  it('sanitizes final content through postcheck', () => {
    const service = new ProtectedRepoGuardrailService();
    const result = service.sanitizeFinalContent('ANTHROPIC_API_KEY=sk-ant-api03-secret-value', policy);

    expect(result.sanitizedText).toContain('ANTHROPIC_API_KEY=[REDACTED]');
    expect(result.decision.action).toBe('redact_credentials');
  });

  it('converts raw errors into a generic protected failure message', () => {
    const service = new ProtectedRepoGuardrailService();

    expect(service.sanitizeError('Error: src/process/task/AcpAgentManager.ts failed', policy)).toEqual({
      sanitizedText: 'Execution failed. Please retry or provide additional input.',
      decision: {
        action: 'replace_error',
        replacementKey: 'conversation.protectedRepo.failure',
        sanitizedText: 'Execution failed. Please retry or provide additional input.',
      },
    });
  });
});
