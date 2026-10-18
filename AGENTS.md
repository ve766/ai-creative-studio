# AGENTS.md — 开发规范与协作规则

本文件适用于所有参与本仓库的开发者与 AI Agent。

## 1. 最高原则

1. **真实优先**：不伪造测试结果，不把模拟能力描述为真实 AI 能力，不用静态页面冒充已完成功能。
2. **先闭环再扩展**：先让核心流程可运行、可验证，再增加复杂度。
3. **云端优先**：优先托管服务与 HTTPS API，不自行运维服务器、GPU、数据库主机。
4. **密钥安全**：任何密钥只存在于服务端环境变量，绝不进入前端代码、Git 或日志。
5. **先定位根因再修改**：任何修复必须说明根因，并重新运行对应验证。
6. **不越权**：不购买付费资源、不部署生产环境、不删除重要数据，除非得到明确授权。

## 2. 环境与常用命令

环境：Node.js >= 20，pnpm >= 10（本仓库在 pnpm 11.23 上验证）。

```bash
pnpm install                # 安装依赖
pnpm dev                    # 开发服务器 http://localhost:3000
pnpm build                  # 生产构建（Next.js + Turbopack）
pnpm start                  # 运行生产构建
pnpm lint                   # ESLint（根目录 flat config）
pnpm typecheck              # 所有包类型检查
pnpm test                   # 所有包单元测试

# 单包
pnpm --filter @acs/editor-core test
pnpm --filter @acs/web build
```

提交前必须全部通过：`pnpm lint && pnpm typecheck && pnpm test && pnpm build`。

### pnpm 注意事项

- 依赖构建脚本白名单写在 `pnpm-workspace.yaml` 的 `allowBuilds`（pnpm 11 不再读取 `package.json` 的 `pnpm` 字段）。
- 若新增需要 postinstall 的依赖，必须在 `allowBuilds` 中显式允许，否则安装会以 `ERR_PNPM_IGNORED_BUILDS` 失败。

## 3. 代码规范

- TypeScript 严格模式，`noUncheckedIndexedAccess` 已开启，数组索引访问必须处理 `undefined`。
- **不写注释**，除非逻辑确实无法自解释；优先用清晰的命名与拆分表达意图。
- 默认中文 UI 文案；标识符、类型名、提交信息使用英文。
- 不引入未使用的新依赖；引入前先确认是否已有等价实现。
- 核心业务逻辑放在 `packages/`，保持纯函数、可测试；UI 与副作用放在 `apps/web`。
- 所有跨端共享的数据结构必须定义在 `packages/*-schema`，并在服务端与客户端同时校验。
- 禁止使用 `any`；确需逃生舱时使用 `unknown` + 校验（`@typescript-eslint/no-explicit-any` 会告警）。

## 4. 数据与契约

- 项目数据根结构由 `packages/project-schema` 定义，含 `schemaVersion`。
- 修改项目结构必须：
  1. 递增 `SCHEMA_VERSION`；
  2. 在 `MIGRATIONS` 中提供从旧版本到新版本的迁移函数；
  3. 补充迁移测试（含「版本过新」与「版本缺失」分支）。
- 模板由 `packages/template-schema` 定义并版本化；项目引用固定模板版本，模板升级不得改变已有设计。
- 后端 API 一律 `/api/v1` 前缀，请求与响应结构必须可通过 OpenAPI 校验（见 `docs/api-spec.md`）。

## 5. 测试要求

- 每个新增的纯逻辑模块必须附带单元测试；测试文件与实现同目录，命名 `*.test.ts`。
- 测试必须真实执行并记录结果；环境阻塞时明确写出阻塞原因，不得标记为通过。
- 关键不可回归行为（撤销/重做、图层顺序、项目保存恢复、权限、额度幂等）必须有测试覆盖。
- 测试不得依赖外部网络或真实付费服务；AI 相关测试使用可注入的假 Provider。

## 6. AI 与外部服务

所有外部服务必须通过 `docs/cloud-architecture.md` 定义的 Provider 接口接入，每个 Provider 必须实现：明确的输入输出类型、统一错误格式、超时、有限重试、限流、用量记录、配置检查、可替换实现与自动化测试。

三种状态必须严格区分并显式呈现：**已配置且调用成功** / **未配置** / **开发环境模拟**。模拟结果必须打上显式标记，不得展示为真实 AI 输出。

## 7. 安全

- 上传文件必须校验类型、扩展名、大小与实际内容。
- 所有涉及权限的操作由服务端校验，不信任前端传来的订阅状态、价格或额度。
- 日志必须脱敏，禁止记录密钥、支付敏感数据与不必要的个人内容。
- `.env.example` 只列变量名与用途，不含真实值。

## 8. Git 与提交

- 提交信息使用祈使句，简明描述变更目的（例如 `feat(editor): add layer lock toggle`）。
- 只提交与本次变更相关的文件；不提交 `.env`、构建产物、密钥。
- 未经明确要求，不执行 `commit`、`push`、建 PR。

## 9. Agent 协作

- 主 Agent 先定义数据模型、API 契约与共享类型，再拆分任务。
- 同一核心文件同一时间只允许一个执行者修改。
- 每次交付必须报告：修改文件、执行的命令、真实测试结果、剩余问题与下一步。
- 若工具不支持真正的多 Agent 并行，则由主 Agent 依次执行各角色，不得声称已启动多个 Agent。

## 10. 每阶段收尾

更新 `PROJECT_STATUS.md`：当前阶段、已完成、进行中、已执行测试与真实结果、已知问题、阻塞项、下一步、关键命令。
