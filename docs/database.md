# 数据库设计

> 状态：设计完成，**尚未创建任何真实数据库**（阶段 2 实施）。
> 目标是标准 PostgreSQL 结构，不依赖供应商专有特性。

## 1. 实体清单

| 表 | 用途 |
| --- | --- |
| `users` | 用户档案（认证凭证由托管认证服务管理） |
| `plans` | 订阅方案与价格配置 |
| `subscriptions` | 用户订阅状态 |
| `credit_ledger` | 额度流水（唯一可信来源） |
| `assets` | 图片/模型等二进制资源的元数据 |
| `product_templates` | 产品模板（当前由代码内置，云化后入库） |
| `template_versions` | 模板版本快照 |
| `projects` | 项目元数据与当前设计 JSON |
| `project_versions` | 项目历史版本 / 快照 |
| `render_jobs` | 渲染/导出任务 |
| `ai_jobs` | AI 任务（生成、抠图、场景融合） |
| `payments` | 支付订单 |
| `export_jobs` | 印刷导出任务 |
| `audit_logs` | 高风险操作审计（按需启用） |

## 2. 字段设计（核心表）

### users

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | uuid | PK，默认 `gen_random_uuid()` |
| `auth_subject` | text | UNIQUE NOT NULL（托管认证的用户标识） |
| `email` | citext | UNIQUE |
| `display_name` | text | |
| `created_at` / `updated_at` | timestamptz | NOT NULL DEFAULT now() |
| `deleted_at` | timestamptz | 软删除 |

索引：`unique(auth_subject)`、`unique(email)`。

### projects

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | uuid | PK |
| `owner_id` | uuid | FK → users(id) ON DELETE CASCADE，NOT NULL |
| `name` | text | NOT NULL，长度 1–120 |
| `mode` | text | CHECK IN ('2d','scene','3d') |
| `template_id` | text | NOT NULL |
| `template_version` | integer | NOT NULL，CHECK > 0 |
| `schema_version` | integer | NOT NULL |
| `design` | jsonb | NOT NULL（画布、图层、印刷规格） |
| `created_at` / `updated_at` | timestamptz | NOT NULL |
| `deleted_at` | timestamptz | 软删除 |

索引：`(owner_id, updated_at DESC) WHERE deleted_at IS NULL`；`gin(design jsonb_path_ops)`（可选）。

约束：`design` 必须在应用层通过 `@acs/project-schema` 校验后才写入；数据库层用 `CHECK (jsonb_typeof(design) = 'object')` 兜底。

### assets

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | uuid | PK |
| `owner_id` | uuid | FK → users(id) |
| `project_id` | uuid | FK → projects(id) ON DELETE SET NULL |
| `kind` | text | CHECK IN ('image','model','export','thumbnail') |
| `storage_key` | text | NOT NULL UNIQUE（对象存储路径） |
| `mime_type` | text | NOT NULL |
| `byte_size` | bigint | NOT NULL CHECK > 0 |
| `width` / `height` | integer | 可空（模型无尺寸） |
| `checksum` | text | 可空 |
| `created_at` | timestamptz | NOT NULL |
| `deleted_at` | timestamptz | 软删除 |

索引：`(owner_id, created_at DESC)`；`(project_id)`。

### credit_ledger

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | uuid | PK |
| `user_id` | uuid | FK → users(id) |
| `delta` | integer | NOT NULL（正为增加，负为消耗） |
| `reason` | text | NOT NULL（如 `ai.generate`、`ai.refund`、`plan.grant`） |
| `idempotency_key` | text | **UNIQUE**（幂等核心） |
| `job_id` | uuid | 可空，关联任务 |
| `balance_after` | integer | NOT NULL |
| `created_at` | timestamptz | NOT NULL |

约束：

- `unique(idempotency_key)` 保证同一请求不会重复扣减
- 余额由流水求和得出，同时维护物化余额并在事务中加行锁（`SELECT ... FOR UPDATE`）更新

### payments

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | uuid | PK |
| `user_id` | uuid | FK → users(id) |
| `provider` | text | NOT NULL |
| `provider_event_id` | text | **UNIQUE**（webhook 幂等） |
| `provider_payment_id` | text | 可空 |
| `amount_minor` | integer | NOT NULL |
| `currency` | text | NOT NULL，长度 3 |
| `status` | text | CHECK IN ('pending','paid','failed','refunded') |
| `created_at` / `updated_at` | timestamptz | NOT NULL |

约束：`unique(provider, provider_event_id)` 保证 webhook 重复投递不重复记账。

### render_jobs / ai_jobs / export_jobs

共用字段模式：

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | PK，对外作为任务 ID |
| `user_id` | uuid | FK → users(id) |
| `project_id` | uuid | 可空 |
| `status` | text | queued / processing / succeeded / failed / cancelled |
| `progress` | integer | 0–100 |
| `input` | jsonb | 输入参数与资源引用 |
| `output` | jsonb | 结果资源引用 |
| `error_code` / `error_message` | text | 统一错误格式 |
| `attempts` | integer | 重试次数，上限固定 |
| `idempotency_key` | text | UNIQUE |
| `started_at` / `finished_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | |

索引：`(user_id, created_at DESC)`、`(status) WHERE status IN ('queued','processing')`。

## 3. 数据隔离

- 所有业务表启用行级安全（RLS）
- 策略模板：`USING (owner_id = auth.uid())`（`projects`、`assets`、任务表）
- 服务端使用受限角色访问，`service_role` 仅用于服务端任务，绝不暴露给浏览器
- 任务结果读取同样受 RLS 限制：用户不能读取他人任务结果

## 4. 额度一致性

1. 请求进入时开启事务
2. `INSERT INTO credit_ledger (...) ON CONFLICT (idempotency_key) DO NOTHING`
3. 若插入 0 行 → 判定为重复请求，直接返回已有结果
4. 校验余额充足后锁定用户行并扣减
5. 任务失败 → 写入一条正数 `ai.refund` 流水（同样带幂等键）
6. 提交事务

## 5. 迁移与回滚

- 迁移脚本版本化存放，只允许向前迁移；回滚通过独立的 `down` 脚本且需人工确认
- 破坏性变更（删列、改类型）必须先做数据回填，再在后续版本删除
- 每次迁移在预览环境数据库上先执行一次
- 迁移失败不得静默破坏数据；应用启动时校验 `schema_version` 是否受支持

## 6. 备份与恢复

- 使用托管数据库的自动备份；定期验证可恢复性
- 对象存储启用生命周期与版本控制策略
- 恢复演练流程：新库恢复 → 校验行数与关键项目可打开 → 切换

## 7. 本地开发

`infra/docker/docker-compose.yml` 提供可选的本地 PostgreSQL，便于离线开发。
**正式运行不依赖 Docker**，生产使用托管数据库。
