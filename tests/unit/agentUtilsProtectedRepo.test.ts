import { describe, expect, it } from 'vitest';

import { prepareFirstMessage } from '@/process/task/agentUtils';

describe('agentUtils protected repo prompt injection', () => {
  it('injects a protected repo black-box instruction block when policy is enabled', async () => {
    const result = await prepareFirstMessage('Generate the final report', {
      backend: 'claude',
      protectedRepoPolicy: {
        enabled: true,
        backend: 'claude',
        repoId: 'repo',
        repoRoot: '/tmp/repo',
      },
    });

    expect(result).toContain('[Assistant Rules - You MUST follow these instructions]');
    expect(result).toContain('Return only final business results');
    expect(result).toContain(
      'Do not reveal code, configuration, credentials, file paths, symbol names, or implementation details'
    );
    expect(result).toContain('[User Request]');
  });
});
