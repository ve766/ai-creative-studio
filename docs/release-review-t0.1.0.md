# t0.1.0 版本审查报告

审查日期：2026-10-18
审查对象：Git tag `v0.1.0`（提交 `766fb5d`）+ 交付文档提交 `46939e9`
审查方式：阅读全部源码 + 真实执行 lint / typecheck / 单元测试 / 生产构建 / 生产服务 HTTP 冒烟 + 新增真实浏览器 E2E
审查分支：`feature/t0.2.0`（`v0.1.0` 标签未移动，未被覆盖）

> 本报告严格区分三种状态：
> **代码存在** = 文件里有实现；**功能可运行** = 在本机真实启动并可操作；**已通过测试** = 有自动化测试真实执行并记录结果。
> 没有实际验证过的内容一律标注为「未验证」，不标注为通过。

---

## 1. 技术架构（实际代码）

```
F:\ai贴图工作台
├─ apps/web                      Next.js 16.4.2 App Router + React 19.3.1（Turbopack 构建）
│  ├─ src/app/                   9 个页面路由（无 /api 路由）
│  ├─ src/components/            AppShell、TemplateGallery、ProjectList、editor/*
│  ├─ src/lib/                   app-config、editor-store(zustand)、project-repo、export、image、plans
│  ├─ e2e/                        本次新增：Playwright 真实浏览器测试
│  └─ public/templates/*.svg     10 个手绘矢量预览图
├─ packages/project-schema/      项目 JSON Schema + 工厂 + 版本迁移（zod 4）
├─ packages/template-schema/     产品模板 Schema（zod 4）
├─ packages/template-library/    10 个示例模板 + 查询/校验/规格转换
├─ packages/editor-core/         纯逻辑：history / operations / uploads / print
├─ infra/                        仅本地可选 docker-compose（PostgreSQL）
├─ docs/                         产品、架构、云架构、数据库、API、模板、AI、印刷、安全、测试、ADR
└─ .github/workflows/ci.yml      CI：install → lint → typecheck → test → build → e2e
```

关键架构特征（均已确认存在于代码中）：

- **工作区源码直引**：每个包的 `main`/`exports` 指向 `src/index.ts`，Next 通过 `transpilePackages` 编译（`apps/web/next.config.ts:5`）。
- **依赖方向**：`apps/web` → 全部包；`editor-core` → `project-schema`；`template-library` → `template-schema` + `project-schema`。
- **数据全部在浏览器本地**：`localStorage` 的 `acs.projects.v1` / `acs.project-order.v1`。
- **零服务端**：没有任何应用代码读取 `process.env`（本次审查实测：`process.env` 仅出现在新增的 `playwright.config.ts`），没有数据库客户端、没有 `fetch()` 调用、没有 AI/支付 SDK。`.env.example` 中列出的变量目前没有任何代码读取。
- **样式**：手写 CSS 设计系统（`globals.css`），未使用 Tailwind。

---

## 2. 核心闭环三种状态总览

| # | 核心能力 | 代码存在 | 功能可运行 | 已通过测试 |
| --- | --- | --- | --- | --- |
| 1 | 打开软件并进入设计工作区 | 是 | 是（HTTP 200 + E2E 进入编辑器） | 是（E2E desktop + mobile） |
| 2 | 选择产品模板 | 是 | 是（10 个模板，分类筛选） | 是（E2E 通过模板卡创建项目） |
| 3 | 上传图案 | 是 | 是 | 是（E2E 上传 8×8 PNG 并落库） |
| 4 | 调整位置 / 大小 / 旋转 | 是 | 是 | 是（E2E 真实鼠标拖动 + 属性面板改宽/旋转） |
| 5 | 保存与重新载入项目 | 是 | 是（自动保存 + 手动保存 + 重新打开） | 是（E2E 保存 → reload → 数值一致） |
| 6 | 导出 PNG 效果图 | 是 | 是 | 是（E2E 解码 PNG，校验尺寸与像素内容） |
| 7 | PC 与移动端操作体验 | 是 | 是 | 是（E2E Pixel 7 视口：自动适应、底部面板、上传） |
| 8 | 核心功能自动化测试 | 是 | — | 部分（单元 64 项 + E2E 3 项；无移动端真机、无多浏览器） |

结论：**v0.1.0 的 2D 核心闭环真实可用**，且从本次起有真实浏览器自动化证据。此前 README 中「核心能力」的表述与代码一致，未发现夸大。

---

## 3. 已实现功能与代码位置

| 功能 | 代码位置 | 状态 |
| --- | --- | --- |
| 项目 Schema（图层/画布/印刷规格） | `packages/project-schema/src/{project,layers}.ts` | 可运行 + 已测 |
| 项目工厂（id/时间戳/默认值） | `packages/project-schema/src/factory.ts` | 可运行 + 已测 |
| Schema 版本迁移框架 | `packages/project-schema/src/migrations.ts` | **代码存在但从未被调用**（见 §7-5） |
| 模板 Schema | `packages/template-schema/src/index.ts` | 可运行 + 已测 |
| 10 个示例模板 | `packages/template-library/src/templates.ts` | 可运行 + 已测（全部 `verified:false`/`example:true`） |
| 撤销/重做（上限 150） | `packages/editor-core/src/history.ts` + `apps/web/src/lib/editor-store.ts:25` | 可运行 + 已测 |
| 图层操作（增删改排/显隐/锁定/居中/适应） | `packages/editor-core/src/operations.ts` | 可运行 + 已测 |
| 上传校验与等比适配 | `packages/editor-core/src/uploads.ts` | 可运行 + 已测 |
| 印刷换算与预检 | `packages/editor-core/src/print.ts` | 可运行 + 已测 |
| 本地项目仓库（增删改查/导入导出/配额） | `apps/web/src/lib/project-repo.ts` | 可运行 + 已测 |
| 编辑器状态与自动保存 | `apps/web/src/lib/editor-store.ts`、`EditorWorkspace.tsx:97` | 可运行 + E2E |
| Konva 画布（缩放/平移/变换/参考线） | `apps/web/src/components/editor/EditorCanvas.tsx` | 可运行 + E2E |
| 图层/属性面板 | `LayerPanel.tsx`、`PropertyPanel.tsx` | 可运行 + E2E（部分） |
| 图片预处理（最长边 2500px 降采样） | `apps/web/src/lib/image.ts` | 可运行（未单测，依赖 DOM） |
| 离屏导出（效果图 / 印刷参考） | `apps/web/src/lib/export.ts` | 可运行 + E2E（校验输出尺寸与像素） |
| 未配置状态的诚实呈现 | `FeaturePlan.tsx`、`plans.ts`、`/ai`、`/pricing` | 可运行（AI/支付按钮禁用或关闭） |

---

## 4. 实际运行验证记录（本次真实执行）

| 验证 | 命令 | 结果 |
| --- | --- | --- |
| 工作区状态 | `git status` | 干净，`main` 与 `origin/main` 同步 |
| 标签完整性 | `git rev-list -n1 v0.1.0` | `766fb5d...`，标签未移动 |
| 静态检查 | `pnpm lint` | 0 错误 0 警告（exit 0） |
| 类型检查 | `pnpm typecheck` | 5 个项目全部 Done |
| 单元测试 | `pnpm test` | 64 通过 / 0 失败（连续 3 次稳定通过） |
| 生产构建 | `pnpm build` | 成功，10 条路由 |
| 生产冒烟 | `next start -p 3200` + HTTP | `/` `/templates` `/projects` `/ai` `/scene` `/studio-3d` `/pricing` `/account` `/editor/test-project` 及模板 SVG **全部 200** |
| 浏览器 E2E（桌面） | `pnpm --filter @acs/web test:e2e -- --project=desktop` | 2 通过：核心闭环、文字自动增高 |
| 浏览器 E2E（移动） | 同上 `--project=mobile` | 1 通过：Pixel 7 自动适应 + 面板切换 + 上传 |
| 密钥扫描 | 正则扫描 sk-/AIza/ghp_/AKIA/PRIVATE KEY/JWT | 未发现任何密钥或凭证 |
| 外部调用扫描 | 扫描 supabase/@aws-sdk/openai/stripe/redis/pg/fetch( | 无任何外部服务调用 |

E2E 具体断言（真实执行的证据链）：

- 从 `/templates` 点击「标准马克杯 → 开始设计」，URL 进入 `/editor/prj_*`，Konva 画布可见。
- 上传 8×8 PNG：图层数量变为 1；持久化后 `naturalWidth = 8`、画布 `1600×680`。
- 预检：出现 `notice-danger`「原始宽度仅 8px」（真实命中低分辨率规则）。
- 真实鼠标拖动图层中心 (+80, +60) 画布坐标 → 持久化的 `x`、`y` 均增大。
- 属性面板改「旋转° = 15」「宽 = 600」→ 持久化值一致。
- 保存 → 徽标 `data-state="saved"` → `reload()` → 图层仍在且旋转/宽度/位置一致。
- 导出效果图 PNG：解码得 **1600×680**，且存在 >1000 个与上传图案同色（±24）的像素 → 证明图层真的渲染进导出。
- 导出印刷参考 PNG：解码得 **2363×1004** = `ceil(200mm/25.4*300dpi)` × 等比高度 → 证明 DPI 换算端到端正确。
- 导出项目 JSON：`schemaVersion = 1`，1 个图层。
- 移动端（Pixel 7，412×915）：进入编辑器后缩放自动适应（< 100%），底部「图层 / 工具」「属性 / 导出」面板可开关，上传后图层列表正确。

---

## 5. 尚未实现（代码即不存在，非「未接线」）

- **服务端**：无 `/api` 目录、无认证、无数据库、无对象存储、无额度系统。
- **AI**：无任何 Provider 实现，`/ai` 页面明确显示未配置。
- **真实场景贴图**（`/scene`）、**3D 设计**（`/studio-3d`）：仅路线图页面。
- **支付订阅**：`PAYMENT_CONFIGURED = false`，全部按钮禁用。
- **印刷生产文件**：无 PDF/SVG 导出、无供应商规格、无色彩管理。
- **图片裁切交互**：`ImageLayer.crop` 字段存在于数据模型与渲染/导出路径，但没有任何 UI 可设置它。
- **云端项目保存**：完全未开始（t0.2.0 的首要方向）。

---

## 6. 构建与测试结果

```
pnpm lint       ->  0 errors / 0 warnings
pnpm typecheck  ->  5 个项目全部通过
pnpm test       ->  64 passed / 0 failed（连续 3 次稳定）
pnpm build      ->  成功，10 条路由
HTTP 冒烟       ->  10 条路径全部 200
E2E             ->  3 passed / 0 failed（真实 Chrome，桌面 + Pixel 7）
```

单元测试分布（审查实测，修正了 v0.1.0 文档中的两处数字）：

| 包 | 文件 | 用例 |
| --- | --- | --- |
| project-schema | `project.test.ts` | 8 |
| template-schema | `template.test.ts` | 4 |
| template-library | `templates.test.ts` | 6 |
| editor-core | `history.test.ts` / `operations.test.ts` / `uploads.test.ts` / `print.test.ts` | 5 / **13** / 5 / **7** |
| apps/web | `project-repo.test.ts` / `editor-store.test.ts` | 8 / 8 |
| 合计 | 9 个测试文件 | **64** |

> v0.1.0 的 `docs/testing.md` 把 operations 写为 14、print 写为 6（合计仍为 64），本次已修正。

**未执行的验证（不得视为通过）**

- 移动端真机（iOS Safari / Android Chrome）未测试。
- 多浏览器（Firefox / WebKit）未测试；E2E 目前只跑本机 Chrome。
- 可访问性自动化（axe 等）未引入。
- 性能基准（大画布、多图层、大图）未建立。
- 真实浏览器 E2E 仅覆盖本报告 §4 列出的路径。

**一次观察到的偶发失败（诚实记录）**：在把单元测试与 E2E 并行执行的某一次中，`packages/template-schema` 的 vitest 曾以非 0 退出；随后单独运行与连续 3 次完整运行均通过，未能复现。结论：疑似并发资源竞争导致的偶发失败，**尚未定位根因**，已列入待办（见 §7-未修复-10）。

---

## 7. 已知 Bug 与风险

### 本次已修复（均有真实复现与验证）

1. **编辑器打开时不适应窗口（移动端尤其严重）** — 根因：`EditorWorkspace.tsx` 的适应逻辑只在 `status` 变为 `ready` 时执行一次，而画布是 `next/dynamic` 延迟挂载，执行时容器尺寸仍为 0×0，适应被跳过且永不重试。移动端打开后停在 100% 缩放，1600px 宽的画布几乎完全看不到。
   - 证据：E2E 移动用例在修复前失败（`Expected: < 100, Received: 100`），修复后通过。
   - 修复：改为「视口尺寸首次可用时适应一次」，用 `fittedRef` 保证每个项目只适应一次（不干扰用户后续缩放）。

2. **文字图层多行内容被裁切** — 根因：Konva `Text` 设置固定 `height` 时会**丢弃**放不下的行（`konva/lib/shapes/Text.js:624`），而 `createTextLayer` 默认 `height = fontSize * 1.4`，渲染与导出都传了该高度；用户一旦换行或输入较长文字，第二行起直接消失，且模型里的高度也不反映真实内容。
   - 证据：E2E 文字用例修复前失败（模型高度 156.8 < 2 行所需 224），修复后通过。
   - 修复：文本节点改为自动高度，把 Konva 实测高度回写到项目（阈值 0.5px 防抖动）；导出同样不再传固定高度；文本变换只缩放宽度。

3. **同一 monorepo 内 vitest 大版本分裂** — `packages/project-schema` 使用 `vitest ^2.1.8` / `typescript ^5.7.2`，其余包为 `vitest ^5.0.5` / `typescript ^5.9.3`（实测该包跑的是 vitest 2.1.9）。已统一到 `^5.0.5` / `^5.9.3`，安装后 5 个包实测均为 vitest v5.0.5。

4. **文档与实测不符** — `docs/testing.md`、`README.md` 的用例数字、`PROJECT_STATUS.md` 的阶段细节已同步修正。

### 未修复（按风险排序）

1. **Schema 迁移机制未被接入（中风险，未来数据兼容性）** — `migrations.ts` 提供了 `migrateProject` / `tryMigrateProject` 与四种错误码，但 `ProjectRepository.get()`（`project-repo.ts:75`）与 `importJson()`（`project-repo.ts:134`）都直接走 `ProjectSchema.safeParse`。后果：一旦 `SCHEMA_VERSION` 升级，旧项目会显示「找不到项目」或被拒绝导入，而不会迁移；将来的 v2 版本也没有可用的升级路径。
2. **文本/名称输入每次按键都提交一条历史（中风险，UX）** — `PropertyPanel` 的图层名输入与文本域每次 `onChange` 都调用 `updateLayer`，而 `editor-store.apply()` 每次都 `commit` 历史。后果：输入 20 个字等于 20 步撤销，Ctrl+Z 变成逐字回退；把图层名清空还会触发一次校验错误横幅。
3. **印刷导出在移动端 Safari 有失败风险（中风险，未验证）** — 像素比上限 4× 是逐轴限制：2100px 画布 ×4 = 8400px，面积 7056 万像素，超出 iOS Safari 约 1670 万像素的画布上限，可能导出空白或抛错。无 iOS 设备，未验证。
4. **大图与本地存储配额（已知限制）** — 上传图片降采样到最长边 2500px 并以 data URL 存入 localStorage（约 5MB 上限）。超出时抛出 `StorageQuotaError` 并有明确提示，但不能作为高质量印刷源文件。
5. **自动保存窗口内刷新会丢最后一次编辑（低风险）** — 防抖 800ms，窗口内 reload 会丢失未落盘改动。
6. **图片裁切无 UI（低风险）** — 数据与渲染已支持 `crop`，但没有交互入口，`crop` 永远为 `null`。
7. **存储占用统计不完整（低风险）** — `usedBytes()` 只统计 `acs.projects.v1`，未含 `acs.project-order.v1`，显示值偏小。
8. **属性面板数字输入需失焦或回车才提交（低风险，UX）** — 输入后直接点画布，值仍会提交（onBlur），但输入过程中画布不更新。
9. **无 CSP / 无安全响应头（低风险，当前无服务端）** — 尚无 `Content-Security-Policy` 等头；接入服务端时需补齐。
10. **单元测试偶发失败未定位（低风险，待观察）** — 见 §6 结尾。

### 安全评估

- **密钥**：仓库与代码中**未发现任何密钥**；`.env.example` 仅列变量名与用途，且目前没有任何代码读取这些变量。
- **数据外泄面**：没有服务端、没有外部请求，用户图片不会离开浏览器。
- **输入校验**：导入的项目 JSON 一律经 zod 严格校验（拒绝未知字段），损坏数据在 `list()` 中被安全跳过。
- **已知不可靠点**：所有校验都在客户端，可被绕过；这在无服务端时不可避免，已在 `docs/security.md` 明确记录，阶段 2 必须由服务端重新校验。
- **依赖**：`pnpm install` 通过仓库的 supply-chain policy 校验（305 条目）；仅 `esbuild` 与 `playwright` 允许构建脚本，其余构建脚本一律不执行。

---

## 8. 云端托管与 API 接入现状

| 项目 | 现状 |
| --- | --- |
| 托管部署 | **未部署**。本地运行，`next start` 已验证可生产运行（Vercel 等托管平台可直接适配） |
| 认证 | 未接入。无账号体系，`/account` 只说明本地模式 |
| 数据库 | 未接入。`docs/database.md` 为设计文档；`infra/docker/docker-compose.yml` 仅提供本地 PostgreSQL（未启动过、未验证） |
| 对象存储 | 未接入。图片以 data URL 存在浏览器 |
| AI API | 未接入。无 Provider 实现、无密钥、无调用 |
| 支付 | 未接入。`PAYMENT_CONFIGURED = false`，按钮禁用 |
| HTTP API | **不存在**。无 `/api` 路由；`docs/api-spec.md` 是待实现契约 |
| 已产生费用 | **0 元**。未创建任何云资源、未调用任何付费接口 |

需要凭据才能接入的服务（当前全部不需要，且不影响本地开发与测试）：
Supabase（托管认证 + PostgreSQL + Storage 或 Cloudflare R2）、AI Provider（文生图 / 背景移除）、支付服务商。
在没有这些配置时，应用仍可完整开发与测试：本地模式 + 单元测试 + Playwright E2E 全部可运行，AI/支付/云项目相关入口保持「未配置」状态。

---

## 9. 下一版本（t0.2.0）开发建议

**P0 — 修复与补测（本次已完成一部分）**

- [x] 修复移动端/首次打开不适应窗口
- [x] 修复文字图层多行裁切
- [x] 统一 vitest / typescript 版本
- [x] 建立真实浏览器 E2E 并接入 CI
- [ ] 修复文本/名称输入逐字提交历史（`PropertyPanel` + `editor-store` 需要「临时更新 + 失焦时提交历史」通道）
- [ ] 把 Schema 迁移接入 `get()` / `importJson()`，并为「版本过新」「版本缺失」补 E2E 或单元测试
- [ ] 为印刷导出加「总像素预算」保护（避免移动端 Safari 画布超限）
- [ ] 建立 `pnpm test` 偶发失败的排查（记录失败日志、确认是否与并发进程数有关）
- [ ] 修正文档中仍不精确的表述，并保持 `PROJECT_STATUS.md` 每阶段更新

**P1 — 云端项目保存（t0.2.0 主线，需先授权与配置）**

1. 定义 `AuthProvider` / `ProjectStore` / `ObjectStorage` 接口（放在 `packages/*`，纯接口 + 可注入假实现）
2. 接入托管认证与 PostgreSQL，编写迁移脚本与 RLS 策略
3. 对象存储预签名直传（`POST /api/v1/assets/upload-url` → 客户端直传 → `POST /api/v1/assets/complete`）
4. 项目 CRUD API（`/api/v1/projects`）并在服务端重新校验 Schema 与权限
5. 前端切换到云端仓库，**保留本地模式作为离线降级**，并做一次性迁移（本地项目 → 云端）
6. 集成测试：越权访问、模板版本稳定性、保存失败提示、离线切换

**P2 — 体验与质量**

- 图片裁切 UI（数据层已就绪）
- 多浏览器（Firefox / WebKit）与真机回归
- 可访问性检查（键盘可达、对比度、aria）
- 性能基准：多图层、大画布、拖动帧率

---

## 10. 需要项目所有者亲自完成的事项

| 事项 | 说明 | 费用 |
| --- | --- | --- |
| 无需任何操作即可继续 | 本地开发、单元测试、E2E 均可直接运行 | 0 |
| 授权部署（可选） | 若要上线预览环境，需要授权我连接托管平台（如 Vercel）；当前**未部署** | 免费额度内可为 0 |
| 阶段 2 凭据（未来） | 托管数据库/认证/存储项目与密钥：需你创建并只在托管平台的服务端环境变量中配置 | 免费额度内可为 0 |
| AI Provider（阶段 3） | 选择供应商与密钥；**未授权前我不会接入任何付费 API** | 视供应商，按量计费 |
| 支付通道（阶段 7） | 商户资质、币种、退款与 webhook 能力确认 | 交易手续费 |
| 移动端真机测试 | iOS Safari 的印刷导出上限问题需要真机验证 | 0 |

---

## 11. 版本保护记录

- `v0.1.0` 标签：**未移动、未覆盖、未删除**（指向 `766fb5d`）。
- 未创建任何新的正式 Release。
- 本次工作全部在 `feature/t0.2.0` 分支进行，`main` 未被改写。
- 审查开始前工作区干净（`git status` 无未提交修改），因此不存在需要保护的用户本地修改。
