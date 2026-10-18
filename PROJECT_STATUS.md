# PROJECT_STATUS

更新时间：2026-10-18
当前版本：v0.1.0
当前阶段：**阶段 1（2D MVP）已完成**，阶段 0（工程与架构）已完成

---

## 1. 阶段进度

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 0 | 工程审查、Monorepo、架构与产品文档、CI 配置、最小可运行应用 | 已完成 |
| 1 | 2D MVP：模板库、上传、图层编辑、撤销重做、项目保存恢复、PNG 导出、移动端适配、自动化测试 | 已完成 |
| 2 | 后端与云端项目（认证、PostgreSQL、对象存储、权限） | 未开始 |
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
- Vitest 单元测试 64 项全部通过
- Next.js 16 + React 19 + Turbopack 生产构建成功
- 生产构建冒烟测试通过（HTTP 200）
- `pnpm-workspace.yaml` 中 `allowBuilds` 已配置 esbuild
- GitHub Actions CI：`.github/workflows/ci.yml`（install → lint → typecheck → test → build）
- 本地可选服务：`infra/docker/docker-compose.yml`（仅本地 PostgreSQL，正式运行不依赖）
- 文档齐全：产品需求、架构、云架构、数据库、API 规范、模板格式、AI 流水线、印刷输出、安全、测试、3 份 ADR

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

命令与结果均为本机真实执行：

| 命令 | 结果 |
| --- | --- |
| `pnpm -r --filter "./packages/**" test` | 48 通过 / 0 失败 |
| `pnpm --filter @acs/web test` | 16 通过 / 0 失败 |
| `pnpm test` | 64 通过 / 0 失败 |
| `pnpm typecheck` | 全部包通过 |
| `pnpm lint` | 0 错误 0 警告 |
| `pnpm build` | 成功，生成 10 条路由 |
| `pnpm start` + HTTP 冒烟 | 全部返回 200 |

测试文件：

- `packages/project-schema/src/project.test.ts`（8）
- `packages/template-schema/src/template.test.ts`（4）
- `packages/template-library/src/templates.test.ts`（6）
- `packages/editor-core/src/history.test.ts`（5）
- `packages/editor-core/src/operations.test.ts`（14）
- `packages/editor-core/src/uploads.test.ts`（5）
- `packages/editor-core/src/print.test.ts`（6）
- `apps/web/src/lib/project-repo.test.ts`（8）
- `apps/web/src/lib/editor-store.test.ts`（8）

**尚未执行的测试（不得视为通过）**：

- 浏览器端 E2E（Playwright）尚未编写
- 移动端真机测试未执行
- 多浏览器兼容性测试未执行
- AI / 支付 / 权限相关测试（功能尚未实现）

## 4. 已知问题与限制

1. 项目数据保存在浏览器本地存储（约 5MB 上限），大图项目可能触发容量错误；已提供明确错误提示与 JSON 导出备份。
2. 上传图片被压缩到最长边 2500px，不适合直接用于高质量印刷源文件；接入对象存储后需解除该限制。
3. 模板规格为公开常规数据，**未经印刷厂验证**，已在 UI 与文档中标注。
4. 编辑器字体仅使用系统字体栈，未内嵌字体文件；文字渲染在不同系统上可能有细微差异。
5. 尚无服务端，因此无多用户权限、无云端同步、无跨设备协作。
6. `ImageLayer.crop` 字段已在数据结构中定义，但 UI 尚未提供裁切交互（仅数据层就绪）。

## 5. 阻塞项

无真实阻塞。所有未完成项均为「尚未开始」，而非「被外部条件卡住」。

## 6. 下一步任务清单

阶段 2（建议顺序）：

1. 定义 `AuthenticationProvider` / `ObjectStorageProvider` 接口与适配器骨架
2. 接入托管认证与 PostgreSQL，编写迁移脚本与 RLS 策略
3. 实现对象存储预签名直传：`POST /api/v1/assets/upload-url` + `POST /api/v1/assets/complete`
4. 项目 CRUD API（`/api/v1/projects`）与权限校验
5. 前端切换到云端项目仓库（保留本地模式作为降级）
6. 集成测试：越权访问、模板版本稳定性、自动保存失败反馈

## 7. 关键命令

```bash
pnpm install
pnpm dev
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm --filter @acs/editor-core test
pnpm --filter @acs/web build
```

## 8. 本次新增依赖与成本

- 依赖：`next`、`react`、`react-dom`、`konva`、`react-konva`、`zustand`、`zod`、`vitest`、`typescript`、`eslint`、`typescript-eslint`、`@eslint/js`
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

注意事项：

- 本地 `git` 使用 Git Credential Manager 推送（gh CLI 令牌缺少 `workflow` 作用域，若改用 `gh` 推送包含 `.github/workflows/` 的提交会被拒绝；当前 CI 文件已成功推送）
- 正式部署、开通付费服务、生产数据库迁移均需另行授权，本版本未执行任何部署
