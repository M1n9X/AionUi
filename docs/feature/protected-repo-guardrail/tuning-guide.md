# Protected Repo Black-Box Guardrail — 调参与修改指南

> 适用范围：当前 `Claude Code + Protected Repo Guardrail` 实现
> 关联文档：
>
> - [需求文档](./requirements.md)
> - [技术实现文档](./design.md)
> - [实施计划](./implementation-plan.md)

## 1. 这份文档解决什么问题

本指南不是讲“功能是什么”，而是讲：

- 你后续想调整 **precheck** 时改哪里
- 你后续想调整 **postcheck** 时改哪里
- 你后续想调整给 LLM 的 **Prompt** 时改哪里
- 你后续想调整 **UI 展示 / 黑盒模式行为** 时改哪里
- 你想做本地调试时该怎么打开测试模式

一句话：

> 以后你想“调策略”，优先看这份文档，不要从全仓库盲搜开始。

---

## 2. 修改入口总览

| 目标                     | 主要文件                                                          | 作用                                                   |
| ------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------ |
| 调整 precheck 拦截范围   | `src/common/chat/guardrails/implementationPatterns.ts`            | 定义实现类请求的匹配模式                               |
| 调整 precheck 决策       | `src/common/chat/guardrails/precheck.ts`                          | 决定 allow / block                                     |
| 调整 credentials 识别    | `src/common/chat/guardrails/credentialPatterns.ts`                | 定义 secret/token/key 匹配模式                         |
| 调整 postcheck 净化逻辑  | `src/common/chat/guardrails/postcheck.ts`                         | 决定 allow / redact / replace                          |
| 调整给 LLM 的黑盒 Prompt | `src/process/task/agentUtils.ts`                                  | 首条消息注入黑盒规则                                   |
| 调整运行时行为           | `src/process/task/AcpAgentManager.ts`                             | 决定何时 precheck、何时缓冲、何时净化、何时输出        |
| 调整会话自动注入测试模式 | `src/process/bridge/conversationBridge.ts`                        | 本地环境变量开启后自动把 workspace 视作 protected repo |
| 调整用户文案             | `src/renderer/services/i18n/locales/*/conversation.json`          | 拒答文案、隐藏文案、状态文案、badge 文案               |
| 调整会话头部标识         | `src/renderer/pages/conversation/components/ChatConversation.tsx` | 控制 `Protected Repo` 标识显示                         |

---

## 3. Precheck 如何调

## 3.1 改“哪些请求会被判定为危险请求”

文件：
[implementationPatterns.ts](/Users/mxue/GitRepos/infra/AionUi/.worktrees/protected-repo-guardrail/src/common/chat/guardrails/implementationPatterns.ts)

这里控制的是用户输入中的模式匹配，当前主要分为几类：

- 源码/代码请求
- 实现讨论请求
- 路径/符号泄露请求
- credentials 请求

如果你想：

- 放宽误拦
- 增强实现请求拦截
- 加入更多中文/英文变体

优先改这里。

### 典型修改

如果你想拦截“把 function.v2 目录贴出来”这类说法，就在对应 pattern 里补：

```ts
/目录/,
/贴出来/,
/function\.v2/i,
```

### 修改原则

- 优先改 pattern，不要一上来改运行时
- 先让“识别更准”，再动“行为更重”

## 3.2 改“命中后怎么处理”

文件：
[precheck.ts](/Users/mxue/GitRepos/infra/AionUi/.worktrees/protected-repo-guardrail/src/common/chat/guardrails/precheck.ts)

当前职责：

- 接收用户原始输入
- 根据 pattern 决定 `allow` 或 `block`
- 命中时返回拒答 `messageKey`

如果你想以后做更细分的 precheck，例如：

- `warn` 而不是直接 `block`
- 某些请求要求二次确认
- 针对某类 protected repo 使用不同拒答 key

就改这里。

### 当前默认策略

- 命中源码/实现/credentials 请求 → `block`
- 未命中 → `allow`

---

## 4. Postcheck 如何调

## 4.1 改 secret / token / key 的检测方式

文件：
[credentialPatterns.ts](/Users/mxue/GitRepos/infra/AionUi/.worktrees/protected-repo-guardrail/src/common/chat/guardrails/credentialPatterns.ts)

这里控制：

- 哪些赋值形式被视为 secret
- 哪些 token 前缀被视为敏感值

当前是偏保守、偏简单的模式集合。

如果你想增强：

- OpenAI / Anthropic / GitHub / Slack / AWS / GCP / Azure 凭据识别
- 私钥块识别
- URL embedded credentials 识别

优先在这里加 pattern。

## 4.2 改“implementation leak” 的判定

文件：
[postcheck.ts](/Users/mxue/GitRepos/infra/AionUi/.worktrees/protected-repo-guardrail/src/common/chat/guardrails/postcheck.ts)

这里的 `IMPLEMENTATION_PATTERNS` 决定哪些输出会被视为底层实现泄露，例如：

- fenced code block
- `src/...` 形式路径
- 类名/函数名/模块提示
- “实现位于…”、“入口函数…” 这类说明

如果你觉得当前太松或太严，就改这里。

### 典型增强

如果你想更强地拦截目录级引用，可加：

```ts
/(?:^|[\s(])[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+/m;
```

如果你想减少误杀，可以删除那些对普通自然语言过于敏感的 pattern。

## 4.3 改“净化动作”本身

同样在：
[postcheck.ts](/Users/mxue/GitRepos/infra/AionUi/.worktrees/protected-repo-guardrail/src/common/chat/guardrails/postcheck.ts)

当前行为是：

- 安全文本 → 原样返回
- credentials → 尽量局部脱敏
- implementation leak → 整段替换
- 混合泄露 → 优先整段替换

如果你想改成：

- credentials 一律整段替换
- implementation 只替换局部代码块
- 某些实现说明只告警不替换

就在 `runProtectedRepoPostcheck()` 里改 decision 逻辑。

### 当前默认原则

- 宁可多隐藏，不可漏隐藏

---

## 5. Prompt 如何调

文件：
[agentUtils.ts](/Users/mxue/GitRepos/infra/AionUi/.worktrees/protected-repo-guardrail/src/process/task/agentUtils.ts)

关键函数：

- `getProtectedRepoGuardrailPrompt()`

这个函数决定首条消息里给 LLM 注入什么黑盒约束。

当前核心语义是：

- 只返回最终业务结果
- 不暴露代码、配置、凭据、路径、符号名、实现细节
- 不解释内部执行过程

## 5.1 什么时候改 Prompt

以下情况优先改 Prompt：

- 模型仍然喜欢解释“我是如何完成任务的”
- 模型会主动输出步骤总结
- 你想让模型输出固定格式
- 你想让模型在被问实现问题时主动拒答

## 5.2 什么时候不要只改 Prompt

以下情况只改 Prompt 不够：

- 用户直接索要源码/credentials
- 模型已经把代码块/路径/secret 输出出来
- UI 还在展示 tool_call / plan / thought

这些必须改 precheck / postcheck / 运行时行为。

### 推荐做法

- 先改 prompt 降低模型“主动泄露”的概率
- 再用 precheck/postcheck 做硬边界

---

## 6. 运行时行为如何调

文件：
[AcpAgentManager.ts](/Users/mxue/GitRepos/infra/AionUi/.worktrees/protected-repo-guardrail/src/process/task/AcpAgentManager.ts)

这是最重要的行为控制点。

当前这里控制：

- precheck 在什么时机执行
- Protected Repo 会话如何识别
- 是否进入 result-only mode
- `content` 是否实时透传
- `thought/plan/tool_call/error` 是否抑制
- `finish` 时如何统一净化
- guardrail assistant 回复的 `msg_id`

## 6.1 如果你想修改“看不看中间步骤”

就改这里。

当前策略是：

- 受保护会话不显示中间步骤
- 只显示净化后的最终结果

如果你以后想放开部分可见性，例如：

- 显示“处理中”状态
- 显示安全版 tool summary
- 显示简化后的 plan

都要在这里改，而不是只改 renderer。

## 6.2 如果你想修改“消息合并/显示问题”

也是改这里。

例如这次修复的 UI 问题，本质原因是：

- guardrail 拒答/净化消息复用了用户输入的 `msg_id`
- renderer 会按 `msg_id` 合并文本消息

所以现在 guardrail 产生的 assistant 文本必须强制使用新的 assistant `msg_id`。

如果以后还有“消息被连在一起”的问题，优先检查这里。

---

## 7. UI 标识如何调

文件：
[ChatConversation.tsx](/Users/mxue/GitRepos/infra/AionUi/.worktrees/protected-repo-guardrail/src/renderer/pages/conversation/components/ChatConversation.tsx)

当前头部会在受保护会话里显示：

- `Protected Repo` badge

如果你想改：

- 标识文字
- 标识颜色
- tooltip 内容
- 标识显示位置

就改这里。

### 当前显示条件

- 会话类型为 `acp`
- `conversation.extra.protectedRepoPolicy.enabled === true`
- `backend === 'claude'`

如果以后你扩展到其他 backend，也要从这里放开条件。

---

## 8. 用户文案如何调

文件：
[conversation.json](/Users/mxue/GitRepos/infra/AionUi/.worktrees/protected-repo-guardrail/src/renderer/services/i18n/locales/en-US/conversation.json)
[conversation.json](/Users/mxue/GitRepos/infra/AionUi/.worktrees/protected-repo-guardrail/src/renderer/services/i18n/locales/zh-CN/conversation.json)

相关 key：

- `conversation.protectedRepo.badge`
- `conversation.protectedRepo.badgeTooltip`
- `conversation.protectedRepo.refusal`
- `conversation.protectedRepo.hiddenImplementation`
- `conversation.protectedRepo.hiddenCredential`
- `conversation.protectedRepo.failure`
- `conversation.protectedRepo.processing`

如果你只是想改话术，不改逻辑，直接改 locale 即可。

---

## 9. 本地测试模式如何开

文件：
[conversationBridge.ts](/Users/mxue/GitRepos/infra/AionUi/.worktrees/protected-repo-guardrail/src/process/bridge/conversationBridge.ts)

当前支持一个本地测试环境变量：

```bash
AIONUI_PROTECTED_REPO_GUARDRAIL=1
```

开启后：

- 所有通过 UI 创建的 `Claude ACP` 会话
- 只要带 `workspace`
- 就会自动把该工作区当作 protected repo

这只是为了本地调试方便，不是正式产品交互。

## 9.1 什么时候改这个逻辑

如果你后续要改成：

- 只对某些 Repo 生效
- 只对某些 skill set 生效
- 通过 UI 开关而不是 env 变量控制

就改这里。

---

## 10. 推荐调参顺序

如果你发现实际效果不理想，建议按这个顺序改：

1. **先改 locale**
   - 仅仅是文案不满意时

2. **再改 Prompt**
   - 模型经常主动解释实现，但还没真的泄露时

3. **再改 precheck patterns**
   - 明显恶意 Prompt 没拦住时

4. **再改 postcheck patterns**
   - 输出里仍有路径、代码、配置、secret 时

5. **最后改运行时行为**
   - 只有在 message merge、result-only mode、streaming 行为本身有问题时才改

---

## 11. 推荐验证命令

改完 guardrail 相关逻辑后，优先跑：

```bash
bun run test tests/unit/common/guardrails/protectedRepoPolicy.test.ts tests/unit/common/guardrails/precheck.test.ts tests/unit/common/guardrails/postcheck.test.ts tests/unit/process/bridge/guardrails/ProtectedTurnBuffer.test.ts tests/unit/process/bridge/guardrails/ProtectedRepoGuardrailService.test.ts tests/unit/process/task/acpProtectedRepoGuardrail.test.ts tests/unit/agentUtilsProtectedRepo.test.ts tests/unit/AcpAgentManagerSkillInjection.test.ts tests/unit/ConversationServiceImpl.test.ts tests/unit/conversationBridge.test.ts tests/unit/chatConversationProtectedRepo.dom.test.tsx
```

再跑：

```bash
bunx tsc --noEmit
bun run i18n:types
node scripts/check-i18n.js
```

如果要手工验证：

```bash
AIONUI_PROTECTED_REPO_GUARDRAIL=1 bun start
```

---

## 12. 当前实现的关键文件索引

- precheck:
  [precheck.ts](/Users/mxue/GitRepos/infra/AionUi/.worktrees/protected-repo-guardrail/src/common/chat/guardrails/precheck.ts)
- postcheck:
  [postcheck.ts](/Users/mxue/GitRepos/infra/AionUi/.worktrees/protected-repo-guardrail/src/common/chat/guardrails/postcheck.ts)
- LLM 黑盒 Prompt:
  [agentUtils.ts](/Users/mxue/GitRepos/infra/AionUi/.worktrees/protected-repo-guardrail/src/process/task/agentUtils.ts)
- 运行时行为:
  [AcpAgentManager.ts](/Users/mxue/GitRepos/infra/AionUi/.worktrees/protected-repo-guardrail/src/process/task/AcpAgentManager.ts)
- 本地测试模式:
  [conversationBridge.ts](/Users/mxue/GitRepos/infra/AionUi/.worktrees/protected-repo-guardrail/src/process/bridge/conversationBridge.ts)
- 会话头部标识:
  [ChatConversation.tsx](/Users/mxue/GitRepos/infra/AionUi/.worktrees/protected-repo-guardrail/src/renderer/pages/conversation/components/ChatConversation.tsx)
