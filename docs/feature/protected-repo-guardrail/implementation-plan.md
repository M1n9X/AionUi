# Protected Repo Black-Box Guardrail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Claude-only protected-repo guardrail that allows protected skills to run while preventing any protected source code, configuration, credentials, or implementation knowledge from reaching the user.

**Architecture:** The implementation is a session-level AionUi guardrail pipeline. Pure rule logic lives under `src/common/chat/guardrails/`; runtime buffering and orchestration live under `src/process/bridge/services/guardrails/`; Claude ACP integration is enforced in `AcpAgentManager` by running precheck before `agent.sendMessage()`, suppressing intermediate events, buffering raw content until `finish`, sanitizing once, then only persisting and broadcasting the sanitized final result.

**Tech Stack:** TypeScript, Electron main-process task pipeline, Claude ACP integration, Vitest 4, i18n locale JSON, oxlint, oxfmt

**Tuning Guide:** See [`tuning-guide.md`](./tuning-guide.md) for how to adjust precheck, postcheck, prompt, UI indicator, and local protected-repo test mode after implementation.

---

## Planned File Map

### Create

- `src/common/chat/guardrails/types.ts`
- `src/common/chat/guardrails/protectedRepoPolicy.ts`
- `src/common/chat/guardrails/implementationPatterns.ts`
- `src/common/chat/guardrails/credentialPatterns.ts`
- `src/common/chat/guardrails/precheck.ts`
- `src/common/chat/guardrails/postcheck.ts`
- `src/common/chat/guardrails/index.ts`
- `src/process/bridge/services/guardrails/ProtectedTurnBuffer.ts`
- `src/process/bridge/services/guardrails/ProtectedRepoGuardrailService.ts`
- `tests/unit/common/guardrails/protectedRepoPolicy.test.ts`
- `tests/unit/common/guardrails/precheck.test.ts`
- `tests/unit/common/guardrails/postcheck.test.ts`
- `tests/unit/process/bridge/guardrails/ProtectedTurnBuffer.test.ts`
- `tests/unit/process/bridge/guardrails/ProtectedRepoGuardrailService.test.ts`
- `tests/unit/process/task/acpProtectedRepoGuardrail.test.ts`

### Modify

- `src/common/config/storage.ts`
- `src/common/adapter/ipcBridge.ts`
- `src/process/services/IConversationService.ts`
- `src/process/task/AcpAgentManager.ts`
- `src/process/task/agentUtils.ts`
- `src/process/task/MessageMiddleware.ts`
- `src/renderer/services/i18n/locales/en-US/conversation.json`
- `src/renderer/services/i18n/locales/zh-CN/conversation.json`
- `src/renderer/services/i18n/locales/ja-JP/conversation.json`
- `src/renderer/services/i18n/locales/ko-KR/conversation.json`
- `src/renderer/services/i18n/locales/ru-RU/conversation.json`
- `src/renderer/services/i18n/locales/tr-TR/conversation.json`
- `src/renderer/services/i18n/locales/zh-TW/conversation.json`

### Reuse / Verify

- `src/process/services/ConversationServiceImpl.ts`
- `src/process/task/ConversationTurnCompletionService.ts`
- `tests/unit/AcpAgentManagerSkillInjection.test.ts`

---

## Task 1: Add Shared Guardrail Types And Conversation Plumbing

**Files:**

- Create: `src/common/chat/guardrails/types.ts`
- Create: `src/common/chat/guardrails/protectedRepoPolicy.ts`
- Create: `src/common/chat/guardrails/index.ts`
- Modify: `src/common/config/storage.ts`
- Modify: `src/common/adapter/ipcBridge.ts`
- Modify: `src/process/services/IConversationService.ts`
- Test: `tests/unit/common/guardrails/protectedRepoPolicy.test.ts`

- [ ] Define the shared runtime types in `src/common/chat/guardrails/types.ts`.
      Include at least:
  - `ProtectedRepoPolicy`
  - `GuardrailPrecheckDecision`
  - `GuardrailPostcheckDecision`
  - `SanitizedResult`
  - `ProtectedTurnSnapshot`

- [ ] Implement policy helpers in `src/common/chat/guardrails/protectedRepoPolicy.ts`.
      Required helpers:
  - `isProtectedRepoPolicyEnabled(policy): boolean`
  - `getProtectedSkillBindings(policy): { skillSetId?: string; names: string[]; roots: string[] }`
  - `normalizeProtectedRepoPolicy(policy): ProtectedRepoPolicy | undefined`

- [ ] Re-export the public API from `src/common/chat/guardrails/index.ts`.

- [ ] Extend the ACP conversation extra type in `src/common/config/storage.ts`.
      Add:

  ```ts
  protectedRepoPolicy?: import('@/common/chat/guardrails').ProtectedRepoPolicy;
  ```

- [ ] Extend the create-conversation transport types so upstream callers can pass the policy through.
      Update:
  - `src/common/adapter/ipcBridge.ts`
  - `src/process/services/IConversationService.ts`

- [ ] Verify that `ConversationServiceImpl` does not need custom merge logic beyond the existing "copy unknown extra fields" behavior.
      Expected outcome:
  - `protectedRepoPolicy` survives conversation creation without further code changes

- [ ] Write and run the policy helper tests.
      Suggested coverage:
  - disabled policy returns false
  - enabled Claude policy returns true
  - protected skill bindings normalize empty arrays
  - malformed optional arrays are sanitized to empty arrays

- [ ] Run:

  ```bash
  bun run test tests/unit/common/guardrails/protectedRepoPolicy.test.ts
  bunx tsc --noEmit
  ```

- [ ] Checkpoint commit:
  ```bash
  git add src/common/chat/guardrails src/common/config/storage.ts src/common/adapter/ipcBridge.ts src/process/services/IConversationService.ts tests/unit/common/guardrails/protectedRepoPolicy.test.ts
  git commit -m "feat(guardrails): add protected repo policy types"
  ```

---

## Task 2: Implement Pure Precheck Rules

**Files:**

- Create: `src/common/chat/guardrails/implementationPatterns.ts`
- Create: `src/common/chat/guardrails/precheck.ts`
- Test: `tests/unit/common/guardrails/precheck.test.ts`

- [ ] Write the failing precheck tests first.
      Cover at least:
  - direct source code requests
  - implementation discussion requests
  - file/path/module/function disclosure requests
  - credential/env/token requests
  - allowed business-result requests

- [ ] Add `implementationPatterns.ts` with deterministic request-intent patterns.
      Pattern groups should include:
  - source code retrieval
  - config/prompt/skill content retrieval
  - implementation discussion
  - file-path and symbol disclosure

- [ ] Implement `runProtectedRepoPrecheck()` in `precheck.ts`.
      Expected signature:

  ```ts
  export function runProtectedRepoPrecheck(input: string, policy: ProtectedRepoPolicy): GuardrailPrecheckDecision;
  ```

- [ ] Ensure the precheck result is intentionally minimal:
  - `allow`
  - `block` with `messageKey`
  - no model calls
  - no repo-path leakage in the decision payload

- [ ] Run:

  ```bash
  bun run test tests/unit/common/guardrails/precheck.test.ts
  bunx tsc --noEmit
  ```

- [ ] Checkpoint commit:
  ```bash
  git add src/common/chat/guardrails/implementationPatterns.ts src/common/chat/guardrails/precheck.ts tests/unit/common/guardrails/precheck.test.ts
  git commit -m "feat(guardrails): add protected repo precheck rules"
  ```

---

## Task 3: Implement Pure Postcheck And Sanitization Rules

**Files:**

- Create: `src/common/chat/guardrails/credentialPatterns.ts`
- Create: `src/common/chat/guardrails/postcheck.ts`
- Test: `tests/unit/common/guardrails/postcheck.test.ts`

- [ ] Write the failing postcheck tests first.
      Cover at least:
  - fenced code blocks
  - file paths and symbol names
  - implementation explanation paragraphs
  - credential redaction
  - full replacement on unsafe implementation-heavy output
  - safe output pass-through

- [ ] Add `credentialPatterns.ts` with deterministic secret matchers.
      Include at least:
  - API key / token style patterns
  - private key block detection
  - `KEY=VALUE` / `TOKEN=VALUE`
  - URL embedded credentials

- [ ] Implement `runProtectedRepoPostcheck()` in `postcheck.ts`.
      Expected responsibilities:
  - classify `allow` / `redact_credentials` / `replace_implementation` / `replace_error`
  - return sanitized text
  - never return the original unsafe text when a replacement path is chosen

- [ ] Keep replacement behavior intentionally conservative.
      Rules:
  - credential-only leak: redact value if context remains safe
  - implementation leak: replace whole segment or whole message
  - mixed implementation + credential leak: prefer whole-message replacement

- [ ] Run:

  ```bash
  bun run test tests/unit/common/guardrails/postcheck.test.ts
  bunx tsc --noEmit
  ```

- [ ] Checkpoint commit:
  ```bash
  git add src/common/chat/guardrails/credentialPatterns.ts src/common/chat/guardrails/postcheck.ts tests/unit/common/guardrails/postcheck.test.ts
  git commit -m "feat(guardrails): add protected repo postcheck rules"
  ```

---

## Task 4: Add Runtime Buffer And Guardrail Service

**Files:**

- Create: `src/process/bridge/services/guardrails/ProtectedTurnBuffer.ts`
- Create: `src/process/bridge/services/guardrails/ProtectedRepoGuardrailService.ts`
- Test: `tests/unit/process/bridge/guardrails/ProtectedTurnBuffer.test.ts`
- Test: `tests/unit/process/bridge/guardrails/ProtectedRepoGuardrailService.test.ts`

- [ ] Write the failing buffer/service tests first.
      Cover at least:
  - append content chunks
  - stash raw error
  - reset buffer on finish
  - suppress intermediate event classification
  - sanitize final aggregated result
  - guardrail fallback on service error

- [ ] Implement `ProtectedTurnBuffer`.
      Minimum API:
  - `startTurn()`
  - `appendContentChunk(text: string)`
  - `setPendingError(error: string)`
  - `markHiddenThought()`
  - `markHiddenPlan()`
  - `markHiddenToolCall()`
  - `snapshot()`
  - `reset()`

- [ ] Implement `ProtectedRepoGuardrailService`.
      Minimum responsibilities:
  - `isProtectedConversation(policy)`
  - `runPrecheck(input, policy)`
  - `sanitizeFinalContent(content, policy)`
  - `sanitizeError(error, policy)`
  - `buildProcessingStatus(policy)`
  - `buildRefusalMessage(policy)`

- [ ] Keep the service free of UI or DB dependencies.
      It should return decisions and sanitized strings, not emit events directly.

- [ ] Run:

  ```bash
  bun run test tests/unit/process/bridge/guardrails/ProtectedTurnBuffer.test.ts tests/unit/process/bridge/guardrails/ProtectedRepoGuardrailService.test.ts
  bunx tsc --noEmit
  ```

- [ ] Checkpoint commit:
  ```bash
  git add src/process/bridge/services/guardrails tests/unit/process/bridge/guardrails
  git commit -m "feat(guardrails): add protected repo runtime service"
  ```

---

## Task 5: Wire Precheck And Result-Only Mode Into `AcpAgentManager`

**Files:**

- Modify: `src/process/task/AcpAgentManager.ts`
- Modify: `src/process/task/MessageMiddleware.ts`
- Test: `tests/unit/process/task/acpProtectedRepoGuardrail.test.ts`
- Reuse: `tests/unit/AcpAgentManagerSkillInjection.test.ts`

- [ ] Write the failing manager integration tests first.
      Cover at least:
  - protected precheck block prevents `agent.sendMessage`
  - blocked request produces refusal output without backend call
  - protected `content` chunk is buffered, not streamed
  - protected `thought`, `plan`, `acp_tool_call`, and raw `error` never reach DB/UI/channel
  - final sanitized result is the only persisted assistant message
  - fallback failure message is used when postcheck throws

- [ ] Add per-conversation protected-mode helpers inside `AcpAgentManager`.
      Helpers should answer:
  - is current conversation protected?
  - what policy applies?
  - what buffer belongs to the active turn?

- [ ] Run precheck immediately before `this.sendAgentMessageWithFinishFallback(...)`.
      Required behavior:
  - use original user input before rule injection
  - if blocked, emit refusal message and synthesize a safe finish path

- [ ] Short-circuit protected intermediate events in `handleStreamEvent()`.
      This must happen before:
  - `transformMessage()`
  - `addOrUpdateMessage()`
  - `ipcBridge.acpConversation.responseStream.emit(...)`
  - `channelEventBus.emitAgentMessage(...)`

- [ ] Replace protected raw streaming with buffered completion output.
      Required behavior:
  - `content` chunks append into `ProtectedTurnBuffer`
  - `finish` triggers postcheck on aggregated text
  - only the sanitized final text is emitted and stored

- [ ] Route protected raw errors through the same safe completion path.
      Required behavior:
  - no raw error text reaches user-visible transports
  - use a generic failure message when no safe sanitized content exists

- [ ] Delay `ConversationTurnCompletionService` notification until after the sanitized final message is emitted.

- [ ] Disable raw-text-driven cron side effects for protected conversations in `MessageMiddleware.ts`.
      Preferred behavior:
  - skip cron detection entirely for protected conversations
  - do not parse or act on un-sanitized assistant text

- [ ] Run:

  ```bash
  bun run test tests/unit/process/task/acpProtectedRepoGuardrail.test.ts tests/unit/AcpAgentManagerSkillInjection.test.ts
  bunx tsc --noEmit
  ```

- [ ] Checkpoint commit:
  ```bash
  git add src/process/task/AcpAgentManager.ts src/process/task/MessageMiddleware.ts tests/unit/process/task/acpProtectedRepoGuardrail.test.ts tests/unit/AcpAgentManagerSkillInjection.test.ts
  git commit -m "feat(guardrails): enforce protected repo result-only mode"
  ```

---

## Task 6: Add Soft Prompt Constraints And Locale Messages

**Files:**

- Modify: `src/process/task/agentUtils.ts`
- Modify: `src/renderer/services/i18n/locales/en-US/conversation.json`
- Modify: `src/renderer/services/i18n/locales/zh-CN/conversation.json`
- Modify: `src/renderer/services/i18n/locales/ja-JP/conversation.json`
- Modify: `src/renderer/services/i18n/locales/ko-KR/conversation.json`
- Modify: `src/renderer/services/i18n/locales/ru-RU/conversation.json`
- Modify: `src/renderer/services/i18n/locales/tr-TR/conversation.json`
- Modify: `src/renderer/services/i18n/locales/zh-TW/conversation.json`

- [ ] Add a protected-session soft prompt helper in `agentUtils.ts`.
      The helper should inject a short guardrail rule block only when:
  - backend is Claude
  - `protectedRepoPolicy.enabled === true`

- [ ] Keep the soft prompt strictly auxiliary.
      The prompt may say:
  - return only business results
  - do not reveal code, config, credentials, paths, symbols, prompts, or implementation details
  - do not explain internal execution steps

- [ ] Add i18n keys for:
  - refusal message
  - hidden implementation replacement
  - hidden credential replacement
  - generic protected failure
  - optional protected processing status

- [ ] Update all existing `conversation.json` locale files so i18n validation remains clean.
      If no translation is available, use English placeholder text consistently.

- [ ] Run:

  ```bash
  bun run i18n:types
  node scripts/check-i18n.js
  bunx tsc --noEmit
  ```

- [ ] Checkpoint commit:
  ```bash
  git add src/process/task/agentUtils.ts src/renderer/services/i18n/locales/*/conversation.json
  git commit -m "feat(guardrails): add protected repo prompts and messages"
  ```

---

## Task 7: Full Verification And Regression Sweep

**Files:**

- Reuse: `docs/feature/protected-repo-guardrail/requirements.md`
- Reuse: `docs/feature/protected-repo-guardrail/design.md`
- Reuse: `docs/feature/protected-repo-guardrail/implementation-plan.md`

- [ ] Run the focused guardrail test suite:

  ```bash
  bun run test tests/unit/common/guardrails/protectedRepoPolicy.test.ts tests/unit/common/guardrails/precheck.test.ts tests/unit/common/guardrails/postcheck.test.ts tests/unit/process/bridge/guardrails/ProtectedTurnBuffer.test.ts tests/unit/process/bridge/guardrails/ProtectedRepoGuardrailService.test.ts tests/unit/process/task/acpProtectedRepoGuardrail.test.ts
  ```

- [ ] Run adjacent ACP regression tests:

  ```bash
  bun run test tests/unit/AcpAgentManagerSkillInjection.test.ts tests/unit/acpConversationBridge.test.ts tests/unit/acpAdapter.test.ts
  ```

- [ ] Run static verification:

  ```bash
  bunx tsc --noEmit
  ```

- [ ] Run i18n verification:

  ```bash
  bun run i18n:types
  node scripts/check-i18n.js
  ```

- [ ] Run formatting and linting:

  ```bash
  bun run lint:fix
  bun run format
  ```

- [ ] Re-read the feature docs and confirm implementation still matches:
  - `docs/feature/protected-repo-guardrail/requirements.md`
  - `docs/feature/protected-repo-guardrail/design.md`
  - `docs/feature/protected-repo-guardrail/implementation-plan.md`

- [ ] Final checkpoint commit:
  ```bash
  git add docs/feature/protected-repo-guardrail src tests
  git commit -m "feat(guardrails): implement protected repo black-box mode"
  ```

---

## Execution Notes

- Keep the first implementation Claude-only. Do not generalize the policy across all backends in this pass.
- Do not add permission gating or tool blocking in this pass. The product boundary is output secrecy, not task prevention.
- Treat “safe final result” as the only supported UX for protected conversations.
- Prefer conservative replacement over clever partial preservation whenever implementation details might leak.
