/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { INLINE_SECRET_PATTERNS, ASSIGNMENT_STYLE_SECRET_PATTERNS } from './credentialPatterns';
import type { ProtectedRepoPolicy, SanitizedResult } from './types';

const DEFAULT_HIDDEN_IMPLEMENTATION_KEY = 'conversation.protectedRepo.hiddenImplementation';

const IMPLEMENTATION_PATTERNS = [
  /```[\s\S]*?```/m,
  /(?:^|[\s(])(src|tests|docs|scripts)\/[\w./-]+/m,
  /实现位于/,
  /入口函数/,
  /\b[A-Z][A-Za-z0-9]+(?:Service|Manager|Bridge|Store|Protocol|Modal|Page|Dialog)\b/,
  /\b[a-z][A-Za-z0-9]*\s*\(/,
];

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function redactSecrets(text: string): string {
  let sanitized = text;

  for (const pattern of ASSIGNMENT_STYLE_SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, (_match, keyName: string) => `${keyName}=[REDACTED]`);
  }

  for (const pattern of INLINE_SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  return sanitized;
}

export function runProtectedRepoPostcheck(text: string, policy: ProtectedRepoPolicy): SanitizedResult {
  const hiddenImplementationKey = policy.hiddenImplementationMessageKey || DEFAULT_HIDDEN_IMPLEMENTATION_KEY;

  if (matchesAny(text, IMPLEMENTATION_PATTERNS)) {
    return {
      sanitizedText: hiddenImplementationKey,
      decision: {
        action: 'replace_implementation',
        sanitizedText: hiddenImplementationKey,
        replacementKey: hiddenImplementationKey,
      },
    };
  }

  const redacted = redactSecrets(text);
  if (redacted !== text) {
    return {
      sanitizedText: redacted,
      decision: {
        action: 'redact_credentials',
        sanitizedText: redacted,
      },
    };
  }

  return {
    sanitizedText: text,
    decision: { action: 'allow' },
  };
}
