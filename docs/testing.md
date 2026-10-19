# 测试说明与结果

## 1. 命令

```bash
pnpm test                 # 全部单元测试（所有包）
pnpm typecheck            # 全部包 TypeScript 检查
pnpm lint                 # ESLint
pnpm build                # 生产构建
pnpm test:e2e             # 生产构建 + 真实浏览器 E2E（Playwright）
pnpm bench                # 本地算法基准（@acs/editor-core，非门禁，人工记录）

# 单包
pnpm --filter @acs/editor-core test
pnpm --filter @acs/editor-core bench
pnpm --filter @acs/web test
pnpm --filter @acs/web test:e2e -- --project=desktop
```

> `pnpm bench` 不是提交门禁，它输出真实耗时/内存并把结果人工记入 `docs/algorithm-benchmarks.md`。基准文件命名 `*.bench.ts`，由独立的 `vitest.bench.config.mts` 收集，普通 `pnpm test` 不会执行。

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
| `packages/editor-core/src/fixtures.test.ts` | 13 | 零初始化 RGBA 缓冲区、非法尺寸拒绝、像素读写、整幅填充、棋盘格、确定性渐变、可复现噪声与通道范围、透明边框只影响外圈、种子伪随机序列稳定、`hashRaster` 同输入同输出且可区分、5 个命名素材确定、基准尺寸递增 |
| `packages/editor-core/src/png.test.ts` | 7 | CRC32 已知向量、编码容器结构（签名/IHDR/IDAT/IEND）、RGBA 往返一致、Alpha 保留、灰度与 RGB 解码为 RGBA、非法数据拒绝、尺寸不一致拒绝 |
| `packages/cloud-schema/src/api.test.ts` | 6 | 统一成功/失败信封、11 个错误码到 HTTP 状态、可重试错误码集合、失败信封解析与拒绝非法结构、成功 data 按调用方 Schema 校验 |
| `packages/cloud-schema/src/records.test.ts` | 8 | 项目记录一致性（design.id / ownerId / layerCount）、摘要校验、上传请求与预签名响应校验、完成上传载荷校验、拒绝未知资源类型 |
| `packages/cloud-core/src/runtime.test.ts` | 14 | 指数退避与上限、超时拒绝并触发 abort、及时返回、仅在可重试错误码上重试、不重试参数错误、达到最大次数抛最后一次错误、非 Provider 错误包装为 INTERNAL、超时+重试组合、令牌桶限流与按 key 隔离、非法限流配置、用量记录与上限裁剪、配置缺失检测 |
| `packages/cloud-core/src/fakes.test.ts` | 16 | 内存项目仓库创建/列表、越权一律 NOT_FOUND、禁止冒名创建、Schema 校验失败为 VALIDATION_FAILED、乐观并发冲突、复制新 ID 与副本名、按更新时间排序、摘要不含 design；预签名上传→完成登记→重复完成幂等、拒绝他人上传、只能删除自己的资源、非法上传请求；假认证的已知/空/未知 token |
| `apps/web/src/lib/project-repo.test.ts` | 15 | 创建/读取、损坏数据兜底、保存、排序、复制删除、导入导出、非法导入拒绝、配额错误包装、迁移后加载、`FUTURE_VERSION`（未来版本）拒绝且不覆盖原始数据、`listUnreadable`、导入未来版本与非法 JSON 提示 |
| `apps/web/src/lib/editor-store.test.ts` | 13 | 加载、添加图层与脏标记、撤销重做、删除后选中态、缩放钳制、适应视口居中、选择器、错误上报、连续输入合并为单步撤销、提交后新操作另起一步、普通操作结束合并会话、撤销结束合并会话、合并期间的编辑清空重做栈 |
| `apps/web/src/lib/cloud/config.test.ts` | 12 | 默认 local、未知模式回落 local、大小写不敏感、云端缺配置时**不宣称 cloud** 而是回退 local 并说明缺失变量、配置齐全才是 cloud、可选 Provider 缺失单独列出、空白值视为缺失、mock 在生产环境被禁止、UI 存储模式映射、对外状态不泄露内部缺失清单 |
| `packages/ai-schema/src/capabilities.test.ts` | 8 | 能力标签完整、已实现/计划能力不重叠、合法请求与默认值、空/超长提示词拒绝、超尺寸与超像素拒绝、**供应商特有字段被拒绝**、缺少必需字段的能力请求拒绝、能力描述函数穷尽 |
| `packages/ai-schema/src/jobs.test.ts` | 10 | 终态判定、内联/存储/远程结果引用的类型约束与错配拒绝、预估与实际成本分离、**实际成本必须带来源**、退款状态、任务记录校验、对外快照不含 ownerId/idempotencyKey、未知请求字段拒绝、非法状态值拒绝 |
| `packages/ai-schema/src/status.test.ts` | 7 | 状态中文标签、未配置状态、**verified 必须有验证记录**、**mock 模式不能报 verified**、有证据才可 verified、simulated 必须声明模拟能力、unverified/unavailable 状态 |
| `packages/ai-core/src/mock-provider.test.ts` | 9 | 自报为 mock、结果与用量带模拟标记、占位图含「模拟/SIMULATED」、同请求确定性、未声明能力拒绝、内容拦截、注入故障后可成功、取消即停止、进度阶段标记 |
| `packages/ai-core/src/registry.test.ts` | 6 | 优先解析 live、回退 mock、无实现时 NOT_SUPPORTED、禁用 mock 时隐藏并 NOT_CONFIGURED、重复 id 拒绝、描述不含凭据 |
| `packages/ai-core/src/ledger.test.ts` | 5 | 同任务只记一次（重试安全）、取消退款标记、预估/实际成本分离与模拟标记、模拟任务不编造实际成本、查找与保留上限 |
| `packages/ai-core/src/verification.test.ts` | 5 | 仅真实调用写入验证、模拟调用永不 verified、失败不清除历史验证、验证过期视为未验证、未知 Provider 空摘要 |
| `packages/ai-core/src/jobs.test.ts` | 17 | 模拟任务成功并只记一条用量、幂等键复用不重复执行、**重试成功仍只记一条用量**、重试耗尽失败并退款、超时标记 timed-out、取消标记 canceled、越权取消拒绝、非法输入不调用 Provider、未实现能力 NOT_SUPPORTED、只读模拟实现时 NOT_CONFIGURED、禁用模拟时 FORBIDDEN、并发上限拦截、限流先于建任务、快照不含内部字段、供应商错误码透传、历史上限、未知任务 id |
| `packages/ai-core/src/status.test.ts` | 8 | 关闭时列出缺失变量名、模拟模式列出被模拟能力、**生产环境拒绝模拟**、**仅配置凭据不得报 verified**、有真实成功记录才 verified、较新的失败转为 unavailable、真实 Provider 凭据不全时列出缺失名、模拟成功不算验证 |
| `apps/web/src/lib/ai/config.test.ts` | 12 | 默认 off 且只给出缺失变量名、未知模式按 off 处理、非生产允许 mock/生产拒绝、**不存在真实适配器时不谎称已实现**、凭据组只按标签列出、live 缺失变量全量列出、错误文本掩码 `sk-...`、三种模式下状态一致、**配置齐全也不得报 verified**、状态不泄露凭据值 |
| `apps/web/src/lib/ai/routes.test.ts` | 11 | 状态接口 no-store + requestId、mock 模式报 simulated、生产拒绝模拟、**配置凭据不等于 verified**、AI 关闭时创建任务 503、生产创建任务 403、live 模式 503、模拟任务成功且响应带模拟标记与提示、幂等键去重、非法载荷 422 且不建任务、任务读取仅限本人 |
| `packages/editor-core/src/pattern/params.test.ts` | 6 | 默认值、范围与上限拒绝、NaN/Infinity/非整数拒绝、未知枚举拒绝、预算归一化、参数归一化不改变输入 |
| `packages/editor-core/src/pattern/geometry.test.ts` | 10 | 2×2→1×1 精确面积平均（139）、常量图放大不变、90° 旋转逐像素、`expand` 外接矩形、恒等缩放返回副本、裁切越界拒绝、非整数裁切拒绝 |
| `packages/editor-core/src/pattern/tile.test.ts` | 10 | 1×1 恒等、平铺尺寸与像素、四向镜像规则（奇列/奇行翻转）、`offsetWrap` 负偏移归一化、像素上限拒绝、非法模式拒绝 |
| `packages/editor-core/src/pattern/seamless.test.ts` | 8 | 梯度接缝度量（均值 191.25 / 最大 255）、`blend: none` 恒等、边界列严格相等、双轴报告、源图不被修改、非法轴/强度拒绝 |
| `packages/editor-core/src/pattern/arrange.test.ts` | 13 | 网格/半落位/错位画布尺寸与坐标、间距留空、种子化抖动确定性、alpha 合成（128 与 255）、透明像素忽略、单元越界不写出、像素上限拒绝 |
| `packages/editor-core/src/pattern/color.test.ts` | 11 | 亮度/对比度/饱和度公式与钳制、灰度化（200/100/50→124）、Alpha 不变、颜色替换容差边界（19 否 / 20 是）、6 个预设唯一且确定性、未知 id 返回原图 |
| `packages/editor-core/src/pattern/pattern.test.ts` | 12 | 成品尺寸与 `plan`、预览封顶、指纹跨分辨率稳定、源或参数变化导致指纹变化、同种子复现、成品超出预算抛 `TOO_LARGE`、非法参数拒绝、源图不被修改 |

| `packages/editor-core/src/image/params.test.ts` | 15 | 裁切越界/非整数拒绝、收缩语义、三种缩放模式的尺寸与 `capped`/`upscale`/`reason`、透明度/锐化/去噪/Alpha 阈值/输出规格范围与默认值 |
| `packages/editor-core/src/image/edges.test.ts` | 9 | 四边边距识别、阈值边界（10/16/100）、全透明特例、裁切不修改源图、无需裁切返回原对象、毛边清理计数与阈值拒绝 |
| `packages/editor-core/src/image/adjust.test.ts` | 14 | 不透明度取整与恒等副本、组合调整结果、锐化恒等/常量不变/亮点增强/半透明解预乘、去噪中值与强度混合、非法参数拒绝 |
| `packages/editor-core/src/image/plan.test.ts` | 15 | 裁切内容与指纹、同尺寸不重采样、比例识别与约分、有效 DPI/所需像素/方向/百万像素、三类报告问题与「无问题」正例 |

合计：**388 个用例，39 个测试文件**（P0 算法基础：`fixtures` 13 + `png` 7；P1 图案引擎：`pattern/*` 70；P2 图像处理：`image/*` 53）。

## 4. 实际执行结果（t0.2.0 + Algorithm Engine V1 P2，2026-10-19）

```
pnpm lint       ->  0 errors / 0 warnings（exit 0）
pnpm typecheck  ->  9 个项目全部通过
pnpm test       ->  388 passed / 0 failed（39 个测试文件）
pnpm build      ->  成功，13 条路由（含 /api/v1/ai/* 3 条）
pnpm test:e2e   ->  14 passed / 0 failed（desktop 13 + mobile 1，约 60s）
pnpm bench      ->  6 passed（基准脚本自身断言），约 30s；实测数据见 docs/algorithm-benchmarks.md §9、§10
```

构建产物路由：

```
/  /account  /ai  /editor/[projectId]  /pricing  /projects  /scene
/studio-3d  /templates  /api/v1/status  /api/v1/ai/status
/api/v1/ai/jobs  /api/v1/ai/jobs/[jobId]
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
- 第二个服务实例运行在端口 3200，并注入 `AI_MODE=mock`、`APP_ENV=dev`，用于通过**真实 HTTP** 验证模拟 AI 流程与生产环境拒绝逻辑
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
| AI 状态展示（desktop） | `/ai` 页状态卡片 `data-state="not-configured"`、显示「未配置」与「尚无真实调用验证记录」、不出现模拟输出与「已验证」 |
| AI 状态接口（desktop） | `GET /api/v1/ai/status` 返回 200 + `no-store` + `requestId`，状态 `not-configured`、`providerId=null`、`simulatedCapabilities=[]`、无 `verifiedAt`，响应不含 `sk-` |
| AI 未启用拒绝（desktop） | `POST /api/v1/ai/jobs`（默认服务）返回 503 `NOT_CONFIGURED` |
| AI 非法参数（desktop） | 携带未知字段的请求返回 422 `VALIDATION_FAILED` 且带 details |
| AI 模拟流程（desktop，3200 端口） | 状态为 `simulated`；创建任务返回 201、`x-acs-simulated: true`、`notice` 含「不是真实 AI 输出」、`mode=mock`、结果为 `data:image/svg+xml`、`usage.actualCost=null`、`estimatedCost.minorUnits=0`；按 id 可读回 |
| AI 幂等与越权（desktop，3200 端口） | 相同 `idempotency-key` 两次返回同一 `taskId`；其他 `x-acs-client-id` 读取他人任务返回 404 |

## 4.2 云端配置状态（真实 HTTP 验证）

`pnpm build && pnpm start` 后以四种环境组合请求 `GET /api/v1/status`（端口 3200，`2026-10-18` 实测）：

| 环境 | HTTP | storage | database | problems |
| --- | --- | --- | --- | --- |
| 默认（未设置 `CLOUD_MODE`） | 200 | `local` | `not-configured` | 空 |
| `CLOUD_MODE=cloud`（无凭据） | 200 | `local` | `not-configured` | 明确列出缺少 `DATABASE_URL`、`CLOUD_PROJECT_STORE`，并说明「已回退为本地保存」 |
| `CLOUD_MODE=mock`（`APP_ENV=dev`） | 200 | `mock` | `mock` | 「开发模拟模式：数据只存在于进程内存」 |
| `CLOUD_MODE=mock` + `APP_ENV=production` | 200 | `local` | `mock` | 「mock 禁止在 production 使用」 |

结论：未配置云端时接口**从不**返回 `cloud`，也不返回假成功；`requestId` 为每次请求生成。

## 5. 尚未执行的测试（不得视为通过）

| 项目 | 状态 | 原因 |
| --- | --- | --- |
| 浏览器 E2E（Playwright） | **已编写并执行**（desktop 13 + mobile 1 通过） | 见 §4.1；仅覆盖已列出的路径 |
| 移动端真机测试 | 未执行 | 无设备环境；E2E 只模拟视口与触摸相关布局 |
| 多浏览器兼容测试 | 未执行 | E2E 目前只在本机 Chrome 运行（CI 使用 Chromium，尚未在 GitHub 上跑过） |
| 可访问性自动化检查 | 未执行 | 未引入 axe 等工具 |
| 组件级测试（jsdom + Testing Library） | 未执行 | 未引入；属性/图层面板目前由 E2E 间接覆盖 |
| **真实 AI Provider 调用** | **未执行（无实现）** | 未选择供应商、无凭据；本阶段刻意不做真实调用，避免产生费用。合约与可靠性行为由模拟 Provider 的用例覆盖（全局 388 个用例之一部分） |
| AI 接口鉴权与额度 | 未执行 | 项目尚无认证基础设施；接口仅在非生产环境的模拟模式下可用，缺口已记录在 `docs/ai-pipeline.md` §7 |
| 任务队列持久化 | 未执行 | 内存实现；数据库版依赖 `infra/sql`（未执行） |
| 支付 / 订阅测试 | 未执行 | 功能尚未实现 |
| 性能基准（大画布、多图层） | **已执行（Node 环境）** | `pnpm bench` 约 30s，6 个基准场景通过；数据见 `docs/algorithm-benchmarks.md` §9、§10。**浏览器与移动端未测**，且同机波动可达 ±40% |
| 算法视觉质量比对 | **未执行** | P1/P2 已就位，但仍只测数值正确性与确定性；`makeSeamless` / `resizeRaster` / `rotateRaster` / `sharpen` / `denoise` 的视觉评分未做 |
| 本地算法 vs 浏览器像素一致性 | **未执行** | Node 侧像素结果与浏览器 canvas 的一致性尚未验证（P3 必须补） |
| 云端存储 Provider | 假实现已测；**真实数据库/对象存储未测** | 无 Docker / psql / 云端凭据；`infra/sql/*.sql` 未在真实 Postgres 上执行 |
| SQL 迁移与 RLS | 未执行 | 同上；文件与验证步骤见 `infra/sql/README.md` |

> **偶发失败记录（待定位根因）**：一次把 `pnpm test` 与 E2E 并行执行的运行中，`packages/template-schema` 的 vitest 曾以非 0 退出；随后单独运行与连续 5 次完整运行均通过，未复现。疑似并发资源竞争，已列入待办。
>
> **已定位并修复的「假失败」**：直接运行 `pnpm --filter @acs/web test:e2e` 时 `webServer` 复用了旧的 `.next` 生产构建，导致 3 个用例按旧代码断言失败。改用 `pnpm test:e2e`（先构建）后全部通过；这不是产品缺陷，已补充到本节说明。
>
> **已定位并修复的「时间依赖测试」**：`packages/ai-core/src/verification.test.ts` 有 3 个用例调用了 `toSummary()` 但未传 `now`，`AiVerificationStore` 默认按**真实时钟**判断 24 小时验证有效期，于是硬编码时间戳在跨过 24 小时窗口后失效（2026-10-19 复现：`expected null to be '2026-10-18T09:00:00.000Z'`）。根因是测试依赖墙钟，而非被测逻辑错误。修复：这些用例显式传入 `now`。**约定：任何与时间有关的断言必须注入固定时间，禁止依赖 `Date.now()`。**
>
> **由基准测试定位的「真实性能缺陷」（P0）**：`hashRaster` 初版逐字节使用 `BigInt`（FNV-1a 64 位），2048×2048（4.19MP）实测 **2610ms**。修复为两路 32 位 `Math.imul` 混合哈希后降至 **61.8ms**（约 42×），`fixtures.test.ts` 的稳定性与区分度断言保持通过。数据与复现命令见 `docs/algorithm-benchmarks.md`。
>
> **由基准测试定位的「真实性能缺陷」（P2）**：`denoise` 首版在每个像素上 `slice().sort()` 分配数组，512×512 实测 **896ms**；改为边界复制采样 + 复用 9 元素数组 + 插入排序求中值后降至 **79ms**（约 11×）。见 `docs/algorithm-benchmarks.md` §10。
>
> **由基准测试定位的「真实性能缺陷」（P1）**：图案引擎首版逐像素调用带校验的 `rasterIndex()`，`repeatTile` 1024×1024 实测 **82.5ms**、`buildPattern` 成品 **417ms**。改为整行 `Uint8ClampedArray.set` + 不透明快路径 + 热循环直接索引后降至 **1.3–3.8ms** 与 **91–148ms**（约 22–63× 与 3–4.5×）。同机不同次运行波动可达 ±40%，因此文档只给区间。见 `docs/algorithm-benchmarks.md` §9。

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
- 云端状态三态（未配置绝不显示为 cloud；mock 在生产被拒绝）
- AI 服务状态：仅配置凭据不得报 verified；模拟成功不得写入验证记录；模拟调用不得产生实际成本
- AI 任务可靠性：幂等键去重、重试不产生重复用量、终态只记一条台账、取消与超时正确归类
- AI 输入校验：供应商特有字段与未知字段一律拒绝，未实现能力返回 NOT_SUPPORTED
- 固定素材与指纹稳定性：`hashRaster` 同输入必须同输出，不同输入必须可区分（P1 的确定性测试与缓存复用都依赖它）
- PNG 编解码往返：编码→解码必须逐像素一致，Alpha 不得丢失
- 本地算法参数校验：非法尺寸/越界/NaN/Infinity 必须拒绝而不是崩溃或产出损坏结果（P1/P2 逐项补齐）

## 7. 本地存储与测试隔离

`ProjectRepository` 接受任意 `StorageLike`，测试使用 `createMemoryStorage()`，不触碰真实 `localStorage`。

## 8. 下一步测试计划

1. 扩展 Playwright 覆盖：移动端拖动与缩放、导入损坏项目文件后的错误页、导出像素预算提示（大画布）、`/account` 与 `/projects` 的云端状态卡片
2. 引入组件测试（jsdom + Testing Library）覆盖属性面板与图层面板交互
3. 在真实 Postgres 上执行 `infra/sql` 并用两个账号验证 RLS（需要数据库环境）
4. 为真实 Provider 实现补齐契约测试（复用 `fakes.test.ts` 的断言集合）
5. 建立导出尺寸一致性测试（容差断言）与有效 DPI 断言
6. 定位并消除 `pnpm test` 偶发失败（记录失败日志，确认是否与并发度有关）
7. 在 GitHub CI 上真实执行 E2E 步骤（当前工作流只在 `main` push / PR 触发，需用户授权建 PR 或合并）
8. P1 图案引擎的浏览器端验证：Node 结果与 Chrome canvas 像素一致性、交互预览延迟实测（P3 前置）
9. 建立基准测量稳定性方案（预热轮次、CPU 亲和或取多轮最小值）后再考虑 CI 性能阈值
8. P1/P2：为每个新算法补齐正常/边界/异常/确定性四类测试，并追加固定样本与浏览器侧一致性验证
9. 把 `pnpm bench` 的关键指标（预览路径耗时、内存峰值）纳入可选回归提醒（先人工对比，不设硬门禁）
