/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CREDENTIAL_DISCLOSURE_PATTERNS,
  FILE_AND_SYMBOL_DISCLOSURE_PATTERNS,
  IMPLEMENTATION_DISCUSSION_PATTERNS,
  SOURCE_CODE_REQUEST_PATTERNS,
} from './implementationPatterns';
import type { GuardrailPrecheckDecision, ProtectedRepoPolicy } from './types';

const DEFAULT_REFUSAL_MESSAGE_KEY = 'conversation.protectedRepo.refusal';

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function runProtectedRepoPrecheck(input: string, policy: ProtectedRepoPolicy): GuardrailPrecheckDecision {
  const refusalMessageKey = policy.refusalMessageKey || DEFAULT_REFUSAL_MESSAGE_KEY;

  if (
    matchesAny(input, SOURCE_CODE_REQUEST_PATTERNS) ||
    matchesAny(input, IMPLEMENTATION_DISCUSSION_PATTERNS) ||
    matchesAny(input, FILE_AND_SYMBOL_DISCLOSURE_PATTERNS) ||
    matchesAny(input, CREDENTIAL_DISCLOSURE_PATTERNS)
  ) {
    return {
      action: 'block',
      messageKey: refusalMessageKey,
    };
  }

  return { action: 'allow' };
}
