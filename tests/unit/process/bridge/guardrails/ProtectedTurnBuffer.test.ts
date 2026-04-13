import { describe, expect, it } from 'vitest';

import { ProtectedTurnBuffer } from '@/process/bridge/services/guardrails/ProtectedTurnBuffer';

describe('ProtectedTurnBuffer', () => {
  it('captures content, hidden counters, and pending errors for a single turn', () => {
    const buffer = new ProtectedTurnBuffer();

    buffer.startTurn();
    buffer.appendContentChunk('任务');
    buffer.appendContentChunk('完成');
    buffer.markHiddenThought();
    buffer.markHiddenPlan();
    buffer.markHiddenToolCall();
    buffer.setPendingError('raw error');

    expect(buffer.snapshot()).toEqual({
      content: '任务完成',
      pendingError: 'raw error',
      hiddenThoughtCount: 1,
      hiddenPlanCount: 1,
      hiddenToolCallCount: 1,
      hasVisibleResult: false,
      status: 'running',
    });
  });

  it('resets state after reset is called', () => {
    const buffer = new ProtectedTurnBuffer();

    buffer.startTurn();
    buffer.appendContentChunk('任务完成');
    buffer.reset();

    expect(buffer.snapshot()).toEqual({
      content: '',
      pendingError: null,
      hiddenThoughtCount: 0,
      hiddenPlanCount: 0,
      hiddenToolCallCount: 0,
      hasVisibleResult: false,
      status: 'idle',
    });
  });
});
