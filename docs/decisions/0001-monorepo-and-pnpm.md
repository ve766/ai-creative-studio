# ADR 0001：Monorepo + pnpm workspace + 源码直引

- 状态：已采纳
- 日期：2026-10-18

## 背景

项目需要同时承载前端编辑器、共享数据 Schema、纯逻辑核心库、以及未来的 API 与 Worker。要求「职责清晰、依赖方向合理、禁止把全部逻辑塞进单个文件」。

## 决策

1. 使用 pnpm workspace 管理 Monorepo：`apps/*` 与 `packages/*`
2. `packages/*` 直接导出 TypeScript 源码（`main` / `exports` 指向 `src/index.ts`），不预先构建
3. Next.js 通过 `transpilePackages` 编译工作区包
4. 每个包自带 `typecheck` 与 `test` 脚本，根目录统一聚合
5. 依赖构建脚本白名单写在 `pnpm-workspace.yaml` 的 `allowBuilds`

## 理由

- 源码直引消除了「先构建包才能跑应用」的循环依赖与陈旧产物问题
- 单测可以直接 import 源码，无需构建步骤，反馈快
- 包边界强制了「核心逻辑不依赖 UI 框架」这一约束

## 后果

- Next.js 构建时需要 `transpilePackages` 列出所有共享包；新增包必须同步更新 `apps/web/next.config.ts`
- 发布到 npm 时需要额外的构建配置（当前不需要，包均为 private）
- pnpm 11 不再读取 `package.json` 的 `pnpm` 字段，配置必须写在 `pnpm-workspace.yaml`；若新增需要 postinstall 的依赖，必须在 `allowBuilds` 中添加，否则安装会以 `ERR_PNPM_IGNORED_BUILDS` 失败（本次已因 esbuild 遇到并修复）

## 备选方案

- 多仓库：跨仓库共享 Schema 需要发布私包，迭代成本高，已否决
- Turborepo/Nx：当前规模不需要额外编排层，先保持简单，确有需要再引入
