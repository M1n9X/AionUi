# Protected Repo Black-Box Guardrail — 技术实现文档

> 基于 [需求文档](./requirements.md) 编写
> 关键参考：
> - Claude Code Hooks：<https://code.claude.com/docs/en/hooks>
> - Claude Code Settings：<https://code.claude.com/docs/en/settings>
> - Claude Agent SDK：<https://code.claude.com/docs/en/agent-sdk/overview>
> - Anthropic Mitigate Jailbreaks：<https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks>
> - Anthropic Reduce Prompt Leak：<https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-prompt-leak>
> - 本仓库链路分析：`docs/tech/acp-detector.md`

## 1. 设计结论

本功能的推荐实现不是 “Claude hooks-only”，而是 **AionUi 自身的会话级 Guardrail Pipeline**。

核心策略：

1. **Precheck**：在 Prompt 进入 Claude 前，拦截所有索要 Protected Knowledge 的请求
2. **Result-Only Mode**：受保护会话不向用户展示 thought / plan / tool_call / 原始 error
3. **Postcheck**：在最终结果发给用户前，对聚合后的原始输出做净化
4. **Sanitized Persistence**：仅将净化后的内容写入 DB、UI 和 channel

一句话：

> Protected Repo 会话只能输出经过净化的业务结果，不能输出任何底层实现知识。

---

## 2. 为什么不采用 hooks-only

### 2.1 当前链路约束

当前仓库中，Claude 并不是通过简单的 `claude -p` 直接运行，而是通过 ACP bridge 接入：

- `src/common/types/acpTypes.ts` 固定了 `@zed-industries/claude-agent-acp`
- `docs/tech/acp-detector.md` 已说明当前实际链路为：
  - AionUi
  - `claude-agent-acp`
  - Claude Agent SDK / embedded Claude CLI

同时，AionUi 自己持有以下关键输出控制点：

- 首条规则注入：`src/process/task/AcpAgentManager.ts`
- 流式消息处理与落库：`src/process/task/AcpAgentManager.ts`
- ACP 会话消息适配：`src/process/agent/acp/index.ts`
- DB 持久化与 channel 转发：`src/process/task/AcpAgentManager.ts`

### 2.2 hooks-only 的问题

仅依赖 Claude hooks 存在以下问题：

1. `UserPromptSubmit` / `Stop` hooks 虽然适合作为防线，但当前 ACP 模式下是否完整加载 project hooks，并不是本仓库当前已验证能力
2. 即使 hooks 生效，AionUi 自己仍可能在 thought / plan / tool_call / error 层面泄露实现信息
3. 当前需求的安全边界在 AionUi 输出链路，而不是 Claude CLI 自身

### 2.3 最终决策

本期主防线放在 AionUi 内部。

Claude hooks 可以作为后续可选的 **defense-in-depth**，但不能作为当前唯一实现方案。

---

## 3. 总体架构

## 3.1 运行时架构

```text
用户输入
  ↓
Precheck（用户原始文本）
  ├─ 命中 Protected Knowledge → 直接拒答
  └─ 放行
        ↓
Claude 正常执行 skills
        ↓
受保护会话运行时缓冲（隐藏中间事件）
        ↓
Postcheck（聚合后的原始结果）
  ├─ Clean → 直接展示
  ├─ Credential Leak → 脱敏/替换
  └─ Implementation Leak → 黑盒替换
        ↓
只把净化后的结果发给 UI / DB / channel
```

## 3.2 关键设计点

### A. 只对 Protected Repo 会话生效

普通 Claude 会话保持现有行为，不引入额外延迟或体验变化。

### B. 进入 Result-Only Mode

一旦会话被标记为 Protected Repo：

- 不把中间 `thought`、`plan`、`acp_tool_call` 发给用户
- 不实时透传 raw `content` chunk
- 只在 turn 结束后输出净化后的最终结果

这是安全上的必要条件。否则即使最终回答被净化，前面的流式 steps 也可能已经泄露路径、代码或配置。

### C. 只信任确定性规则，不信任模型自律

Guardrail 本身不依赖模型理解“哪些内容不该说”。模型提示只是辅助约束，不作为安全边界。

---

## 4. 数据模型设计

## 4.1 会话级策略

在会话 `extra` 中新增一个受保护策略对象，作为运行时开关与上下文来源。

建议类型：

```typescript
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
```

建议挂载位置：

- `src/common/config/storage.ts`
- 仅先加到 `TChatConversation` 的 `acp` extra 中

原因：

- 当前需求只覆盖 Claude ACP 会话
- 会话级存储最适合做 precheck / postcheck 的统一开关

补充说明：

- 该策略不负责“加载” skills
- 现有会话里的 `enabledSkills` / `extraSkillPaths` 仍然是 skills 装载来源
- `protectedSkillSetId` / `protectedSkillNames` / `protectedSkillRoots` 主要用于语义绑定、提示注入和后续审计

### 4.2 Turn 级缓冲状态

受保护会话在一次 assistant turn 中需要额外维护缓冲态：

```typescript
type ProtectedTurnBuffer = {
  contentChunks: string[];
  pendingError: string | null;
  hiddenThoughtCount: number;
  hiddenPlanCount: number;
  hiddenToolCallCount: number;
  hasVisibleResult: boolean;
  status: 'idle' | 'running';
};
```

作用：

- 聚合原始 `content` chunks
- 暂存原始错误文本
- 统计被隐藏的中间事件，便于调试和观测
- 在 `finish` 时统一做 postcheck

### 4.3 与现有 skill 装载机制的关系

本功能不重新设计 skill discovery / symlink / prompt injection 机制，而是复用现有链路：

- `src/process/utils/initAgent.ts`
- `src/process/task/agentUtils.ts`
- `enabledSkills`
- `extraSkillPaths`

也就是说：

1. 上层仍按现有方式把 skills 挂进会话
2. Guardrail 只负责把这类会话定义为“可执行但不可解释”的黑盒模式
3. 后续若需要做更强的 skill 来源校验，可基于 `protectedSkillRoots` 做增强

---

## 5. 规则引擎设计

## 5.1 规则类别

本期规则引擎分两类：

1. **Implementation Leak Rules**
   - 用于识别源码、文件、配置、路径、符号、实现讨论
2. **Credential Leak Rules**
   - 用于识别 token、key、私钥、secret、连接串等

## 5.2 输入侧规则（Precheck）

precheck 只看用户原始输入，目标是识别“请求意图”。

### 命中条件

满足以下任一条件即 block：

- 请求“显示/贴出/导出/总结”源码、文件、配置、prompt、skill 内容
- 请求“解释/分析/讨论”受保护 Repo 的实现逻辑
- 请求“在哪个文件/模块/类/函数里实现”
- 请求打印 credentials、env、token、secret
- 请求 Claude 说明自己如何在 Repo 内完成任务

### 动作

直接返回拒答，不进入 Claude。

### 输出文案

文案不硬编码，使用 i18n key 渲染。建议语义：

- 无法处理 source code 或 credentials 相关请求
- 该能力仅支持执行封装后的 skill，不提供底层实现信息

## 5.3 输出侧规则（Postcheck）

postcheck 看的是模型原始输出全文或待展示文本。

### 分类结果

```typescript
type GuardrailPostcheckDecision =
  | { action: 'allow' }
  | { action: 'redact_credentials'; redactions: Array<{ start: number; end: number }> }
  | { action: 'replace_implementation'; replacementKey: string }
  | { action: 'replace_error'; replacementKey: string };
```

### 动作原则

- **credentials**：优先精确脱敏；若整段上下文不安全，则替换整段
- **implementation**：优先整段替换，不做“只删一两行”的局部修补
- **error / debug**：统一替换为黑盒失败文案

原因：

- implementation 泄露通常不是单一 token 问题，而是整段回答的意图都不该对外
- 局部删减容易残留路径、类名、函数名等线索

---

## 6. Result-Only Mode 设计

## 6.1 隐藏的事件类型

对于受保护会话，以下事件不应直接展示给用户：

- `thought`
- `plan`
- `acp_tool_call`
- `request_trace`
- `acp_model_info`
- `acp_context_usage`
- 原始 `error`

建议行为：

- 对 UI：不显示这些事件，必要时显示通用“处理中”状态
- 对 DB：不以用户可回放形式持久化这些原始事件
- 对 channel：不转发这些原始事件

## 6.2 content 流式输出处理

当前普通会话会实时透传 `content` chunk。受保护会话不能继续这样做。

推荐行为：

1. `content` chunk 到达时，只追加到 `ProtectedTurnBuffer`
2. 不立即发给 UI / DB / channel
3. turn `finish` 时，拿聚合后的全文执行 postcheck
4. 输出一条净化后的最终文本消息

### 为什么必须缓冲

如果继续逐 chunk 透传，会有两个问题：

1. 代码块、配置块、路径等常跨 chunk 出现，单 chunk 很难准确识别
2. 即使最终回答被净化，前面已经展示过的 chunk 仍然构成泄露

因此 Protected Repo 会话必须牺牲实时流式体验，以换取可靠的黑盒边界。

---

## 7. 模块划分与文件落点

## 7.1 纯规则与共享类型

建议新建：

```text
src/common/chat/guardrails/
├── types.ts
├── protectedRepoPolicy.ts
├── precheck.ts
├── postcheck.ts
├── implementationPatterns.ts
├── credentialPatterns.ts
└── index.ts
```

职责：

- 放纯逻辑、纯类型、纯规则
- 不依赖 Electron、IPC、DB
- 可直接做单元测试

选择 `src/common/chat/guardrails/` 的原因：

- `src/common/chat/` 当前目录规模可接受
- guardrail 的规则与文本处理是跨层纯逻辑

## 7.2 主进程运行时编排

建议新增：

```text
src/process/bridge/services/guardrails/
├── ProtectedRepoGuardrailService.ts
└── ProtectedTurnBuffer.ts
```

职责：

- 判断某个会话是否开启 Protected Repo Guardrail
- 执行 precheck / postcheck
- 维护 turn 级缓冲状态
- 生成安全替代消息

说明：

- 当前 `src/process/services/` 已明显超过目录大小约束
- 为避免继续扩大该目录，运行时编排服务优先放在已有规模可控的 `src/process/bridge/services/`
- 若后续要做更系统的目录治理，再整体迁移到新的服务责任分组下

## 7.3 现有文件接入点

### `src/common/config/storage.ts`

改动：

- 为 `acp` 会话 extra 增加 `protectedRepoPolicy?: ProtectedRepoPolicy`

### `src/process/task/AcpAgentManager.ts`

这是本功能最核心的接入点。

改动：

1. 在真正调用 `agent.sendMessage` 前执行 precheck
2. 在受保护会话下启用 `ProtectedTurnBuffer`
3. 在 `handleStreamEvent()` 内于 `transformMessage()` / `addOrUpdateMessage()` 之前短路受保护事件
4. 拦截 `thought` / `plan` / `acp_tool_call` / `error` 的原始透传
5. 将 `content` 从“实时透传”改为“缓冲后统一输出”
6. 在 `handleSignalEvent()` / `handleFinishSignal()` 中只广播净化后的最终结果
7. 只对净化后的最终结果执行 DB 写入与总线广播

### `src/process/task/agentUtils.ts`

改动：

- 在受保护会话首条消息的规则注入中，加一段软约束提示
- 仅作为辅助，不作为安全边界

建议提示语义：

- 该会话只允许返回任务结果
- 不得返回任何代码、配置、凭据或实现细节
- 不得解释内部执行过程

### `src/process/agent/acp/index.ts`

改动原则：

- 尽量不在 ACP 协议层做复杂安全判断
- 协议层继续负责把事件转成统一消息
- 真正的“是否显示给用户”决策放在 `AcpAgentManager` 的统一出口

### `src/process/task/MessageMiddleware.ts`

改动原则：

- 受保护会话不应继续在“原始未净化文本”上执行基于文本内容的额外自动逻辑
- 当前 cron 文本检测若保留，必须移动到“净化后的最终文本”之后再执行

### i18n 文件

新增文案建议放到对话相关 locale 文件，例如：

- `src/renderer/services/i18n/locales/en-US/conversation.json`
- `src/renderer/services/i18n/locales/zh-CN/conversation.json`

至少需要：

- precheck 拒答文案
- implementation 被隐藏提示
- credential 被隐藏提示
- 通用失败文案
- 处理中状态文案

---

## 8. 运行流程细化

## 8.1 Precheck 流程

```text
用户消息
  ↓
读取 conversation.extra.protectedRepoPolicy
  ↓
未开启 → 走现有普通流程
已开启 → 执行 precheck(raw user input)
  ↓
block → 直接生成拒答消息并结束本轮
allow → 继续调用 Claude
```

关键要求：

- precheck 使用 **用户原始文本**
- 不能对注入后的 system text 再做判断

## 8.2 Claude 执行期间

当 Guardrail 开启时：

- `start`：可选发一个通用“处理中”状态
- `content`：只缓冲，不透传
- `thought` / `plan` / `acp_tool_call`：直接抑制
- `error`：只缓存，不透传

这里的“抑制”必须同时覆盖三条路径：

1. `ipcBridge.acpConversation.responseStream.emit`
2. `addOrUpdateMessage` / 数据库存储
3. `channelEventBus.emitAgentMessage`

## 8.3 Finish 阶段

收到 `finish` 后：

1. 读取 turn buffer 中的聚合文本
2. 若有文本，执行 postcheck
3. 生成净化后的最终结果消息
4. 将净化结果写入 DB，并发给 UI / channel
5. 清空 turn buffer

若无文本但有错误：

1. 不透传原始错误
2. 输出通用失败消息
3. 清空 turn buffer

若 `finish` 到达前已触发 `ConversationTurnCompletionService` 相关完成通知，则受保护会话需要延后该通知时机，直到净化后的最终消息已生成。

## 8.4 意外中断

若发生 timeout、disconnect、异常：

- 不输出已缓冲但未经 postcheck 的原始文本
- 直接走通用失败路径

---

## 9. 净化策略细节

## 9.1 Implementation Leak 策略

命中以下任一模式即视为 implementation 泄露：

- 代码块
- 文件路径
- 文件内容引用
- 模块、类、函数、脚本、prompt、skill 实现描述
- “我是通过读取某文件/执行某脚本完成的” 这类执行解释

动作：

- 用黑盒替代文案替换整段回答或相关片段
- 若整条消息已失去业务意义，可替换为通用省略消息

建议替代语义：

- 已完成任务，但底层实现信息不对外展示
- 结果已生成，源码、配置与实现细节已省略

## 9.2 Credential Leak 策略

优先匹配：

- 常见 key/token 前缀
- 私钥头尾
- `KEY=VALUE` / `TOKEN=VALUE` / URL 内嵌凭据
- 典型云厂商、OpenAI、Anthropic、GitHub、Slack 等 token 格式

动作：

- 高置信度命中时进行局部脱敏
- 若上下文是“整段都在讨论 secret”，则替换整段

示例：

```text
ANTHROPIC_API_KEY=sk-ant-abc...
↓
ANTHROPIC_API_KEY=[REDACTED]
```

## 9.3 错误消息策略

对于原始错误文本，统一采用黑盒失败策略，不做细粒度保留。

原因：

- 错误文本常带路径、文件名、调用栈、环境变量
- 这类信息对最终用户不是必要信息

建议保留的只是失败结论，而非失败细节。

---

## 10. 持久化与广播策略

## 10.1 DB 持久化

原则：

- 只持久化净化后的 assistant 结果
- 不把原始 implementation / credential 泄露文本作为普通消息写入 DB

实现上需要注意：

- 现有 `AcpAgentManager.handleStreamEvent()` 会在消息 emit 前先做 `transformMessage()` 和 `addOrUpdateMessage()`
- 因此受保护路径必须在这一步之前短路，否则“虽然 UI 没看到，但 DB 已经存了原文”

## 10.2 UI 广播

原则：

- UI 只收到净化后的最终结果和必要的通用状态

## 10.3 Channel 广播

当前 `AcpAgentManager` 会把事件发往 `channelEventBus`。受保护会话必须遵守同样的净化策略。

原则：

- channel 不得收到原始 implementation / credential 内容
- channel 只收到净化后的最终结果或通用失败文案

## 10.4 导出与回放

由于本设计要求仅持久化净化后的结果，因此：

- 现有会话导出能力天然只会导出净化后的文本
- 历史消息回放也只能看到净化后的文本

这也是为什么“先净化再入库”是本方案的硬性要求。

---

## 11. 与现有逻辑的兼容点

## 11.1 Cron / 自动命令

当前 `AcpAgentManager` 会基于原始文本做 cron 命令检测。

为了避免受保护会话在“原始未净化文本”上继续驱动自动行为，建议：

- Protected Repo 会话不使用原始 chunk 做 cron 检测
- 如确有必要，仅在净化后的最终文本上再判断

本期推荐直接关闭受保护会话的 cron 文本驱动能力，保持语义最简单。

## 11.2 首条规则注入

当前系统已有 `presetContext` 注入机制。Guardrail 的软提示应复用现有机制，而不是重新发明一套 prompt 注入路径。

## 11.3 技能上下文绑定

为了让“Repo 作为黑盒能力源”这一产品语义在实现上成立，建议上层在创建会话时同时传入：

- `enabledSkills`
- `extraSkillPaths`
- `protectedRepoPolicy.protectedSkillSetId`
- `protectedRepoPolicy.protectedSkillNames`
- `protectedRepoPolicy.protectedSkillRoots`

这样文档、运行时和后续审计可以对齐到同一组 skills。

## 11.4 普通会话

未开启 `protectedRepoPolicy` 的普通会话必须保持现有体验与逻辑，不引入回归。

---

## 12. 测试方案

## 12.1 单元测试

建议新增：

```text
tests/unit/chat/guardrails/precheck.test.ts
tests/unit/chat/guardrails/postcheck.test.ts
tests/unit/bridge/services/guardrails/ProtectedRepoGuardrailService.test.ts
```

覆盖点：

- 源码请求命中
- 实现讨论命中
- credentials 请求命中
- 正常任务放行
- credential 脱敏
- implementation 整段替换
- guardrail 异常时保守失败

## 12.2 会话级集成测试

建议补充 `AcpAgentManager` 相关测试，至少覆盖：

1. Protected Repo 会话下，precheck block 时不调用 `agent.sendMessage`
2. Protected Repo 会话下，`content` chunk 不会原样透传
3. `thought` / `plan` / `acp_tool_call` 被抑制
4. `finish` 时只输出净化后的最终结果
5. `error` 不会原样透传
6. 净化后的文本才会写入 DB
7. `channelEventBus` 只收到净化后的最终文本
8. `ConversationTurnCompletionService` 不会早于净化结果触发完成

## 12.3 回归测试

必须验证：

- 普通 Claude 会话不受影响
- 非 Claude backend 不受影响
- i18n 文案可正常渲染

---

## 13. 迭代建议

### Phase 1

- 会话级策略接入
- precheck block
- Result-Only Mode
- content 聚合后 postcheck
- 通用失败文案

### Phase 2

- 更完整的 credential patterns
- repo 级自定义规则
- 更细的黑盒替代文案

### Phase 3

- 评估把 Claude 原生 hooks 作为额外防线
- 扩展到更多 backend

---

## 14. 风险与取舍

## 14.1 主要取舍

本设计明确用“更保守的黑盒边界”换取“更弱的实时解释性”。

具体表现为：

- 失去流式文本体验
- 不展示中间步骤
- 某些边缘情况下会误拦或误净化

这是有意为之，因为当前需求的优先级是：

> 宁可少说，也不能泄露受保护 Repo 的内部知识。

## 14.2 已知限制

- 本期不限制应用外的直接文件访问面
- 本期不通过模型判断复杂语义，仅靠规则判断
- 若 skill 的正常结果天然包含代码/配置，则也会被保守净化

这三点都应在后续产品边界设计中继续澄清，但不影响本期实现可用性。
