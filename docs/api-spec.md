# API 契约

> 状态：契约已定义，**阶段 1 尚未实现服务端**（当前为纯前端 + 本地存储）。
> 实现时所有接口必须以 OpenAPI 文档形式维护，并自动生成前后端共享类型。

## 1. 通用约定

- 前缀：`/api/v1`
- 认证：托管认证服务的会话令牌（httpOnly cookie 或 Bearer），服务端校验
- 内容类型：`application/json`（上传走预签名 URL，不经过服务端转发）
- 时间：ISO 8601 UTC 字符串
- ID：字符串（UUID），不以数字自增暴露
- 幂等：写操作支持 `Idempotency-Key` 请求头
- CORS：仅允许受信来源
- 所有请求体与响应体经 Schema 校验；校验失败返回 `VALIDATION_FAILED`

## 2. 统一响应包裹

成功：

```json
{ "data": { }, "requestId": "req_..." }
```

失败：

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "人类可读中文说明",
    "details": [{ "path": "name", "message": "名称不能为空" }]
  },
  "requestId": "req_..."
}
```

## 3. 错误码

| 码 | HTTP | 含义 |
| --- | --- | --- |
| `UNAUTHENTICATED` | 401 | 未登录或会话失效 |
| `FORBIDDEN` | 403 | 已登录但无权访问该资源 |
| `NOT_FOUND` | 404 | 资源不存在（或无权得知其存在） |
| `VALIDATION_FAILED` | 422 | 请求体/参数校验失败 |
| `CONFLICT` | 409 | 版本冲突、并发修改 |
| `RATE_LIMITED` | 429 | 超出速率限制 |
| `QUOTA_EXCEEDED` | 402 | 额度不足 |
| `NOT_CONFIGURED` | 503 | 外部服务未配置（例如未设置 AI 密钥） |
| `UPSTREAM_ERROR` | 502 | 外部服务返回错误 |
| `TIMEOUT` | 504 | 外部服务超时 |
| `INTERNAL` | 500 | 未预期的服务端错误 |
| `NOT_SUPPORTED` | 400 | 请求的能力或功能尚未实现 |
| `CONTENT_REJECTED` | 422 | 内容被供应商或本地策略拒绝 |
| `CANCELED` | 409 | 任务被取消 |

**要求**：未配置外部服务时必须返回 `NOT_CONFIGURED`，不得返回假的成功结果。

## 4. 接口清单

### 用户

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/me` | 当前用户与订阅、额度摘要 |
| PATCH | `/api/v1/me` | 更新显示名称等 |

### 模板

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/templates` | 模板列表，支持 `?category=` |
| GET | `/api/v1/templates/{id}` | 模板详情（含版本、输出规格） |

响应中每个模板必须含 `id`、`version`、`category`、`canvas`、`editableArea`、`safeArea`、`bleed`、`outputSpec`、`verified`、`example`。

### 资源

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/v1/assets/upload-url` | 申请预签名上传 URL（限定路径、有效期、大小） |
| POST | `/api/v1/assets/complete` | 上传完成校验并登记元数据 |
| GET | `/api/v1/assets` | 列出当前用户资源 |

`upload-url` 请求：`{ kind, filename, mimeType, byteSize }`
响应：`{ assetId, uploadUrl, method, headers, expiresAt }`

### 项目

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/v1/projects` | 创建项目（`templateId`、`name`） |
| GET | `/api/v1/projects` | 列表（分页、排序） |
| GET | `/api/v1/projects/{id}` | 详情（含 `design` JSON 与 `schemaVersion`） |
| PUT | `/api/v1/projects/{id}` | 全量更新（带 `If-Match` 乐观锁） |
| PATCH | `/api/v1/projects/{id}` | 重命名等局部更新 |
| DELETE | `/api/v1/projects/{id}` | 软删除 |
| POST | `/api/v1/projects/{id}/duplicate` | 复制项目 |
| GET | `/api/v1/projects/{id}/versions` | 版本历史 |
| POST | `/api/v1/projects/{id}/versions/{versionId}/restore` | 版本恢复 |

约束：

- `design.schemaVersion` 必须被服务端支持，否则返回 `VALIDATION_FAILED`（或触发迁移）
- 模板版本固定为项目创建时的版本，服务端不得自动升级
- 越权访问返回 `NOT_FOUND`（不泄露资源存在性）

### 渲染 / 导出

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/v1/projects/{id}/renders` | 生成效果图（异步任务） |
| POST | `/api/v1/exports` | 创建印刷导出任务 |
| GET | `/api/v1/exports/{id}` | 导出任务状态与下载链接 |

### AI

**已实现（阶段 5，仅模拟 Provider）**：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/ai/status` | AI 服务状态：`state`（`not-configured` / `simulated` / `unverified` / `verified` / `unavailable`）、`requestedMode`、`providerId`、`simulatedCapabilities`、`problems`（仅变量名）、`verification`、`notice`；响应 `Cache-Control: no-store` |
| POST | `/api/v1/ai/jobs` | 按能力创建任务：`{ capability, input, projectId?, requestSchemaVersion? }`；成功返回 201，模拟执行时响应头 `x-acs-simulated: true` 且 `notice` 含「不是真实 AI 输出」；支持 `idempotency-key` 头去重 |
| GET | `/api/v1/ai/jobs/{id}` | 读取任务快照（含状态、结果引用、用量）；非本人任务返回 `NOT_FOUND` |

调用方通过 `x-acs-client-id` 标识归属（默认 `local-anonymous`）。该方法**不是鉴权**，仅用于任务隔离，因此模拟模式只在非生产环境开放。

**计划中（未实现）**：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/v1/ai/jobs/{id}/cancel` | 取消任务（服务层与测试已支持，尚未暴露 HTTP） |
| POST | `/api/v1/ai/generate-pattern` | 文本生成图案 |
| POST | `/api/v1/ai/remove-background` | 背景移除 |
| POST | `/api/v1/ai/scene-mockup` | 实拍场景融合 |

所有 AI 接口（设计约定）：

1. 校验用户身份与权限
2. 校验输入（类型、大小、尺寸）
3. 校验并预扣额度（幂等键）
4. 创建任务记录并返回 `jobId`
5. 失败时按规则写入返还流水

未配置 Provider → `NOT_CONFIGURED`（HTTP 503），不产生任务记录。

### 任务

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/jobs/{id}` | 任务状态（queued/processing/succeeded/failed/cancelled + progress） |
| POST | `/api/v1/jobs/{id}/cancel` | 取消（适用时） |

### 计费

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/billing/plans` | 方案列表（价格来自配置） |
| POST | `/api/v1/billing/checkout` | 创建结账会话（未配置支付时返回 `NOT_CONFIGURED`） |
| GET | `/api/v1/billing/subscription` | 当前订阅状态 |
| POST | `/api/v1/webhooks/payment` | 支付服务回调（校验签名、幂等） |

**支付规则**：订阅状态只能由经过验证的 webhook 或可信服务端查询更新；前端传入的订阅状态、价格、额度一律忽略。

### 管理

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/admin/users` | 用户列表（需管理员角色） |
| GET | `/api/v1/admin/jobs` | 任务与失败率 |
| GET | `/api/v1/admin/usage` | 用量与费用统计 |

## 5. 版本化

- 破坏性变更必须新增版本路径（`/api/v2`）
- 同一版本内只能做向后兼容的字段新增
- 响应新增字段必须可选；客户端不得依赖字段顺序

## 6. 迁移到云端时的前端改动

当前 `ProjectRepository` 接口（`list/get/create/save/remove/duplicate/exportJson/importJson`）保持不变，新增一个基于 API 的实现类即可切换，编辑器组件无需改动。
