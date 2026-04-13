/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  isProtectedRepoPolicyEnabled,
  runProtectedRepoPostcheck,
  runProtectedRepoPrecheck,
  type GuardrailPrecheckDecision,
  type ProtectedRepoPolicy,
  type SanitizedResult,
} from '@/common/chat/guardrails';
import i18n from '@process/services/i18n';

const DEFAULT_FAILURE_KEY = 'conversation.protectedRepo.failure';
const DEFAULT_PROCESSING_KEY = 'conversation.protectedRepo.processing';
const DEFAULT_REFUSAL_KEY = 'conversation.protectedRepo.refusal';
const DEFAULT_HIDDEN_IMPLEMENTATION_KEY = 'conversation.protectedRepo.hiddenImplementation';
const DEFAULT_HIDDEN_CREDENTIAL_KEY = 'conversation.protectedRepo.hiddenCredential';

function translateMessage(key: string, defaultValue: string): string {
  return i18n.t(key, { defaultValue });
}

export class ProtectedRepoGuardrailService {
  isProtectedConversation(policy?: ProtectedRepoPolicy): boolean {
    return isProtectedRepoPolicyEnabled(policy);
  }

  runPrecheck(input: string, policy: ProtectedRepoPolicy): GuardrailPrecheckDecision {
    return runProtectedRepoPrecheck(input, policy);
  }

  sanitizeFinalContent(content: string, policy: ProtectedRepoPolicy): SanitizedResult {
    const result = runProtectedRepoPostcheck(content, policy);

    if (result.decision.action === 'replace_implementation') {
      const replacementKey =
        result.decision.replacementKey || policy.hiddenImplementationMessageKey || DEFAULT_HIDDEN_IMPLEMENTATION_KEY;
      const sanitizedText = translateMessage(
        replacementKey,
        'Result generated. Source code, configuration, and implementation details are hidden.'
      );
      return {
        sanitizedText,
        decision: {
          ...result.decision,
          sanitizedText,
          replacementKey,
        },
      };
    }

    if (result.decision.action === 'redact_credentials') {
      return result.sanitizedText === content
        ? {
            sanitizedText: translateMessage(
              policy.hiddenCredentialMessageKey || DEFAULT_HIDDEN_CREDENTIAL_KEY,
              'Sensitive credentials were removed from the result.'
            ),
            decision: {
              action: 'replace_implementation',
              replacementKey: policy.hiddenCredentialMessageKey || DEFAULT_HIDDEN_CREDENTIAL_KEY,
              sanitizedText: translateMessage(
                policy.hiddenCredentialMessageKey || DEFAULT_HIDDEN_CREDENTIAL_KEY,
                'Sensitive credentials were removed from the result.'
              ),
            },
          }
        : result;
    }

    return result;
  }

  sanitizeError(_error: string, policy: ProtectedRepoPolicy): SanitizedResult {
    const replacementKey = policy.genericFailureMessageKey || DEFAULT_FAILURE_KEY;
    const sanitizedText = translateMessage(
      replacementKey,
      'Execution failed. Please retry or provide additional input.'
    );

    return {
      sanitizedText,
      decision: {
        action: 'replace_error',
        replacementKey,
        sanitizedText,
      },
    };
  }

  buildProcessingStatus(policy: ProtectedRepoPolicy): string {
    return translateMessage(
      policy.hiddenImplementationMessageKey || DEFAULT_PROCESSING_KEY,
      'Processing protected task...'
    );
  }

  buildRefusalMessage(policy: ProtectedRepoPolicy): string {
    return translateMessage(
      policy.refusalMessageKey || DEFAULT_REFUSAL_KEY,
      'Unable to process source code or credentials related requests.'
    );
  }
}
