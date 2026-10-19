# PROJECT_STATUS

更新时间：2026-10-19
当前版本：v0.1.0（已在 **PUBLIC / MIT** 仓库交付）；开发中分支：`feature/t0.2.0`
当前阶段：**阶段 1（2D MVP）已完成**，阶段 0（工程与架构）已完成；t0.2.0 的「审查修复 + 阶段 3（迁移接线 / 历史合并 / 导出预算 / E2E 回归）+ 阶段 4（云端基础：接口、假实现、配置三态、SQL、文档）+ 阶段 5（AI 基础：合约、Provider 接口、模拟 Provider、任务与用量、状态接口）」已完成，下一步为真实云端/AI 供应商接入（需用户决策与授权）

---

## 1. 阶段进度

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 0 | 工程审查、Monorepo、架构与产品文档、CI 配置、最小可运行应用 | 已完成 |
| 1 | 2D MVP：模板库、上传、图层编辑、撤销重做、项目保存恢复、PNG 导出、移动端适配、自动化测试 | 已完成 |
| 2 | 后端与云端项目（认证、PostgreSQL、对象存储、权限） | 部分：Provider 接口/假实现/配置三态/API 契约/SQL 迁移已就绪；**未接入真实云**（无凭据，SQL 未执行） |
| 3 | AI 图案工具（Provider 接口、生成、背景移除、额度） | 部分：能力/请求/结果/任务/用量合约、Provider 接口、模拟 Provider、任务服务（幂等/重试/超时/限流/并发）、用量台账、状态接口与 UI 已实现并测试；**未接入真实供应商**（无适配器、无凭据、无真实调用） |
| 4 | 真实场景贴图 | 未开始 |
| 5 | 3D 产品设计 | 未开始 |
| 6 | 印刷生产文件 | 部分（预检与参考导出已实现，供应商规格未对接） |
| 7 | 订阅与商业化 | 未开始（页面与配置骨架已就绪） |
| 8 | 上线准备 | 未开始 |

## 2. 本版本已完成

### 工程

- pnpm Monorepo：`apps/web` + 4 个 `packages/*`，依赖方向清晰
- TypeScript 严格模式（含 `noUncheckedIndexedAccess`）全仓通过
- ESLint 9 flat config 全仓通过
- Vitest 单元测试 245 项全部通过（全仓统一 vitest `^5.0.5` / typescript `^5.9.3`）
- Next.js 16 + React 19 + Turbopack 生产构建成功
- 生产构建冒烟测试通过（HTTP 200）
- `pnpm-workspace.yaml` 中 `allowBuilds` 已配置 esbuild、playwright
- GitHub Actions CI：`.github/workflows/ci.yml`（install → lint → typecheck → test → build → Playwright E2E）
- 真实浏览器 E2E：Playwright（桌面 + Pixel 7 视口），生产构建启动，真实鼠标拖动、localStorage 持久化轮询、PNG 解码与像素校验；AI 相关用例通过第二个 `AI_MODE=mock` 服务实例做真实 HTTP 验证
- 云端基础（t0.2.0 阶段 4）：新增 `@acs/cloud-schema`（API 信封/错误码/DTO）与 `@acs/cloud-core`（Provider 接口、运行时保障、内存假实现）；`GET /api/v1/status` 如实返回三态；`infra/sql` 迁移与 RLS 脚本；`docs/cloud-setup.md`
- AI 基础（t0.2.0 阶段 5）：新增 `@acs/ai-schema`（能力/请求/结果/任务/用量/状态合约，严格拒绝供应商特有字段）与 `@acs/ai-core`（`AiProvider` 接口、注册表、模拟 Provider、验证记录、用量台账、任务服务）；`/api/v1/ai/status`、`POST /api/v1/ai/jobs`、`GET /api/v1/ai/jobs/{id}`；`/ai` 与 `/account` 显示真实 AI 状态（未配置 / 开发模拟 / 已配置未验证 / 已验证 / 不可用）
- 本地可选服务：`infra/docker/docker-compose.yml`（仅本地 PostgreSQL，正式运行不依赖）
- 文档齐全：产品需求、架构、云架构、数据库、API 规范、模板格式、AI 流水线、印刷输出、安全、测试、版本审查报告、3 份 ADR

### 数据契约

- `@acs/project-schema`：项目 / 画布 / 图层（图片、文字）/ 印刷规格 Schema；创建与校验工厂函数；`schemaVersion` 检测与迁移框架；缺失版本、版本过新、校验失败的错误分支均有测试
- `@acs/template-schema`：模板 Schema（类别、画布、可编辑区域、安全区、出血、遮挡/纹理/光照叠加层、3D 配置、输出规格）
- `@acs/template-library`：10 个示例模板 + 校验、查询、印刷规格转换、按模板创建项目

### 编辑器（apps/web）

- 首页、模板库（含分类筛选）、我的项目（打开/复制/导出 JSON/导入/删除）、订阅、账号页面
- Konva 2D 编辑器：上传图片、添加文字、选择/移动/缩放/旋转、图层顺序、显示与锁定、透明度、复制、删除
- 撤销 / 重做（上限 150 步），拖动与缩放仅在结束时提交一次历史
- 自动保存（800ms 防抖）+ 手动保存 + 保存状态提示 + Ctrl+S
- 画布缩放 / 平移 / 适应窗口；滚轮缩放；移动端双指缩放与底部面板
- 模板参考线：可编辑区域、安全区、出血区
- PNG 效果图导出（画布原始分辨率）
- 印刷参考 PNG 导出（按目标 DPI 计算，上限 4 倍，明确不伪造细节）
- 导出前预检：空设计、低分辨率、超出安全区；结果在属性面板中展示
- 上传校验：类型、扩展名、大小、像素总量；超限图片自动压缩至最长边 2500px 并显式提示

## 3. 已执行的测试与真实结果

命令与结果均为本机真实执行（2026-10-19 复测）：

| 命令 | 结果 |
| --- | --- |
| `pnpm -r --filter "./packages/**" test` | 182 通过 / 0 失败 |
| `pnpm --filter @acs/web test` | 63 通过 / 0 失败 |
| `pnpm test` | 245 通过 / 0 失败（26 个文件） |
| `pnpm typecheck` | 9 个项目全部通过 |
| `pnpm lint` | 0 错误 0 警告 |
| `pnpm build` | 成功，生成 13 条路由（新增 3 条 `/api/v1/ai/*`） |
| `pnpm start` + HTTP 冒烟 | 9 条页面路由 + 模板 SVG 全部返回 200 |
| `pnpm test:e2e` | 14 通过 / 0 失败（desktop 13 + mobile 1，真实 Chrome，双服务实例） |

测试文件：

- `packages/project-schema/src/project.test.ts`（12）
- `packages/template-schema/src/template.test.ts`（4）
- `packages/template-library/src/templates.test.ts`（6）
- `packages/editor-core/src/history.test.ts`（5）
- `packages/editor-core/src/operations.test.ts`（13）
- `packages/editor-core/src/uploads.test.ts`（5）
- `packages/editor-core/src/print.test.ts`（7）
- `packages/editor-core/src/export-budget.test.ts`（8）
- `packages/cloud-schema/src/api.test.ts`（6）
- `packages/cloud-schema/src/records.test.ts`（8）
- `packages/cloud-core/src/runtime.test.ts`（14）
- `packages/cloud-core/src/fakes.test.ts`（16）
- `packages/ai-schema/src/capabilities.test.ts`（8）
- `packages/ai-schema/src/jobs.test.ts`（10）
- `packages/ai-schema/src/status.test.ts`（7）
- `packages/ai-core/src/mock-provider.test.ts`（9）
- `packages/ai-core/src/registry.test.ts`（6）
- `packages/ai-core/src/ledger.test.ts`（5）
- `packages/ai-core/src/verification.test.ts`（5）
- `packages/ai-core/src/jobs.test.ts`（17）
- `packages/ai-core/src/status.test.ts`（8）
- `apps/web/src/lib/project-repo.test.ts`（15）
- `apps/web/src/lib/editor-store.test.ts`（13）
- `apps/web/src/lib/cloud/config.test.ts`（12）
- `apps/web/src/lib/ai/config.test.ts`（12）
- `apps/web/src/lib/ai/routes.test.ts`（11）

E2E 断言要点：选模板 → 上传 8×8 PNG（落库且画布 1600×680）→ 低分辨率预检提示 → 真实拖动（坐标增大）→ 旋转 15° / 宽 600 → 保存 → reload 后一致 → 导出效果图 PNG（1600×680 且含图案像素）→ 导出印刷 PNG（2363×1004 = 200mm@300dpi）→ 导出 JSON（`schemaVersion=1`）；文字多行不再被裁切；连续输入一次 Ctrl+Z 回到输入前文本且可重做；图层下移改变叠放顺序、隐藏状态落库；JSON 导出后可重新导入且几何一致；非项目 JSON 与损坏 PNG 被拒绝且不产生图层；移动端自动适应窗口 + 底部面板可开关。

**尚未执行的测试（不得视为通过）**：

- 移动端真机测试未执行（E2E 仅模拟视口）
- 多浏览器兼容性测试未执行（E2E 目前只跑本机 Chrome；CI 上的 Chromium 尚未真实运行）
- 可访问性自动化检查未执行
- **真实 AI Provider 调用未执行**（本阶段没有实现任何真实适配器，也未产生任何费用）；AI 合约与可靠性由模拟 Provider 的用例覆盖
- AI 接口的鉴权 / 项目所有权 / 额度扣减未实现也无法测试（项目尚无认证基础设施）
- 支付 / 权限相关测试（功能尚未实现）
- 云端存储 Provider 真实数据库与对象存储未测；`infra/sql/*.sql` 未在真实 Postgres 执行

**偶发失败（待定位根因）**：一次将 `pnpm test` 与 E2E 并行执行时 `packages/template-schema` 曾非 0 退出，随后单独与连续 5 次完整运行均通过，未复现。

**已定位并修复的「时间依赖测试」**：`packages/ai-core/src/verification.test.ts` 中 3 个用例未向 `toSummary()` 传入 `now`，而验证记录默认按真实时钟判断 24 小时有效期，跨过窗口后必然失败（2026-10-19 复现）。根因是测试依赖墙钟而非逻辑缺陷；修复为显式注入固定时间，并约定「与时间有关的断言必须注入固定时间」。

**已定位的「假失败」**：直接运行 `pnpm --filter @acs/web test:e2e` 时，`webServer` 复用旧 `.next` 生产构建，导致 3 个用例按旧代码失败。结论：E2E 必须用 `pnpm test:e2e`（先构建）。这不是产品缺陷。

## 3.1 t0.2.0 进度（分支 `feature/t0.2.0`）

已完成：

- 版本审查：`docs/release-review-t0.1.0.md`、`docs/release-review-t0.2.0.md`（架构、三种状态、缺陷、风险、安全、云接入现状、P0/P1 清单）
- 修复：编辑器打开/移动端不适应窗口（根因：适应逻辑早于动态挂载画布执行，容器尺寸为 0×0）
- 修复：文字图层多行被裁切（根因：Konva 固定 `height` 丢弃溢出文本；改为自动高度并回写模型）
- 修复：同仓 vitest / typescript 版本分裂（`project-schema` 由 vitest 2.x 统一至 5.0.5）
- 新增：Playwright E2E 基础设施与 7 个真实用例，并接入 CI（CI 上的 E2E 步骤尚未真实跑过）
- 修正：测试文档与 README 中的用例数字
- 阶段 3A（迁移接线）：`applyMigrationChain()` 抽离；`ProjectRepository` 新增 `load()` / `listUnreadable()`，`list()` / `get()` / `importJson()` 全部走迁移；加载失败区分 `MISSING` / `INVALID` / `FUTURE_VERSION`，未来版本项目拒绝加载且**不覆盖原始数据**；编辑器错误页按原因给出中文提示
- 阶段 3B（历史合并）：`replacePresent()` + 编辑器 `editSession` / `applyTransient()` / `commitHistory()`；文本内容、文字颜色改为「输入期间合并为一步、失焦结束会话」，图层名改为本地草稿 + 失焦提交（顺带消除清空名称时的校验报错）
- 阶段 3C（导出像素预算）：新增 `packages/editor-core/src/export-budget.ts` 的 `planExport()`（默认 1600 万像素 / 单边 8192px / 印刷倍率上限 4×）；`renderProjectToDataUrl()` 返回真实尺寸与 `capped`/`warning`，`toDataURL` 失败时给出明确中文错误；属性面板显示印刷导出实际像素、超限警告，超限时禁用按钮
- 阶段 3D（E2E 回归）：新增 `apps/web/e2e/regression.desktop.spec.ts` 4 个用例（撤销/重做合并、图层顺序与可见性、JSON 往返、非法输入拒绝）
- 阶段 4（云端基础，接口优先、零外部依赖）：
  - `@acs/cloud-schema`：统一成功/失败信封、11 个错误码与 HTTP 映射、可重试错误码、项目记录/摘要（含 design.id / ownerId / layerCount 一致性约束）、上传与资源 DTO、云端状态结构
  - `@acs/cloud-core`：`ProviderError` 统一错误、`callProvider`（默认 15s 超时 + 3 次有限重试 + 指数退避上限 2s）、`RateLimiter` 令牌桶、`UsageRecorder` 用量记录、`describeProviderConfig` 配置检查；`AuthProvider` / `ProjectStore` / `ObjectStorageProvider` 接口；内存假实现（越权一律 `NOT_FOUND`、乐观并发 `CONFLICT`、预签名上传幂等）
  - `apps/web`：`src/lib/cloud/config.ts` 三态解析（`local` / `mock` / `cloud`，生产环境禁止 mock，缺凭据时回退 local 并说明缺少的**变量名**）；`GET /api/v1/status`；`/account` 与 `/projects` 显示真实存储状态卡片
  - `infra/sql/0001_init.sql`、`0002_rls.sql`（11 张业务表启用 RLS）与验证说明 `infra/sql/README.md`
  - `docs/cloud-setup.md`：环境变量用途、启用步骤、Provider 约定、错误映射、安全与成本
  - 真实 HTTP 验证四种配置组合（见 `docs/testing.md` §4.2），未配置时接口从不返回 `cloud`
- 阶段 5（AI 基础：合约、模拟实现、可靠性、诚实状态）：
  - `@acs/ai-schema`：6 个能力声明（5 个已实现、`mesh.generate` 仅声明）、按能力的**严格**请求 Schema（拒绝供应商特有字段）、统一结果引用类型（内联/存储键/远程 URL）、6 个任务状态与终态判定、预估成本与实际成本**分离**（实际成本必须带来源）、用量记录（含退款）、任务记录与对外快照、服务状态（`not-configured` / `simulated` / `unverified` / `verified` / `unavailable`）及其强制约束
  - `@acs/ai-core`：`AiProvider` 统一接口与注册表（优先真实、生产环境隐藏模拟、未实现能力 `NOT_SUPPORTED`）；模拟 Provider（确定性 SVG 占位图并标注「模拟输出」，始终 `simulated: true`，预估成本 0、实际成本为空，支持故障注入与取消）；验证记录（**只有真实调用成功才写入 `verifiedAt`**，模拟成功永不写入，超 24h 过期）；用量台账（按 `taskId` 幂等，重试不重复计费，失败/取消/超时退款标记，汇总标注成本均为模拟）；任务服务（幂等键、限流、并发上限、60s 超时、有限重试、取消、历史上限）
  - `apps/web`：`src/lib/ai/config.ts` 环境解析（`AI_MODE` 默认 `off`，生产禁止 `mock`，只返回缺失**变量名**，错误文本掩码密钥）；运行时单例；`GET /api/v1/ai/status`、`POST /api/v1/ai/jobs`（模拟响应带 `x-acs-simulated` 与「不是真实 AI 输出」提示）、`GET /api/v1/ai/jobs/{id}`（仅本人可见）；`/ai` 与 `/account` 展示五态状态卡片；`/ai`、`/account`、`/projects` 改为按请求渲染（避免状态在构建时被固化）
  - 真实 HTTP 验证（E2E 第二实例，`AI_MODE=mock`）：模拟任务成功、结果标记、幂等去重、越权 404、非法参数 422、未启用 503，均为真实请求
  - `docs/ai-pipeline.md` 重写为「已实现 / 未实现」的现状说明

进行中 / 待办：

1. 真实云端接入（需用户选择供应商并提供凭据）+ 在真实 Postgres 执行 `infra/sql` 并用两个账号验证 RLS
2. 真实 AI Provider 适配器与首次真实调用验证（需用户选择供应商并提供凭据；在此之前界面始终保持「未配置」）
3. AI 接口鉴权 / 项目所有权 / 额度扣减（依赖阶段 2 账号体系）
4. 阶段 6 3D / 印刷扩展（仅落地可真实验证部分）
5. 定位 `pnpm test` 偶发失败根因
6. 上传内容魔数校验（当前只校验扩展名/类型/大小，未校验真实内容）
7. `usedBytes()` 只统计项目 JSON，未统计其它键；自动保存 800ms 窗口内刷新仍可能丢最后一次编辑

## 4. 已知问题与限制

1. 项目数据保存在浏览器本地存储（约 5MB 上限），大图项目可能触发容量错误；已提供明确错误提示与 JSON 导出备份。
2. 上传图片被压缩到最长边 2500px，不适合直接用于高质量印刷源文件；接入对象存储后需解除该限制。
3. 模板规格为公开常规数据，**未经印刷厂验证**，已在 UI 与文档中标注。
4. 编辑器字体仅使用系统字体栈，未内嵌字体文件；文字渲染在不同系统上可能有细微差异。
5. 尚无服务端，因此无多用户权限、无云端同步、无跨设备协作；所有校验都在客户端，可被绕过。
6. `ImageLayer.crop` 字段已在数据结构中定义，但 UI 尚未提供裁切交互（仅数据层就绪）。
7. 上传文件只按扩展名/MIME/大小校验，未校验真实内容（魔数）；已列入 t0.2.0 待办。
8. 印刷导出的像素预算为本机 `toDataURL` 与公开像素上限数值推算，未在 iOS 真机上验证；超限时已改为明确拒绝并提示，而非静默缩小。
9. 自动保存防抖 800ms，窗口内刷新会丢失最后一次未落盘编辑。
10. 编辑器 UI 语言为中文，暂未提供英文界面。
11. **云端尚未接通**：Provider 只有内存假实现；`infra/sql` 迁移与 RLS 脚本未在真实 Postgres 执行（本机无 Docker / psql）；未获得供应商选择与凭据，因此没有真实登录、云端同步或多设备能力。
12. `CLOUD_MODE=mock` 仅在开发环境可用，且数据只存在进程内存；生产环境会被强制降级为本地保存并给出告警。
13. **AI 尚未接通**：没有任何真实供应商适配器（`LIVE_ADAPTER_REGISTERED=false`），因此即使配置了 AI 密钥，`AI_MODE=live` 也只会报告「未配置」，界面**永远不会**显示「已验证」。
14. `AI_MODE=mock` 的结果是确定性 SVG 占位图，只用于打通流程，明确标注为模拟；不得当作真实 AI 输出使用。
15. AI 任务、用量台账与验证记录都在**进程内存**中，服务重启即丢失；任务队列的数据库持久化取决于尚未执行的 `infra/sql`。
16. AI 接口**没有鉴权与额度校验**（请求头 `x-acs-client-id` 仅用于任务隔离，可被伪造），因此仅在非生产环境模拟模式下开放。
17. AI 任务超时固定 60s，且没有 HTTP 取消接口（服务层已支持取消并有测试）。
18. `mesh.generate`（3D 生成）只有能力声明，请求会返回 `NOT_SUPPORTED`。

## 5. 阻塞项

1. **真实数据库验证被环境阻塞**：本机没有 Docker 与 `psql`，`infra/sql/*.sql` 无法执行；需要本地 Postgres 或托管数据库测试实例。
2. **真实云端接入需用户决策与授权**：供应商选择、账号创建、凭据配置、费用开通均不由本仓库自行决定。
3. **真实 AI 接入需用户决策与授权**：需要选择图像生成 / 抠图 / 场景贴图的供应商并提供凭据；在此之前不写适配器、不做真实调用（避免产生费用）。

其余未完成项均为「尚未开始」，不是被外部条件卡住。

## 6. 下一步任务清单

t0.2.0（建议顺序）：

1. ~~完成 §3.1 的 1–5（历史合并、迁移接线、导出像素预算、偶发失败定位、E2E 扩展）~~（除「偶发失败定位」外均已完成）
2. ~~定义 `AuthProvider` / `ProjectStore` / `ObjectStorage` 接口与可注入假实现（先纯接口，零外部依赖）~~（已完成）
3. ~~编写 PostgreSQL 迁移脚本与 RLS 策略~~（已编写，**未执行**）
4. 在真实 Postgres 上执行迁移、用两个账号验证 RLS（需要数据库环境）
5. 实现真实 `ProjectStore`（Postgres）与登录态解析，替换内存假实现；接入 `/api/v1/projects` CRUD
6. 实现对象存储预签名直传（`/api/v1/assets/upload-url` + `/complete`），真实接入需用户提供凭据
7. 前端在 `storage: "cloud"` 时切换云端仓库，保留本地模式作为离线降级与一次性迁移
8. 集成测试：越权访问、模板版本稳定性、自动保存失败反馈、并发冲突提示
9. ~~阶段 5 AI Provider（同套运行时保障 + 用量记录 + 假实现测试）~~（合约、模拟实现、任务服务、用量台账、状态接口已完成；**真实适配器待用户授权后进行**）
10. 真实 AI Provider 适配器 + 首次真实调用验证记录（需供应商与凭据）
11. AI 接口鉴权与额度扣减（依赖阶段 2 账号体系）
12. 阶段 6 3D/印刷扩展；阶段 8 文档与交付报告

## 7. 关键命令

```bash
pnpm install
pnpm dev
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:e2e
pnpm --filter @acs/editor-core test
pnpm --filter @acs/web build
```

## 8. 本次新增依赖与成本

- 依赖：`next`、`react`、`react-dom`、`konva`、`react-konva`、`zustand`、`zod`、`vitest`、`typescript`、`eslint`、`typescript-eslint`、`@eslint/js`；t0.2.0 新增 `@playwright/test`（开发依赖）
- 运行成本：**0**。当前无任何付费外部服务，无云资源，无部署。

## 9. 交付记录（v0.1.0）

- 仓库（**已开源，PUBLIC**）：https://github.com/ve766/ai-creative-studio
- 许可证：**MIT**（`LICENSE`，GitHub 已识别 `licenseInfo.key = mit`）
- 开源前的安全检查：3 次提交、115 个 git 对象全量扫描，未发现密钥/令牌；`.env.example` 全为空值；历史中无本地路径或用户名
- 公开后可见信息：提交作者 `廖涂 <ltu957403@gmail.com>`、`main` 分支、`v0.1.0` 预发布标签与全部历史
- 版本标签：`v0.1.0`（指向 `766fb5d`，**未移动、未覆盖**）
- Release（预发布）：https://github.com/ve766/ai-creative-studio/releases/tag/v0.1.0
- 主分支：`main`，首个提交 `766fb5d`，开源许可提交 `5dd28fa`
- 开发分支：`feature/t0.2.0`（从 `46939e9` 起，含缺陷修复、浏览器 E2E 与版本审查报告）
- 审查报告：`docs/release-review-t0.1.0.md`、`docs/release-review-t0.2.0.md`

注意事项：

- 本地 `git` 使用 Git Credential Manager 推送（gh CLI 令牌缺少 `workflow` 作用域，若改用 `gh` 推送包含 `.github/workflows/` 的提交会被拒绝；当前 CI 文件已成功推送）
- 正式部署、开通付费服务、生产数据库迁移均需另行授权，本版本未执行任何部署
