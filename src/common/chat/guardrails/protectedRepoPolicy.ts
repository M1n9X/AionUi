/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ProtectedRepoPolicy } from './types';

type ProtectedSkillBindings = {
  skillSetId?: string;
  names: string[];
  roots: string[];
};

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export function normalizeProtectedRepoPolicy(policy: ProtectedRepoPolicy | undefined): ProtectedRepoPolicy | undefined {
  if (!policy) {
    return undefined;
  }

  return {
    ...policy,
    protectedSkillNames: normalizeStringArray(policy.protectedSkillNames),
    protectedSkillRoots: normalizeStringArray(policy.protectedSkillRoots),
  };
}

export function isProtectedRepoPolicyEnabled(policy?: ProtectedRepoPolicy): boolean {
  return policy?.enabled === true && policy.backend === 'claude';
}

export function getProtectedSkillBindings(policy?: ProtectedRepoPolicy): ProtectedSkillBindings {
  const normalized = normalizeProtectedRepoPolicy(policy);

  return {
    skillSetId: normalized?.protectedSkillSetId,
    names: normalized?.protectedSkillNames ?? [],
    roots: normalized?.protectedSkillRoots ?? [],
  };
}
