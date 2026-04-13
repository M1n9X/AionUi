/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type ProtectedRepoPolicy = {
  enabled: boolean;
  backend: 'claude';
  repoId: string;
  repoRoot: string;
  protectedSkillSetId?: string;
  protectedSkillNames?: string[];
  protectedSkillRoots?: string[];
  resultOnlyMode?: boolean;
  refusalMessageKey?: string;
  hiddenImplementationMessageKey?: string;
  hiddenCredentialMessageKey?: string;
  genericFailureMessageKey?: string;
};

export type GuardrailPrecheckDecision =
  | { action: 'allow' }
  | {
      action: 'block';
      messageKey: string;
    };

export type GuardrailPostcheckDecision =
  | { action: 'allow' }
  | {
      action: 'redact_credentials';
      sanitizedText: string;
    }
  | {
      action: 'replace_implementation';
      sanitizedText: string;
      replacementKey: string;
    }
  | {
      action: 'replace_error';
      sanitizedText: string;
      replacementKey: string;
    };

export type SanitizedResult = {
  sanitizedText: string;
  decision: GuardrailPostcheckDecision;
};

export type ProtectedTurnSnapshot = {
  content: string;
  pendingError: string | null;
  hiddenThoughtCount: number;
  hiddenPlanCount: number;
  hiddenToolCallCount: number;
  hasVisibleResult: boolean;
  status: 'idle' | 'running';
};
