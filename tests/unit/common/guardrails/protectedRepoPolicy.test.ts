import { describe, expect, it } from 'vitest';

import {
  getProtectedSkillBindings,
  isProtectedRepoPolicyEnabled,
  normalizeProtectedRepoPolicy,
} from '@/common/chat/guardrails';

describe('protectedRepoPolicy', () => {
  it('returns false when policy is missing or disabled', () => {
    expect(isProtectedRepoPolicyEnabled()).toBe(false);
    expect(
      isProtectedRepoPolicyEnabled({
        enabled: false,
        backend: 'claude',
        repoId: 'repo',
        repoRoot: '/tmp/repo',
      })
    ).toBe(false);
  });

  it('returns true only for enabled claude policies', () => {
    expect(
      isProtectedRepoPolicyEnabled({
        enabled: true,
        backend: 'claude',
        repoId: 'repo',
        repoRoot: '/tmp/repo',
      })
    ).toBe(true);
  });

  it('normalizes optional skill bindings into arrays', () => {
    expect(
      normalizeProtectedRepoPolicy({
        enabled: true,
        backend: 'claude',
        repoId: 'repo',
        repoRoot: '/tmp/repo',
      })
    ).toEqual({
      enabled: true,
      backend: 'claude',
      repoId: 'repo',
      repoRoot: '/tmp/repo',
      protectedSkillNames: [],
      protectedSkillRoots: [],
    });
  });

  it('filters malformed optional skill bindings', () => {
    expect(
      normalizeProtectedRepoPolicy({
        enabled: true,
        backend: 'claude',
        repoId: 'repo',
        repoRoot: '/tmp/repo',
        protectedSkillSetId: 'skill-set',
        protectedSkillNames: ['skill-a', '', 'skill-b', 1 as never],
        protectedSkillRoots: ['/tmp/repo/skills', '', null as never],
      })
    ).toEqual({
      enabled: true,
      backend: 'claude',
      repoId: 'repo',
      repoRoot: '/tmp/repo',
      protectedSkillSetId: 'skill-set',
      protectedSkillNames: ['skill-a', 'skill-b'],
      protectedSkillRoots: ['/tmp/repo/skills'],
    });
  });

  it('returns normalized protected skill bindings', () => {
    expect(
      getProtectedSkillBindings({
        enabled: true,
        backend: 'claude',
        repoId: 'repo',
        repoRoot: '/tmp/repo',
        protectedSkillSetId: 'skill-set',
        protectedSkillNames: ['skill-a'],
        protectedSkillRoots: ['/tmp/repo/skills'],
      })
    ).toEqual({
      skillSetId: 'skill-set',
      names: ['skill-a'],
      roots: ['/tmp/repo/skills'],
    });
  });
});
