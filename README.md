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
- AI 基础管线（**模拟实现，非真实 AI**）：能力/请求/结果/任务/用量/状态合约，Provider 接口与注册表，模拟 Provider（结果一律标注「模拟输出」且成本为 0），任务幂等/重试/超时/限流/并发/取消，用量台账与退款标记，`/api/v1/ai/*` 接口与 `/ai`、`/account` 的真实状态展示
- 本地算法引擎基础（Algorithm Engine V1 / P0）：确定性测试素材（棋盘格/渐变/噪声/透明边框）、稳定的整幅指纹 `hashRaster`、PNG 编解码（测试用）与可重复运行的性能/内存基准（`pnpm bench`）。**P0 只建立测试与度量基础，尚未提供任何图案算法**

**明确尚未实现（不会假装实现）**：

- 真实 AI Provider（图像生成、背景移除、场景贴图）与真实调用验证——没有任何适配器，界面不会显示「已验证」
- 本地图案算法（重复/镜像平铺、无缝纹理、图案排列、密度缩放、颜色变体）与图像处理（裁切、锐化、去噪、透明边缘清理）——均为计划中的 P1/P2，**当前完全不存在**
- 3D 产品设计（`mesh.generate` 能力仅声明，请求返回 `NOT_SUPPORTED`）与真实产品贴图（四点透视/网格形变仅有预研计划）
- 插值放大**不等于**超分辨率；本地算法**不等于** AI 生成，两者在界面与文档中严格区分
- 印刷生产文件与供应商规格对接（阶段 6，当前仅有预检与参考导出）
- 用户认证、云数据库、对象存储、订阅支付（阶段 2 / 7）——当前项目保存在浏览器本地存储，云端 Provider 只有内存假实现

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
pnpm bench        # 本地算法性能与内存基准（@acs/editor-core）
```

## 目录结构

```
apps/
  web/                 Next.js 应用（首页、模板库、项目、编辑器）
packages/
  project-schema/      项目 JSON Schema、工厂函数、版本迁移
  template-schema/     产品模板 Schema
  template-library/    10 个示例产品模板与辅助函数
  editor-core/         纯逻辑：图层操作、历史记录、上传校验、印刷预检、导出像素预算
  cloud-schema/        云端 API 契约：统一响应信封、错误码、项目/资源 DTO
  cloud-core/          云端 Provider 接口、超时/重试/限流/用量保障、内存假实现
  ai-schema/           AI 契约：能力/请求/结果/任务/用量/服务状态与严格校验
  ai-core/             AI Provider 接口与注册表、模拟 Provider、任务服务、用量台账、验证记录
assets/                预留：模板素材、3D 模型、字体
infra/                 本地编排（可选 PostgreSQL）与数据库迁移脚本 infra/sql
docs/                  产品、架构、数据库、API、模板、AI、印刷、安全、云端、测试文档
```

依赖方向：`apps/web` → `packages/*`；`packages/editor-core` → `packages/project-schema`；`packages/template-library` → `project-schema` + `template-schema`；`packages/cloud-schema` → `project-schema`；`packages/cloud-core` → `cloud-schema` + `project-schema`；`packages/ai-schema` → `project-schema` + `cloud-schema`；`packages/ai-core` → `ai-schema` + `cloud-core`。核心逻辑与 UI 分离，所有操作均可单元测试。

## 验证结果（t0.2.0 + Algorithm Engine V1 P0，实际执行）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 单元测试 | `pnpm test` | 265 通过 / 0 失败（28 个测试文件） |
| 类型检查 | `pnpm typecheck` | 通过（9 个项目） |
| 静态检查 | `pnpm lint` | 通过，0 错误 0 警告 |
| 生产构建 | `pnpm build` | 成功，13 条路由（含 3 条 `/api/v1/ai/*`） |
| 运行时冒烟 | `pnpm start` + HTTP 请求 | 9 条页面路由 + 模板 SVG 均返回 200 |
| 浏览器 E2E | `pnpm test:e2e` | 14 通过 / 0 失败（桌面 13 + 移动端 1；真实 Chrome，双服务实例） |
| 算法基准 | `pnpm bench` | 4 个基准场景通过（约 9 秒）；耗时/内存实测见 `docs/algorithm-benchmarks.md` |

详细测试范围见 `docs/testing.md`；算法资产与缺口见 `docs/algorithm-inventory.md`；基准数据见 `docs/algorithm-benchmarks.md`；版本审查报告见 `docs/release-review-t0.1.0.md` 与 `docs/release-review-t0.2.0.md`；云端接入步骤见 `docs/cloud-setup.md`；AI 现状（已实现/未实现）见 `docs/ai-pipeline.md`。

## 重要说明

- 所有产品模板均为**示例模板**，规格未经印刷厂验证，正式商业使用前必须按供应商规格校准。
- 上传图片会被压缩到最长边 2500px 以适配浏览器本地存储；此限制在接入对象存储后解除。
- 项目数据保存在浏览器本地存储，跨设备请使用「导出项目 JSON」；`docs/cloud-setup.md` 说明如何启用云端保存（未配置时界面只显示「本地保存」，不会伪造云端成功）。
- **AI 功能当前只有模拟实现**：未接入任何真实供应商（`AI_MODE` 默认 `off`），模拟结果一律标注「模拟输出」，且不产生任何费用；界面不会显示假的「已验证」状态。详见 `docs/ai-pipeline.md`。
- 本仓库不包含任何真实 API 密钥、支付凭证或用户数据。

## 文档

- `docs/product-requirements.md` 产品需求、用户流程与验收标准
- `docs/architecture.md` 系统架构与模块边界
- `docs/cloud-architecture.md` 云端服务选型、供应商对比、费用模型与迁移风险
- `docs/cloud-setup.md` 云端项目保存的配置、运行模式、Provider 约定与启用步骤
- `docs/database.md` 数据模型与迁移策略
- `docs/api-spec.md` API 契约与错误格式
- `docs/template-format.md` 模板与坐标系规范
- `docs/ai-pipeline.md` AI Provider 合约、任务流程、服务状态判定与「已实现/未实现」现状
- `docs/algorithm-inventory.md` 本地算法资产清单、数据契约、能力边界与测试缺口（P0 审计）
- `docs/algorithm-benchmarks.md` 本地算法性能/内存基准协议、真实实测数据与结论
- `docs/print-export.md` 印刷尺寸、DPI、出血与导出规则
- `docs/security.md` 认证、授权、密钥与隐私策略
- `docs/testing.md` 测试命令、覆盖范围与真实结果
- `docs/release-review-t0.1.0.md` t0.1.0 版本审查报告（架构、已实现/未实现、缺陷与风险）
- `PROJECT_STATUS.md` 当前进度、已知问题与下一步

## 许可证

本项目基于 [MIT 许可证](LICENSE) 开源：可自由使用、修改、分发与商用，仅需保留版权与许可声明。
