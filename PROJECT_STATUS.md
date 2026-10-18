# PROJECT_STATUS

更新时间：2026-10-18
当前版本：v0.1.0（已在私有仓库交付）；开发中分支：`feature/t0.2.0`
当前阶段：**阶段 1（2D MVP）已完成**，阶段 0（工程与架构）已完成；t0.2.0 正在做「审查修复 + 真实浏览器 E2E + 质量补齐」

---

## 1. 阶段进度

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 0 | 工程审查、Monorepo、架构与产品文档、CI 配置、最小可运行应用 | 已完成 |
| 1 | 2D MVP：模板库、上传、图层编辑、撤销重做、项目保存恢复、PNG 导出、移动端适配、自动化测试 | 已完成 |
| 2 | 后端与云端项目（认证、PostgreSQL、对象存储、权限） | 未开始（t0.2.0 主线候选） |
| 3 | AI 图案工具（Provider 接口、生成、背景移除、额度） | 未开始 |
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
- Vitest 单元测试 64 项全部通过（全仓统一 vitest `^5.0.5` / typescript `^5.9.3`）
- Next.js 16 + React 19 + Turbopack 生产构建成功
- 生产构建冒烟测试通过（HTTP 200）
- `pnpm-workspace.yaml` 中 `allowBuilds` 已配置 esbuild、playwright
- GitHub Actions CI：`.github/workflows/ci.yml`（install → lint → typecheck → test → build → Playwright E2E）
- 真实浏览器 E2E：Playwright（桌面 + Pixel 7 视口），生产构建启动，真实鼠标拖动、localStorage 持久化轮询、PNG 解码与像素校验
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

命令与结果均为本机真实执行（2026-10-18 复测）：

| 命令 | 结果 |
| --- | --- |
| `pnpm -r --filter "./packages/**" test` | 48 通过 / 0 失败 |
| `pnpm --filter @acs/web test` | 16 通过 / 0 失败 |
| `pnpm test` | 64 通过 / 0 失败（连续 3 次稳定） |
| `pnpm typecheck` | 全部包通过 |
| `pnpm lint` | 0 错误 0 警告 |
| `pnpm build` | 成功，生成 10 条路由 |
| `pnpm start` + HTTP 冒烟 | 9 条页面路由 + 模板 SVG 全部返回 200 |
| `pnpm test:e2e` | 3 通过 / 0 失败（desktop 2 + mobile 1，真实 Chrome） |

测试文件：

- `packages/project-schema/src/project.test.ts`（8）
- `packages/template-schema/src/template.test.ts`（4）
- `packages/template-library/src/templates.test.ts`（6）
- `packages/editor-core/src/history.test.ts`（5）
- `packages/editor-core/src/operations.test.ts`（13）
- `packages/editor-core/src/uploads.test.ts`（5）
- `packages/editor-core/src/print.test.ts`（7）
- `apps/web/src/lib/project-repo.test.ts`（8）
- `apps/web/src/lib/editor-store.test.ts`（8）

E2E 断言要点：选模板 → 上传 8×8 PNG（落库且画布 1600×680）→ 低分辨率预检提示 → 真实拖动（坐标增大）→ 旋转 15° / 宽 600 → 保存 → reload 后一致 → 导出效果图 PNG（1600×680 且含图案像素）→ 导出印刷 PNG（2363×1004 = 200mm@300dpi）→ 导出 JSON（`schemaVersion=1`）；文字多行不再被裁切；移动端自动适应窗口 + 底部面板可开关。

**尚未执行的测试（不得视为通过）**：

- 移动端真机测试未执行（E2E 仅模拟视口）
- 多浏览器兼容性测试未执行（E2E 目前只跑本机 Chrome）
- 可访问性自动化检查未执行
- AI / 支付 / 权限相关测试（功能尚未实现）

**偶发失败（待定位根因）**：一次将 `pnpm test` 与 E2E 并行执行时 `packages/template-schema` 曾非 0 退出，随后单独与连续 3 次完整运行均通过，未复现。

## 3.1 t0.2.0 进度（分支 `feature/t0.2.0`）

已完成：

- 版本审查：`docs/release-review-t0.1.0.md`（架构、三种状态、缺陷、风险、安全、云接入现状）
- 修复：编辑器打开/移动端不适应窗口（根因：适应逻辑早于动态挂载画布执行，容器尺寸为 0×0）
- 修复：文字图层多行被裁切（根因：Konva 固定 `height` 丢弃溢出文本；改为自动高度并回写模型）
- 修复：同仓 vitest / typescript 版本分裂（`project-schema` 由 vitest 2.x 统一至 5.0.5）
- 新增：Playwright E2E 基础设施与 3 个真实用例，并接入 CI
- 修正：测试文档与 README 中的用例数字（operations 13、print 7、9 个测试文件）

进行中 / 待办：

1. 文本与图层名输入逐字提交历史 → 改为「临时更新 + 失焦提交」
2. 将 Schema 迁移接入 `ProjectRepository.get()` / `importJson()`（当前迁移框架未被调用）
3. 印刷导出增加总像素预算保护（避免移动端 Safari 画布超限）
4. 定位 `pnpm test` 偶发失败根因
5. 扩展 E2E：撤销/重做、图层顺序与显隐、导入导出往返
6. 阶段 2 云端项目保存（见 §6）

## 4. 已知问题与限制

1. 项目数据保存在浏览器本地存储（约 5MB 上限），大图项目可能触发容量错误；已提供明确错误提示与 JSON 导出备份。
2. 上传图片被压缩到最长边 2500px，不适合直接用于高质量印刷源文件；接入对象存储后需解除该限制。
3. 模板规格为公开常规数据，**未经印刷厂验证**，已在 UI 与文档中标注。
4. 编辑器字体仅使用系统字体栈，未内嵌字体文件；文字渲染在不同系统上可能有细微差异。
5. 尚无服务端，因此无多用户权限、无云端同步、无跨设备协作；所有校验都在客户端，可被绕过。
6. `ImageLayer.crop` 字段已在数据结构中定义，但 UI 尚未提供裁切交互（仅数据层就绪）。
7. Schema 版本迁移框架（`packages/project-schema/src/migrations.ts`）代码存在，但尚未接入项目加载与导入路径；Schema 升级前必须接入。
8. 印刷导出像素比上限 4× 为逐轴限制，超大画布在 iOS Safari 上可能超出画布像素上限（未在真机验证）。
9. 属性面板的文本与图层名输入每次按键都提交一条历史，撤销会逐字回退；图层名清空会触发一次校验错误提示。
10. 自动保存防抖 800ms，窗口内刷新会丢失最后一次未落盘编辑。

## 5. 阻塞项

无真实阻塞。所有未完成项均为「尚未开始」，而非「被外部条件卡住」。

## 6. 下一步任务清单

t0.2.0（建议顺序）：

1. 完成 §3.1 的 1–5（历史合并、迁移接线、导出像素预算、偶发失败定位、E2E 扩展）
2. 定义 `AuthProvider` / `ProjectStore` / `ObjectStorage` 接口与可注入假实现（先纯接口，零外部依赖）
3. 在获得授权后接入托管认证与 PostgreSQL，编写迁移脚本与 RLS 策略
4. 实现对象存储预签名直传：`POST /api/v1/assets/upload-url` + `POST /api/v1/assets/complete`
5. 项目 CRUD API（`/api/v1/projects`）与服务端 Schema/权限校验
6. 前端切换到云端项目仓库（保留本地模式作为离线降级，并提供一次性迁移）
7. 集成测试：越权访问、模板版本稳定性、自动保存失败反馈

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

- 仓库（**私有**）：https://github.com/ve766/ai-creative-studio
- 版本标签：`v0.1.0`（指向 `766fb5d`，**未移动、未覆盖**）
- Release（预发布）：https://github.com/ve766/ai-creative-studio/releases/tag/v0.1.0
- 主分支：`main`，首个提交 `766fb5d`
- 可见性已校验：`isPrivate = true`，`visibility = PRIVATE`
- t0.2.0 开发分支：`feature/t0.2.0`（从 `46939e9` 起）
- 版本审查报告：`docs/release-review-t0.1.0.md`

注意事项：

- 本地 `git` 使用 Git Credential Manager 推送（gh CLI 令牌缺少 `workflow` 作用域，若改用 `gh` 推送包含 `.github/workflows/` 的提交会被拒绝；当前 CI 文件已成功推送）
- 正式部署、开通付费服务、生产数据库迁移均需另行授权，本版本未执行任何部署
