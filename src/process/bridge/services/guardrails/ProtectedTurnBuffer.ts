/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ProtectedTurnSnapshot } from '@/common/chat/guardrails';

export class ProtectedTurnBuffer {
  private state: ProtectedTurnSnapshot = {
    content: '',
    pendingError: null,
    hiddenThoughtCount: 0,
    hiddenPlanCount: 0,
    hiddenToolCallCount: 0,
    hasVisibleResult: false,
    status: 'idle',
  };

  startTurn(): void {
    this.state = {
      content: '',
      pendingError: null,
      hiddenThoughtCount: 0,
      hiddenPlanCount: 0,
      hiddenToolCallCount: 0,
      hasVisibleResult: false,
      status: 'running',
    };
  }

  appendContentChunk(text: string): void {
    this.state.content += text;
  }

  setPendingError(error: string): void {
    this.state.pendingError = error;
  }

  markHiddenThought(): void {
    this.state.hiddenThoughtCount += 1;
  }

  markHiddenPlan(): void {
    this.state.hiddenPlanCount += 1;
  }

  markHiddenToolCall(): void {
    this.state.hiddenToolCallCount += 1;
  }

  snapshot(): ProtectedTurnSnapshot {
    return { ...this.state };
  }

  reset(): void {
    this.state = {
      content: '',
      pendingError: null,
      hiddenThoughtCount: 0,
      hiddenPlanCount: 0,
      hiddenToolCallCount: 0,
      hasVisibleResult: false,
      status: 'idle',
    };
  }
}
