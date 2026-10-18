# AI 文创设计工坊 (AI Creative Studio)

> 把图案、文字与照片准确放到真实文创产品上，完成设计、预览、保存与导出。
> 云端优先（Cloud-first）、API 优先（API-first）、零自建服务器。

当前版本：**v0.1.0**（阶段 1 已完成：2D 模板贴图 MVP）

---

## 这个版本真实能做什么

已完成并**经过自动化测试与真实构建验证**：

- 首页 / 产品模板库 / 我的项目 / 订阅 / 账号页面，所有按钮都执行真实动作
- 10 个产品模板（马克杯、帆布袋、T 恤、手机壳、笔记本、海报、鼠标垫、抱枕、水杯、贴纸），带模板 ID、版本、画布坐标系、可编辑区域、安全区、出血区、输出规格
- 2D 编辑器（Konva）：
  - 上传 PNG/JPEG/WebP（含类型、大小、尺寸校验）
  - 添加文字图层
  - 选择、移动、缩放、旋转、删除、复制图层
  - 图层顺序调整（上移/下移/置顶/置底）、显示与锁定、透明度
  - 撤销 / 重做（历史上限 150）
  - 自动保存（防抖）+ 手动保存，保存状态可见
  - 画布缩放、平移、适应窗口；鼠标滚轮缩放；移动端双指缩放
  - 模板参考线（可编辑区域 / 安全区 / 出血区）
  - PNG 效果图导出 + 印刷参考 PNG 导出（明确不放大低分辨率图片以伪造细节）
  - 键盘快捷键：Ctrl+Z / Ctrl+Y / Ctrl+S / Delete / 方向键微调 / 空格临时平移
  - 移动端窄屏布局与底部面板切换
- 项目 JSON：统一的 Schema、版本号与迁移机制；导入 / 导出 / 复制 / 删除
- 导出前预检：低分辨率、空设计、超出安全区

**明确尚未实现（不会假装实现）**：

- AI 图案生成、背景移除（阶段 3）——未配置密钥，页面明确显示「未配置」
- 真实场景 AI 贴图（阶段 4）
- 3D 产品设计（阶段 5）
- 印刷生产文件与供应商规格对接（阶段 6，当前仅有预检与参考导出）
- 用户认证、云数据库、对象存储、订阅支付（阶段 2 / 7）——当前项目保存在浏览器本地存储

## 快速开始

环境要求：Node.js >= 20、pnpm >= 10。

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

常用命令：

```bash
pnpm dev          # 启动开发服务器
pnpm build        # 生产构建
pnpm start        # 运行生产构建
pnpm typecheck    # 全部包的 TypeScript 检查
pnpm lint         # ESLint
pnpm test         # 全部单元测试
pnpm test:e2e     # 生产构建 + 真实浏览器 E2E（Playwright，需本机 Chrome 或已安装 chromium）
```

## 目录结构

```
apps/
  web/                 Next.js 应用（首页、模板库、项目、编辑器）
packages/
  project-schema/      项目 JSON Schema、工厂函数、版本迁移
  template-schema/     产品模板 Schema
  template-library/    10 个示例产品模板与辅助函数
  editor-core/         纯逻辑：图层操作、历史记录、上传校验、印刷预检
assets/                预留：模板素材、3D 模型、字体
infra/                 预留：本地编排与部署配置
docs/                  产品、架构、数据库、API、模板、AI、印刷、安全、测试文档
```

依赖方向：`apps/web` → `packages/*`；`packages/editor-core` → `packages/project-schema`；`packages/template-library` → `project-schema` + `template-schema`。核心逻辑与 UI 分离，所有操作均可单元测试。

## 验证结果（v0.1.0 实际执行）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 单元测试 | `pnpm test` | 64 通过 / 0 失败（9 个测试文件） |
| 类型检查 | `pnpm typecheck` | 通过（4 个包 + web） |
| 静态检查 | `pnpm lint` | 通过，0 错误 0 警告 |
| 生产构建 | `pnpm build` | 成功，10 条路由 |
| 运行时冒烟 | `pnpm start` + HTTP 请求 | 9 条页面路由 + 模板 SVG 均返回 200 |
| 浏览器 E2E | `pnpm test:e2e` | 3 通过 / 0 失败（桌面 2 + 移动端 1；真实 Chrome） |

详细测试范围见 `docs/testing.md`；版本审查报告见 `docs/release-review-t0.1.0.md`。

## 重要说明

- 所有产品模板均为**示例模板**，规格未经印刷厂验证，正式商业使用前必须按供应商规格校准。
- 上传图片会被压缩到最长边 2500px 以适配浏览器本地存储；此限制在接入对象存储后解除。
- 项目数据保存在浏览器本地存储，跨设备请使用「导出项目 JSON」。
- 本仓库不包含任何真实 API 密钥、支付凭证或用户数据。

## 文档

- `docs/product-requirements.md` 产品需求、用户流程与验收标准
- `docs/architecture.md` 系统架构与模块边界
- `docs/cloud-architecture.md` 云端服务选型、供应商对比、费用模型与迁移风险
- `docs/database.md` 数据模型与迁移策略
- `docs/api-spec.md` API 契约与错误格式
- `docs/template-format.md` 模板与坐标系规范
- `docs/ai-pipeline.md` AI Provider、任务流程与失败处理
- `docs/print-export.md` 印刷尺寸、DPI、出血与导出规则
- `docs/security.md` 认证、授权、密钥与隐私策略
- `docs/testing.md` 测试命令、覆盖范围与真实结果
- `docs/release-review-t0.1.0.md` t0.1.0 版本审查报告（架构、已实现/未实现、缺陷与风险）
- `PROJECT_STATUS.md` 当前进度、已知问题与下一步
