# 系统架构

## 1. 总体结构

```
apps/web                     Next.js 16 (App Router) + React 19
  src/app/                   页面路由
  src/components/            展示与交互组件
  src/components/editor/     编辑器（画布、图层面板、属性面板）
  src/lib/                   编辑器状态、项目仓库、导出、图片处理

packages/project-schema      项目 JSON Schema、工厂函数、版本迁移
packages/template-schema     产品模板 Schema
packages/template-library    10 个示例模板与查询/转换函数
packages/editor-core         纯逻辑：图层操作、历史、上传校验、印刷预检

infra/docker                 本地编排（可选，非正式运行必需）
docs/                        产品、架构、数据、API、模板、AI、印刷、安全、测试
```

## 2. 依赖方向

```
apps/web ──▶ template-library ──▶ template-schema ──▶ project-schema
         ──▶ editor-core ────────▶ project-schema
```

规则：

- `packages/*` 不得依赖 `apps/*`
- `project-schema` 为最底层，不依赖其他内部包
- UI 与副作用只在 `apps/web`；可测试的纯逻辑只在 `packages/*`

## 3. 前端渲染与状态

- App Router，页面默认为服务端组件；需要浏览器能力的部分显式标记 `"use client"`
- Konva 画布通过 `next/dynamic({ ssr: false })` 加载，避免服务端缺少 DOM
- 编辑器状态使用 zustand 单例 store：
  - `project`：当前项目（唯一数据源）
  - `history`：`{ past, present, future }` 撤销栈，上限 150
  - `selectedLayerId` / `zoom` / `pan` / `saveState` / `error`
- 所有图层变更都经过 `apply(mutator)`，保证「渲染、保存、撤销、导出」共用同一份数据模型
- 拖动/缩放仅在 `dragend` / `transformend` 提交一次历史，避免污染撤销栈

## 4. 数据流

```
用户操作 → store.apply(mutator) → 新 Project → 重渲染 Konva
                                      └→ 防抖 800ms → ProjectRepository.save() → localStorage
```

导出路径独立：`renderProjectToDataUrl(project)` 使用离屏 Konva Stage 按 1:1 画布坐标渲染，不受编辑器缩放影响。

## 5. 云端目标架构（阶段 2+）

详见 `docs/cloud-architecture.md`。要点：

- 部署：托管平台（Vercel / 同类），Next.js 应用与其 Route Handlers 作为唯一后端入口
- 数据：托管 PostgreSQL，启用行级安全（RLS），服务端二次校验
- 存储：对象存储（R2 / Supabase Storage）客户端预签名直传，数据库只存元数据
- AI：通过 Provider 适配层调用托管 HTTPS API
- 异步：托管任务/工作流服务，前端通过任务 ID 轮询状态
- 零自建：不维护 Linux 服务器、Nginx、GPU 驱动、数据库主机、Kubernetes

## 6. 模块边界与扩展点

| 边界 | 当前实现 | 未来替换 |
| --- | --- | --- |
| 项目持久化 | `ProjectRepository`（localStorage） | 云端 `ProjectRepository`（API 客户端），接口保持一致 |
| 图片资源 | 内联 dataURL | 对象存储引用（`assetId` + 短期授权 URL） |
| 项目结构 | `project-schema` v1 | 递增版本 + 迁移函数 |
| 导出 | 离屏 Konva 渲染 | 增加服务端/Worker 高分辨率渲染管线 |
| AI | 无 | Provider 适配层（见 `docs/ai-pipeline.md`） |

## 7. 关键设计决策

记录于 `docs/decisions/`：

- `0001-monorepo-and-pnpm.md`
- `0002-project-json-schema-versioning.md`
- `0003-cloud-first-no-self-hosted-servers.md`

## 8. 性能与限制

- 画布为归一化工作区坐标（最长边 ≤ 2100px），物理尺寸由 `outputSpec` / `print` 描述，避免超大画布拖慢渲染
- 上传图片在客户端压缩到最长边 2500px 以满足本地存储限制
- 生产构建使用 Turbopack；工作区包通过 `transpilePackages` 直接编译 TS 源码，无需额外构建步骤
