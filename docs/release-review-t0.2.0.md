# t0.2.0 版本审查报告

审查日期：2026-10-18
审查分支：`feature/t0.2.0`
基线提交：`8a80452`（`merge: bring main (MIT license, public record) into feature/t0.2.0`）
上一稳定版本：`v0.1.0` → `766fb5d`（标签未移动）
审查方式：读取全部源码 + 在本机真实执行 lint / typecheck / 单元测试 / 生产构建 / 生产服务 HTTP 冒烟 / 真实浏览器 E2E

> 状态标记严格区分：**已实现并验证** / **已实现但未充分验证** / **仅完成部分实现** / **仅有接口或演示** / **尚未实现** / **被环境或权限阻塞**。
> 文档中的历史结论不作为本次依据，下列结果均为本机本次执行。

---

## 1. 当前项目真实状态

| 维度 | 事实 |
| --- | --- |
| 仓库 | https://github.com/ve766/ai-creative-studio（**PUBLIC**，MIT） |
| 分支 | 工作分支 `feature/t0.2.0`；稳定分支 `main`（`e8482e7`） |
| 标签 | `v0.1.0` → `766fb5d`（未移动、未覆盖） |
| 工作区 | 干净（`git status --porcelain` 为空），无 stash，无未提交用户修改 |
| 环境 | Windows 10，Node v22.23.2，pnpm 11.23.0 |
| 技术栈 | Next.js 16.4.2（App Router + Turbopack）、React 19.3.1、Konva 10.9.0 + react-konva 19.3.2、zustand 5、zod 4、Vitest 5、Playwright 1.64.1 |
| 结构 | `apps/web` + `packages/{project-schema,template-schema,template-library,editor-core}` |
| 服务端 | **不存在**。无 `/api` 路由，无数据库客户端，无认证，无外部 HTTP 调用 |
| 配置 | 除 `playwright.config.ts` 外，**没有任何应用代码读取 `process.env`**；`.env.example` 全为空值 |
| 密钥 | 本机全量扫描（3 次提交 / 115 个 git 对象）：**未发现密钥、令牌、私钥** |
| 托管 | 未部署。项目数据仅存于浏览器 `localStorage` |
| 成本 | 0 元（无云资源、无付费接口调用） |

### 本次真实执行的验证

| 命令 | 结果 |
| --- | --- |
| `pnpm lint` | 0 错误 0 警告 |
| `pnpm typecheck` | 5 个项目全部通过 |
| `pnpm test` | 64 通过 / 0 失败（**曾出现 1 次失败后重跑通过，见 P1-1**） |
| `pnpm build` | 成功，10 条路由 |
| `pnpm start` + HTTP 冒烟 | 9 条页面路由 + 模板 SVG 全部 200 |
| `pnpm test:e2e` | 3 通过 / 0 失败（desktop 2 + mobile 1，真实 Chrome） |

---

## 2. 可运行的功能（已实现并验证）

- 模板库：10 个示例模板、分类筛选、按模板创建项目（E2E 已验证进入编辑器）
- Konva 2D 编辑器：上传图片（真实落库且 `naturalWidth=8` 断言通过）、添加文字、选择/移动/缩放/旋转/删除/复制、图层顺序与显隐锁定、透明度
- 撤销 / 重做（按钮与 Ctrl+Z / Ctrl+Y）、历史上限 150
- 自动保存（800ms 防抖）+ 手动保存 + Ctrl+S + 状态徽标（E2E 断言 `data-state="saved"`）
- 刷新后从 localStorage 恢复项目（E2E 断言 reload 后位置/旋转/宽度一致）
- PNG 效果图导出（E2E 解码得 1600×680 且含上传图案像素）
- 印刷参考 PNG 导出（E2E 解码得 2363×1004 = 200mm@300dpi 等比换算）
- 导出项目 JSON（E2E 断言 `schemaVersion = 1`）
- 导出前预检：空设计、低分辨率、超出安全区
- 移动端布局：进入自动适应窗口（缩放 < 100%）、底部面板开关、可上传
- 文字图层自动增高（E2E 断言高度 ≥ 2 行）

---

## 3. 尚未完成的功能

| 功能 | 状态 |
| --- | --- |
| 云端项目保存（认证 / 数据库 / 对象存储 / 权限） | **尚未实现**（本版本目标） |
| AI 图案生成、背景移除、图像编辑、真实场景贴图 | **尚未实现**（仅路线图页面） |
| 3D 产品设计 | **尚未实现**（仅页面占位） |
| 印刷生产文件（PDF/SVG、供应商规格、色彩管理） | **尚未实现**（仅预检 + 参考 PNG） |
| 订阅与支付 | **尚未实现**（`PAYMENT_CONFIGURED = false`，按钮禁用） |
| 图片裁切交互 | **仅完成部分实现**（数据结构与渲染就绪，无 UI） |
| 账号体系 / 多用户 | **尚未实现** |
| 移动端真机、多浏览器、可访问性、性能基准 | **被环境或权限阻塞**（无设备/无工具，见 P3） |

---

## 4. 已发现的问题（按优先级）

### P0 — 数据安全与正确性（本版本必须修）

**P0-1 项目 Schema 迁移机制未接入任何真实路径（"代码存在但未接线"）**

- 证据：`packages/project-schema/src/migrations.ts` 提供 `migrateProject` / `tryMigrateProject` 与 `MISSING_VERSION` / `VERSION_TOO_NEW` / `MISSING_MIGRATION` / `VALIDATION_FAILED` 四类错误；但 `apps/web/src/lib/project-repo.ts:75`（`get`）、`:134`（`importJson`）、`:67`（`list`）全部直接调用 `ProjectSchema.safeParse`，`tryMigrateProject` 在 `apps/web` 内**零引用**。
- 后果：一旦 `SCHEMA_VERSION` 升级，`get()` 对旧版本项目返回 `null` → 编辑器显示「找不到该项目」，用户会以为项目丢失；`importJson()` 只给出一串 zod 原始报错；`list()` 静默跳过该记录。未来版本（version 高于当前）项目也会被判为"损坏"。
- 依据：任务书第三阶段任务 A「不支持的未来版本应给出清晰错误，不得静默破坏数据」。

**P0-2 文本与图层名输入逐字写入历史，撤销逐字回退**

- 证据：`PropertyPanel.tsx:138`（图层名 `onChange`）与 `:179`（文本域 `onChange`）每次按键都调用 `onUpdateLayer`；`editor-store.ts:200` → `apply()` → `history.commit()`；`history.ts:23` 用 `Object.is` 判断，而 `opUpdate` 每次返回新对象，因此每次按键都成为一条独立历史。
- 后果：输入 20 个字符 = 20 步撤销；Ctrl+Z 逐字回退而非撤销整次编辑；`layer.name` 被清空时 `name: z.string().min(1)` 校验失败，`apply()` 捕获后写入 `error`，界面弹出错误横幅。
- 依据：任务书第三阶段任务 B「避免每个键盘输入字符都生成一个独立的历史记录」。

**P0-3 印刷导出无总像素预算，移动端可能直接失败**

- 证据：`export.ts:13` `MAX_PRINT_SCALE = 4` 仅按单轴限制；`computePixelRatio` 不检查 `outputW × outputH`；`renderProjectToDataUrl` 直接 `stage.toDataURL({ pixelRatio })`，无像素总量校验、无异常兜底提示。
- 量化：工作区画布最长边可达 2100px（`app-config.ts`），若印刷规格为 A2（420mm@300dpi，目标宽 4961px），比例 2.36 → 4961×4961 ≈ 2460 万像素，已超 iOS Safari 约 1670 万像素的画布上限，可能得到空白图或直接抛错。
- 依据：任务书第三阶段任务 C「防止超大画布造成浏览器卡死、内存耗尽或导出失败；不能静默生成尺寸错误的图片」。

### P1 — 稳健性与可维护性

**P1-1 单元测试偶发失败，根因未定位**

- 观察：本会话共出现 2 次 `pnpm test` 非 0 退出（`packages/template-schema` 报 `Failed`），随后单独重跑与连续 5 次完整重跑全部通过；未捕获到失败正文。第 2 次发生在 `pnpm install` 之后的首轮运行。
- 影响：CI 可能随机变红；当前**不能**声称测试稳定通过。
- 处置：本版本记录为已知问题，增加失败日志留存，不谎报为通过。

**P1-2 图片上传未校验文件真实内容特征（魔术字节）**

- 证据：`uploads.ts` 校验扩展名/类型/大小/像素总量，`image.ts` 依赖 `<img>` 解码成功作为内容校验。扩展名与 MIME 均可伪造；解码成功但内容非图片的情况已被挡住，但"声明为 png 实际为 jpeg"这类不一致不会被发现。
- 影响：低。仅影响元数据准确性，不影响安全边界（无服务端）。

**P1-3 自动保存窗口内刷新可能丢失最后一次编辑**

- 证据：`EditorWorkspace.tsx:100` 防抖 800ms；窗口内刷新会丢失未落盘改动。
- 影响：低（用户可见但有明确提示）。本版本不改为同步写入，避免性能与存储抖动。

**P1-4 `usedBytes()` 统计不完整**

- 证据：`project-repo.ts:149` 只统计 `acs.projects.v1`，不含 `acs.project-order.v1`。显示值偏小。

**P1-5 无 `Content-Security-Policy` 等安全响应头**

- 当前无服务端，局限在本地运行；接入托管后必须补齐。已记录在 `docs/security.md`。

### P2 — 产品完整度

- P2-1 `ImageLayer.crop` 有数据与渲染支持但无任何 UI 入口（功能不可达）。
- P2-2 模板规格未经印刷厂验证（已在 UI/文档标注，属于已知业务限制）。
- P2-3 字体仅系统字体栈，跨系统渲染存在差异。
- P2-4 项目列表选中图层时移动端会自动打开右侧面板，交互略突兀。

### P3 — 环境与工具（非代码缺陷）

- P3-1 无移动端真机、无 iOS Safari，P0-3 的像素上限只能按公开资料估算，**无法在本机验证**。
- P3-2 E2E 仅运行本机 Chrome，无 Firefox/WebKit。
- P3-3 未引入可访问性自动化（axe）。
- P3-4 无性能基准。

---

## 5. 本次开发范围（t0.2.0）

**纳入范围**

1. 修复 P0-1 / P0-2 / P0-3，并补齐对应单元测试与 E2E 断言。
2. 云端项目保存的**可测试基础**：Provider 接口、可注入假实现、数据库迁移 SQL 与 RLS 策略、配置校验、本地集成测试；界面明确区分「本地保存」与「云端保存」。
3. 在**无凭据**前提下完成 `docs/cloud-setup.md`（真实接入所需配置、控制台操作、验证步骤）。
4. AI / 3D / 印刷的架构预留：接口 + 配置校验 + 效果图/可编辑项目/生产文件三态区分说明。
5. 更新 `PROJECT_STATUS.md`、`README.md`、`docs/testing.md`，并输出 `docs/cloud-setup.md`。
6. Windows 开发体验核对（跨平台脚本、路径、`.env.example`、常见错误排查）。

**明确不纳入范围**

- 任何付费服务开通、账号注册、生产部署。
- 真实 AI 调用、真实云端读写（无凭据，不得伪造）。
- 完整 3D 编辑器、PDF/SVG 生产文件生成。
- 删除或重写任何已可用模块；不更换技术栈；不升级无关依赖。

---

## 6. 需要用户决定的事项

1. **云端服务商与区域**：建议 Supabase（Auth + PostgreSQL + Storage）或 Cloudflare R2（对象存储）。需你创建项目并提供 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`（仅服务端）。在你授权前我不会注册或开通任何服务。
2. **许可证与闭源商业化**：仓库当前为 **MIT** 且已公开。MIT 允许他人在遵守条件的前提下继续使用、修改、分发甚至商业利用已获取的代码；将仓库改回私有**不会**自动收回已授予的权利。许可证选择、版权归属与商业化方案需要你决定；如有法律疑问请咨询专业律师，我不给出确定性法律结论。
3. **仓库可见性**：当前 PUBLIC。是否在开发期结束后改回私有，需要你明确指示；我不会自行修改。
4. **是否授权推送**：本版本所有提交默认只保留在本地 `feature/t0.2.0` 分支，未经你明确授权不执行 `git push`。
5. **移动端真机验证**：P0-3 的实际上限需要 iOS 真机确认。是否需要提供测试步骤由你在设备上执行。
