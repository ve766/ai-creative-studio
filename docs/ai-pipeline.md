# AI 管线与 Provider 规范

> 状态（t0.2.0 阶段 5）：**已实现合约、模拟 Provider、任务状态机、用量台账与状态接口；未实现任何真实供应商适配器，未发生任何真实 AI 调用，未产生任何费用。**
> 代码位置：`packages/ai-schema`（合约与校验）、`packages/ai-core`（Provider 接口、运行时保障、模拟实现、任务服务、状态判定）、`apps/web/src/app/api/v1/ai/*`（HTTP 接口）。

## 1. 服务状态取值（必须严格区分）

| 状态 | 判定条件 | 展示 |
| --- | --- | --- |
| `not-configured` | AI 关闭（未设置 `AI_MODE`）或真实凭据不完整；当前也没有任何真实适配器 | 界面「未配置」，接口 `NOT_CONFIGURED` |
| `simulated` | `AI_MODE=mock` 且非生产环境 | 界面「开发模拟（结果非真实 AI）」+ 显著提示 |
| `unverified` | 已注册真实 Provider 且配置齐全，但**没有成功的真实调用记录** | 「已配置但未验证」 |
| `verified` | 有真实调用成功记录（`AiVerificationStore.recordLiveSuccess`）且未过期 | 「真实服务已验证」+ 证据文本 |
| `unavailable` | 真实调用失败时间晚于最近一次成功验证 | 「暂时不可用」+ 最近失败错误码 |

硬性规则（由 `AiServiceStatusSchema` 的 refine 强制，测试覆盖）：

1. `verified` 必须带 `verification.verifiedAt`，且 `requestedMode` 必须是 `live`；
2. 模拟调用**永远不会**写入 `verifiedAt`（只记入 `simulatedEvidence`）；
3. 验证记录超过 24 小时视为过期，回到 `unverified`；
4. 环境变量、API 密钥、Provider 类的存在**都不算**验证。

## 2. 能力声明（capability）

能力是唯一的能力描述方式，业务代码只依赖能力，不依赖供应商字段。

| 能力 | 含义 | 当前状态 |
| --- | --- | --- |
| `image.generate` | 文本生成图案 | 有模拟实现 |
| `image.edit` | 局部修改 | 有模拟实现 |
| `image.remove-background` | 智能抠图 | 有模拟实现 |
| `image.seamless-tile` | 无缝平铺纹理 | 有模拟实现 |
| `image.product-scene` | 产品场景贴图 | 有模拟实现 |
| `mesh.generate` | 3D 模型生成 | **仅声明，无实现**，请求返回 `NOT_SUPPORTED` |

供应商特有参数**不允许**进入请求结构：请求 schema 使用严格模式（`.strict()`），出现未知字段（例如 `style_preset`）直接 `VALIDATION_FAILED`，供应商适配器只负责把通用请求翻译成自己的格式。

请求/结果结构各自带版本号：`AI_REQUEST_SCHEMA_VERSION`、`AI_RESULT_SCHEMA_VERSION`（当前均为 1），请求里可带 `requestSchemaVersion`，版本不匹配返回 `VALIDATION_FAILED`。

## 3. Provider 合约

```ts
interface AiProvider {
  readonly id: string;
  readonly mode: "live" | "mock";
  readonly capabilities: readonly AiCapability[];
  describeConfiguration(): ProviderConfig;      // { mode, missing: string[] }，只含变量名
  run(request: AiRequest, context: AiRunContext): Promise<AiProviderOutcome>;
}

interface AiRunContext {
  taskId: string;
  ownerId: string;
  projectId: string | null;
  attempt: number;
  signal: AbortSignal;                          // 超时与取消共用
  onProgress?: (progress: { stage: string; percent: number }) => void;
}
```

- 统一错误：所有失败一律抛 `ProviderError`（`@acs/cloud-core`），错误码取自统一枚举，`retryable` 决定是否重试。
- 统一任务状态：`queued → running → succeeded | failed | canceled | timed-out`。
- 统一结果引用：`AiResultAsset` 支持 `inline-data-url`、`storage-key`、`remote-url` 三种，schema 强制校验匹配关系（`storage-key` 不能是外部 URL，`remote-url` 必须是 https）。
- 供应商适配器只实现 `AiProvider`，注册进 `createAiProviderRegistry`；同一能力优先选 `live`，缺失时按环境决定是否回退 `mock`，生产环境注册表直接隐藏 mock（`NOT_CONFIGURED`）。

## 4. 任务流程

```
1. POST /api/v1/ai/jobs
   a. 幂等键去重（同 owner + key 直接返回已有任务）
   b. 限流（令牌桶，按主体）→ 并发上限（默认同一主体 2 个）→ 超限返回 RATE_LIMITED
   c. 能力是否已实现 → 否则 NOT_SUPPORTED
   d. 请求 schema 严格校验 → 否则 VALIDATION_FAILED
   e. 解析 Provider；mock 被禁用时 NOT_CONFIGURED / FORBIDDEN
   f. 建任务（queued）→ running → 执行（超时 60s，重试 1 次，仅重试可重试错误）
2. 终态：succeeded（写结果 + 用量）/ failed / canceled（取消）/ timed-out
3. GET /api/v1/ai/jobs/{id} 读取任务快照；非本人返回 NOT_FOUND
```

任务记录包含：`taskId`、`capability`、`providerId`、`mode`、`simulated`、`status`、`attempts`、请求/结果 schema 版本、时间戳、结果、模型名、用量、错误、取消标记。对外快照（`AiJobSnapshot`）**不含** `ownerId` 与 `idempotencyKey`。

当前 HTTP 层尚未提供取消接口（服务层与测试已支持 `cancel`），真实长任务接入时再补 `POST /api/v1/ai/jobs/{id}/cancel`。

## 5. 用量与成本

- 台账 `AiUsageLedger` 以 `taskId` 为唯一键（`recordOnce`），**重试、重复回调都不会产生第二条记录**；失败/取消/超时只记一条并标记 `refunded: true` 与原因。
- 记录字段：用户、项目、Provider、能力、任务 ID、终态、尝试次数、可获得的用量、**预估成本与实际成本分开存放**、退款/补偿状态、时间。
- 预估成本 `estimatedCost` 必须带估算依据（`basis`）；实际成本 `actualCost` 必须带来源（`source`），本阶段**没有真实账单**，所有记录都是 `simulated: true`、`actualCost: null`，汇总里用 `costsAreSimulatedOnly` 明确标注。
- 汇总额度扣减与幂等唯一约束属于数据库层（`infra/sql/0001_init.sql` 的 `credit_ledger.idempotency_key` 唯一约束），**尚未在真实数据库验证**。

## 6. 限额（当前实现值）

| 项目 | 值 | 位置 |
| --- | --- | --- |
| 单边尺寸 | 64–4096 px | `MIN_IMAGE_EDGE` / `MAX_IMAGE_EDGE` |
| 面积 | ≤ 16,000,000 px | `MAX_IMAGE_PIXELS` |
| 提示词长度 | ≤ 1000 字符 | `MAX_PROMPT_LENGTH` |
| 单次任务超时 | 60 s | `DEFAULT_AI_TIMEOUT_MS` |
| 重试次数 | 2 次尝试（即重试 1 次） | `DEFAULT_AI_RETRY` |
| 同一主体并发 | 2 | `DEFAULT_MAX_CONCURRENT_PER_OWNER` |
| 限流 | 10 次 / 分钟（默认，可注入） | `RateLimiter` |
| 台账保留 | 200 条（内存） | `AiUsageLedger` |
| 验证记录有效期 | 24 h | `AI_STATUS_VERIFICATION_TTL_MS` |

## 7. 安全与隐私

- 密钥只存在于服务端环境变量；状态接口与错误信息只返回**变量名**，不返回值；错误文本经 `maskSecretsInText` 掩码 `sk-...`。
- 参数不做任何路径/URL 拼接，结果引用由 schema 约束类型。
- **已知缺口**：AI 接口目前**没有接入登录、项目所有权与额度校验**（项目尚无认证基础设施），因此 `POST /api/v1/ai/jobs` 仅在非生产环境可用，且只运行模拟 Provider；服务端通过请求头 `x-acs-client-id` 区分调用方来做任务隔离，这只是防串读，不是鉴权。
- 未配置时接口一律 `NOT_CONFIGURED`，不会返回任何假成功。

## 8. 尚未实现（不得视为已完成）

1. 真实供应商适配器（图像生成 / 抠图 / 场景）与真实调用验证；
2. 数据库持久化的任务队列、用量与额度表（`infra/sql` 已写，未执行）；
3. HTTP 取消接口、任务进度推送；
4. 鉴权、项目所有权、额度扣减（依赖阶段 2 的账号体系）；
5. 输出画质检查（分辨率/透明边缘/安全区）与印刷联动，见 `docs/print-export.md`。
