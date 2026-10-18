# 测试说明与结果

## 1. 命令

```bash
pnpm test                 # 全部单元测试（所有包）
pnpm typecheck            # 全部包 TypeScript 检查
pnpm lint                 # ESLint
pnpm build                # 生产构建
pnpm test:e2e             # 生产构建 + 真实浏览器 E2E（Playwright）

# 单包
pnpm --filter @acs/editor-core test
pnpm --filter @acs/web test
pnpm --filter @acs/web test:e2e -- --project=desktop
```

## 2. 技术选型

- 单元测试框架：Vitest 5（`node` 环境）
- 浏览器测试：`@playwright/test`（真实 Chrome，见 §4.1）
- 测试文件与实现同目录，命名 `*.test.ts`；E2E 放在 `apps/web/e2e/`，命名 `*.desktop.spec.ts` / `*.mobile.spec.ts`
- 测试不访问外部网络，不依赖真实付费服务
- 全仓统一 vitest `^5.0.5` / typescript `^5.9.3`（此前 `project-schema` 停留在 vitest 2.x，已统一）

> 说明：Vitest 配置文件名使用 `vitest.config.mts`，以避免 Vite 的 native config loader 在 CommonJS 下解析 ESM 语法的告警。

## 3. 当前覆盖（t0.2.0）

| 测试文件 | 用例数 | 覆盖内容 |
| --- | --- | --- |
| `packages/project-schema/src/project.test.ts` | 12 | 工厂函数、Schema 校验、摘要、版本检测、迁移（缺失版本 / 版本过新 / 正常往返）、迁移链（顺序执行 / 同级无操作 / 缺失迁移 / 不改动输入） |
| `packages/template-schema/src/template.test.ts` | 4 | 模板 Schema 合法性、未知类别拒绝、非法尺寸拒绝、类别集合 |
| `packages/template-library/src/templates.test.ts` | 6 | 模板数量与类别覆盖、ID 唯一与结构校验、示例模板标记、按类别/ID 查询、输出规格转换、按模板创建项目 |
| `packages/editor-core/src/history.test.ts` | 5 | 撤销/重做、新提交清空重做栈、相同状态忽略、历史上限 |
| `packages/editor-core/src/operations.test.ts` | 13 | 添加/删除/更新图层、非法补丁拒绝、复制、上移下移置顶置底、显式重排、显示与锁定、透明度钳制、居中、适应、边界钳制、重命名 |
| `packages/editor-core/src/uploads.test.ts` | 5 | 空文件/超限/不支持类型/扩展名不匹配拒绝、尺寸校验、等比缩放 |
| `packages/editor-core/src/print.test.ts` | 7 | mm↔px 换算、所需像素、低分辨率判定、安全区判定、空设计报告、报告含分辨率发现 |
| `packages/editor-core/src/export-budget.test.ts` | 8 | 效果图按画布原始像素导出、印刷按目标 DPI、印刷倍率上限、像素预算截断并给出理由、自定义上限、预算不足时拒绝（不静默缩小）、非法画布、缺少目标尺寸时回退 |
| `apps/web/src/lib/project-repo.test.ts` | 15 | 创建/读取、损坏数据兜底、保存、排序、复制删除、导入导出、非法导入拒绝、配额错误包装、迁移后加载、`FUTURE_VERSION`（未来版本）拒绝且不覆盖原始数据、`listUnreadable`、导入未来版本与非法 JSON 提示 |
| `apps/web/src/lib/editor-store.test.ts` | 13 | 加载、添加图层与脏标记、撤销重做、删除后选中态、缩放钳制、适应视口居中、选择器、错误上报、连续输入合并为单步撤销、提交后新操作另起一步、普通操作结束合并会话、撤销结束合并会话、合并期间的编辑清空重做栈 |

合计：**88 个用例，10 个测试文件**。

## 4. 实际执行结果（t0.2.0，2026-10-18）

```
pnpm test       ->  88 passed / 0 failed
pnpm typecheck  ->  5 个项目全部通过
pnpm lint       ->  0 errors / 0 warnings
pnpm build      ->  成功，10 条路由
pnpm test:e2e   ->  7 passed / 0 failed（desktop 6 + mobile 1）
```

构建产物路由：

```
/  /_not-found  /account  /ai  /editor/[projectId]  /pricing
/projects  /scene  /studio-3d  /templates
```

运行时冒烟（`pnpm start` 后发起 HTTP 请求，2026-10-18 复测）：

| 路径 | 结果 |
| --- | --- |
| `/` | 200 |
| `/templates` | 200 |
| `/projects` | 200 |
| `/ai` | 200 |
| `/scene` | 200 |
| `/studio-3d` | 200 |
| `/pricing` | 200 |
| `/account` | 200 |
| `/editor/test-project` | 200 |
| `/templates/mug-standard.svg` | 200 |

## 4.1 浏览器 E2E（Playwright）

- 配置：`apps/web/playwright.config.ts`，端口 3100，`webServer` 使用生产构建（`next start`）
- 默认使用本机 Chrome（`channel: "chrome"`）；CI 使用 `PW_CHANNEL=chromium` 并先执行 `playwright install --with-deps chromium`
- 项目划分：`desktop` 匹配 `*.desktop.spec.ts`，`mobile` 匹配 `*.mobile.spec.ts`（Pixel 7 视口）
- 辅助模块：`apps/web/e2e/helpers.ts`（模板建项目、上传、拖动、数值填写、透视/尺寸推算、localStorage 轮询、PNG 解码与像素统计）

> **必须基于最新生产构建运行**：`webServer` 执行的是 `next start`（读取 `.next` 产物），并且本地 `reuseExistingServer` 会复用已在运行的 3100 端口服务。因此请使用 `pnpm test:e2e`（内部先 `pnpm build`）；直接运行 `pnpm --filter @acs/web test:e2e` 可能测到过期构建，得到与源码不符的结论。

已覆盖的真实断言：

| 用例 | 覆盖 |
| --- | --- |
| 核心闭环（desktop） | 选模板 → 上传（校验落库 `naturalWidth=8`）→ 低分辨率预检提示 → 真实拖动图层（坐标增大）→ 旋转 15° / 宽 600 → 保存 → reload 后一致 → 导出效果图 PNG（1600×680 且含图案像素）→ 导出印刷 PNG（2363×1004 = 200mm@300dpi）→ 导出 JSON（`schemaVersion=1`） |
| 文字自动增高（desktop） | 多行文字图层高度 ≥ 2 行所需高度，不再被裁切 |
| 撤销/重做合并（desktop） | 连续输入「文案」+「AB」后，一次 Ctrl+Z 回到输入前的完整文本（而非逐字回退）；Ctrl+Shift+Z 与 Ctrl+Y 均可重做 |
| 图层顺序与可见性（desktop） | 置顶图层下移后数组顺序变化（`layers[0]` 变为图片）；隐藏图层后落库 `visible:false` |
| 项目 JSON 往返（desktop） | 导出 JSON（`schemaVersion=1`、宽 600）→ 在项目页重新导入 → 提示「已导入项目」、项目数 +1、落库几何一致 |
| 非法输入拒绝（desktop） | 非项目 JSON 导入：提示错误且不跳转；损坏 PNG：提示「解码失败」且不产生图层 |
| 移动端工作区（mobile） | 进入编辑器自动适应窗口（缩放 < 100%）、底部面板可开关、可上传图案 |

## 5. 尚未执行的测试（不得视为通过）

| 项目 | 状态 | 原因 |
| --- | --- | --- |
| 浏览器 E2E（Playwright） | **已编写并执行**（desktop 6 + mobile 1 通过） | 见 §4.1；仅覆盖已列出的路径 |
| 移动端真机测试 | 未执行 | 无设备环境；E2E 只模拟视口与触摸相关布局 |
| 多浏览器兼容测试 | 未执行 | E2E 目前只在本机 Chrome 运行（CI 使用 Chromium，尚未在 GitHub 上跑过） |
| 可访问性自动化检查 | 未执行 | 未引入 axe 等工具 |
| 组件级测试（jsdom + Testing Library） | 未执行 | 未引入；属性/图层面板目前由 E2E 间接覆盖 |
| AI / 权限 / 支付测试 | 未执行 | 功能尚未实现（应使用可注入的假 Provider） |
| 性能基准（大画布、多图层） | 未执行 | 未建立基准 |
| 云端存储 Provider | 未执行 | 阶段 4 才实现；本地假实现测试随之补上 |

> **偶发失败记录（待定位根因）**：一次把 `pnpm test` 与 E2E 并行执行的运行中，`packages/template-schema` 的 vitest 曾以非 0 退出；随后单独运行与连续 5 次完整运行均通过，未复现。疑似并发资源竞争，已列入待办。
>
> **已定位并修复的「假失败」**：直接运行 `pnpm --filter @acs/web test:e2e` 时 `webServer` 复用了旧的 `.next` 生产构建，导致 3 个用例按旧代码断言失败。改用 `pnpm test:e2e`（先构建）后全部通过；这不是产品缺陷，已补充到本节说明。

## 6. 关键不可回归行为清单

以下行为必须始终有测试覆盖，任何改动都不得破坏：

- 撤销/重做栈的正确性（含新提交清空重做）
- 连续输入类编辑（文本、颜色）合并为单步撤销，且合并期间不破坏重做栈语义
- 图层顺序变化（上移/下移/置顶/置底/显式重排）与显隐状态落库
- 项目保存与恢复（含损坏数据的兜底、迁移后加载、未来版本拒绝）
- Schema 版本迁移链（缺失版本、版本过新、正常往返、缺失迁移步骤）
- 导出尺寸（效果图 = 画布像素；印刷 = 目标 DPI 且不超过像素预算，不会放大小图）
- 模板 ID 唯一与项目锁定模板版本
- 上传校验（类型、大小、扩展名、尺寸）与损坏文件拒绝
- 印刷换算与低分辨率预检

## 7. 本地存储与测试隔离

`ProjectRepository` 接受任意 `StorageLike`，测试使用 `createMemoryStorage()`，不触碰真实 `localStorage`。

## 8. 下一步测试计划

1. 扩展 Playwright 覆盖：移动端拖动与缩放、导入损坏项目文件后的错误页、导出像素预算提示（大画布）
2. 引入组件测试（jsdom + Testing Library）覆盖属性面板与图层面板交互
3. 阶段 4 起为每个 Provider（云存储、AI 生成）编写假实现测试与契约校验测试
4. 建立导出尺寸一致性测试（容差断言）与有效 DPI 断言
5. 为「Schema 迁移接入加载/导入路径」补充跨版本夹具（当前只有 1 个 schema 版本，迁移链以构造版本验证）
6. 定位并消除 `pnpm test` 偶发失败（记录失败日志，确认是否与并发度有关）
7. 在 GitHub CI 上真实执行 E2E 步骤（当前工作流只在 `main` push / PR 触发，需用户授权建 PR 或合并）
