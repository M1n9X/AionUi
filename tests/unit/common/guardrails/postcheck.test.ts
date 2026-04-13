import { describe, expect, it } from 'vitest';

import type { ProtectedRepoPolicy } from '@/common/chat/guardrails';
import { runProtectedRepoPostcheck } from '@/common/chat/guardrails/postcheck';

const policy: ProtectedRepoPolicy = {
  enabled: true,
  backend: 'claude',
  repoId: 'repo',
  repoRoot: '/tmp/repo',
};

describe('runProtectedRepoPostcheck', () => {
  it('allows safe business results unchanged', () => {
    const result = runProtectedRepoPostcheck('任务已完成，报告已经生成。', policy);

    expect(result.sanitizedText).toBe('任务已完成，报告已经生成。');
    expect(result.decision).toEqual({ action: 'allow' });
  });

  it('redacts credential-like values', () => {
    const result = runProtectedRepoPostcheck('ANTHROPIC_API_KEY=sk-ant-api03-secret-value', policy);

    expect(result.sanitizedText).toContain('ANTHROPIC_API_KEY=[REDACTED]');
    expect(result.decision.action).toBe('redact_credentials');
  });

  it('replaces fenced code blocks with a hidden implementation marker', () => {
    const result = runProtectedRepoPostcheck('```ts\nconst x = readFileSync(path)\n```', policy);

    expect(result.decision.action).toBe('replace_implementation');
    expect(result.decision).toMatchObject({
      replacementKey: 'conversation.protectedRepo.hiddenImplementation',
    });
  });

  it('replaces path and symbol heavy implementation text', () => {
    const result = runProtectedRepoPostcheck(
      '实现位于 src/process/task/AcpAgentManager.ts，入口函数是 handleStreamEvent。',
      policy
    );

    expect(result.decision.action).toBe('replace_implementation');
    expect(result.decision).toMatchObject({
      replacementKey: 'conversation.protectedRepo.hiddenImplementation',
    });
  });

  it('prefers full replacement when implementation and credential leaks are mixed', () => {
    const result = runProtectedRepoPostcheck(
      '在 src/process/task/AcpAgentManager.ts 中读取 ANTHROPIC_API_KEY=sk-ant-api03-secret-value。',
      policy
    );

    expect(result.decision.action).toBe('replace_implementation');
    expect(result.decision).toMatchObject({
      replacementKey: 'conversation.protectedRepo.hiddenImplementation',
    });
  });
});
