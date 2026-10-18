# 云端配置说明（Phase 4）

> 本文件描述**如何**接入云端项目保存。当前仓库默认仍是浏览器本地存储，
> 未配置任何云端凭据，`/api/v1/status` 会如实返回 `storage: "local"`。
> 本文件不包含任何真实密钥，也不构成采购决策。

## 1. 当前真实状态

| 能力 | 状态 | 证据 |
| --- | --- | --- |
| Provider 接口与实现约定 | 已实现并验证 | `packages/cloud-core/src/ports.ts`、`errors.ts`、`runtime.ts` |
| 内存假实现（含越权、并发冲突、上传流程） | 已实现并验证 | `packages/cloud-core/src/fakes.ts` + `fakes.test.ts`（16 例） |
| 运行时保障（超时 / 有限重试 / 限流 / 用量记录 / 配置检查） | 已实现并验证 | `packages/cloud-core/src/runtime.ts` + `runtime.test.ts`（14 例） |
| API 契约（统一响应、错误码、上传/项目/资源 DTO） | 已实现并验证 | `packages/cloud-schema/src/*` + `*.test.ts`（14 例） |
| 配置解析与三态呈现 | 已实现并验证 | `apps/web/src/lib/cloud/config.ts` + `config.test.ts`（12 例） |
| 配置状态接口 | 已实现并验证 | `GET /api/v1/status` |
| SQL 迁移与 RLS | **仅编写，未执行** | `infra/sql/0001_init.sql`、`0002_rls.sql` |
| 真实托管数据库 / 对象存储 / 登录 | **尚未实现** | 需要用户选择供应商并提供凭据 |

**没有任何一步会伪造云端成功。** 未配置时前端只显示「浏览器本地保存」。

## 2. 运行模式

`CLOUD_MODE` 决定存储模式，取值只有三种：

| 值 | 存储模式 | 行为 |
| --- | --- | --- |
| 未设置 / `local` | `local`（默认） | 项目写入 `localStorage`；云端相关能力全部显示「未配置」 |
| `mock` | `mock` | 仅开发/测试：数据只存在于进程内存，**`APP_ENV=production` 时强制降级为 `local` 并给出告警** |
| `cloud` | `cloud` | 仅当数据库配置完整时才生效；否则**回退为 `local`** 并在 `problems` 中说明缺少哪些变量 |

对象存储与 AI 是可选能力：即使 `storage: "cloud"`，它们仍可能单独是 `not-configured`，
此时上传云端资源与 AI 功能保持不可用，不会假装成功。

## 3. 环境变量（只列变量名与用途，不含真实值）

| 变量 | 必填条件 | 用途 |
| --- | --- | --- |
| `CLOUD_MODE` | 云端必填 | `local` / `mock` / `cloud` |
| `CLOUD_PROJECT_STORE` | `CLOUD_MODE=cloud` | 项目存储实现标识（当前仅设计为 `postgres`） |
| `DATABASE_URL` | `CLOUD_MODE=cloud` | 托管 PostgreSQL 连接串（仅在服务端使用） |
| `NEXT_PUBLIC_SUPABASE_URL` | 使用托管认证时 | 认证服务地址 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 使用托管认证时 | 前端可公开的匿名键（受 RLS 约束） |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端写入时 | 服务角色密钥，**绝不进入前端 bundle** |
| `S3_ENDPOINT` / `S3_REGION` | 使用对象存储时 | S3 兼容端点 |
| `S3_BUCKET` | 使用对象存储时 | 私有桶名 |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | 使用对象存储时 | 签名密钥 |
| `AI_IMAGE_PROVIDER` / `AI_IMAGE_API_KEY` | 使用 AI 时 | 文生图 Provider 与密钥 |
| `APP_ENV` | 建议 | `dev` / `preview` / `production`；用于禁止生产环境使用 `mock` |

`.env.example` 只保留变量名；真实值只写入服务端环境变量或本地 `.env.local`（已被 `.gitignore` 忽略）。

## 4. 配置状态接口

```http
GET /api/v1/status
```

```json
{
  "data": {
    "requestedMode": "cloud",
    "storage": "local",
    "database": "not-configured",
    "objectStorage": "not-configured",
    "ai": "not-configured",
    "problems": ["CLOUD_MODE=cloud 但数据库配置不完整（缺少 DATABASE_URL、CLOUD_PROJECT_STORE），已回退为本地保存"],
    "checkedAt": "2026-10-18T00:00:00.000Z"
  },
  "requestId": "req_..."
}
```

- 只返回状态与**变量名**，不返回任何变量值。
- 响应头 `cache-control: no-store`。
- 「我的项目」与「账号」页面用同一解析逻辑渲染状态卡片。

## 5. 启用云端的步骤（需要授权后执行）

1. **选择供应商**（用户决策）：托管 Postgres + 认证（如 Supabase）与对象存储（如 R2 / Supabase Storage）。
2. 创建独立的开发/测试项目，**不要**直接在生产库上试验。
3. 在本地或 CI 的独立测试库执行迁移：
   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/sql/0001_init.sql
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/sql/0002_rls.sql
   ```
   验证方法见 `infra/sql/README.md`。
4. 配置服务端环境变量，设置 `CLOUD_MODE=cloud`，重启应用。
5. 访问 `GET /api/v1/status`：`storage` 必须为 `cloud`，`database` 必须为 `configured`。
6. 用**两个不同账号**验证：A 账号读不到 B 账号的项目（应返回 `NOT_FOUND` 而非 `FORBIDDEN`，避免泄露存在性）。
7. 只有以上步骤全部通过，前端才可切换为云端仓库；在此之前保持本地模式。

## 6. Provider 实现约定

任何真实实现（Postgres、Supabase、S3…）必须满足：

1. 实现 `packages/cloud-core/src/ports.ts` 中的接口，不改变签名。
2. 失败一律抛出 `ProviderError`，错误码取自 `@acs/cloud-schema` 的 `API_ERROR_CODES`。
3. 外部调用必须经 `callProvider()` 包装：统一超时（默认 15s）、仅在可重试错误码上重试（默认 3 次、指数退避、上限 2s）。
4. 每个用户维度的入口先过 `RateLimiter`，再调用外部服务。
5. 每次调用后向 `UsageRecorder` 写入一条记录（成功与失败都要记），用于额度与成本审计。
6. 配置检查用 `describeProviderConfig()`，缺失变量必须显式列出变量名。
7. 越权访问返回 `NOT_FOUND`（不区分「不存在」与「无权」，避免枚举）。
8. 保存项目使用乐观并发（`expectedUpdatedAt`），冲突返回 `CONFLICT` 并提示重新加载。
9. 测试必须使用 `fakes.ts` 的假实现，不访问真实网络或付费服务。

已提供的假实现：

```ts
import { createMemoryProjectStore, createFakeObjectStorage, createFakeAuthProvider } from "@acs/cloud-core";

const store = createMemoryProjectStore();          // 越权 → NOT_FOUND；并发 → CONFLICT
const storage = createFakeObjectStorage();         // 预签名 URL + 完成后登记资源（幂等）
const auth = createFakeAuthProvider();             // 未知 token → UNAUTHENTICATED
```

## 7. 错误码与 HTTP 的对应

| 错误码 | HTTP | 典型场景 |
| --- | --- | --- |
| `UNAUTHENTICATED` | 401 | 未登录 / 会话过期 |
| `FORBIDDEN` | 403 | 已登录但禁止该操作（如冒名创建） |
| `NOT_FOUND` | 404 | 资源不存在或不属于当前用户 |
| `CONFLICT` | 409 | 版本冲突（多人同时保存） |
| `VALIDATION_FAILED` | 422 | 项目 JSON / 上传参数不合法 |
| `RATE_LIMITED` | 429 | 触发限流 |
| `QUOTA_EXCEEDED` | 402 | 额度不足 |
| `NOT_CONFIGURED` | 503 | 外部服务未配置（**不得返回假成功**） |
| `UPSTREAM_ERROR` | 502 | 上游服务错误 |
| `TIMEOUT` | 504 | 上游超时 |
| `INTERNAL` | 500 | 未预期错误 |

## 8. 安全与成本

- 服务角色密钥只用于服务端任务，禁止出现在任何 `NEXT_PUBLIC_*` 变量中。
- 日志必须脱敏：不记录密钥、连接串、完整项目内容。
- 对象存储默认私有桶，下载使用短期授权 URL。
- 当前阶段不购买任何付费资源；免费计划不得假设可长期商用。
- 任何生产部署、付费开通、数据库迁移到生产环境都需要明确授权。
