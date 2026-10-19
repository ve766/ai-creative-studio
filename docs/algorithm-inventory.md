# 本地算法资产清单（P0 审计）

> 阶段：**Algorithm Engine V1 / P0（源码审计与算法测试基础）**
> 审计时间：2026-10-19；审计基线提交：`0e3461d`（分支 `feature/t0.2.0`，工作区干净）
> 本文只记录**代码中真实存在**的能力，以及**明确缺失**的能力。原型、接口与实现严格区分。

## 1. 审计范围与方法

| 对象 | 方法 |
| --- | --- |
| `packages/editor-core` | 逐个源文件通读，核对导出符号与测试文件 |
| `packages/project-schema` / `template-schema` / `template-library` | 核对数据结构、工厂函数、迁移与模板规格 |
| `apps/web`（编辑器 / 上传 / 图层 / 导出 / 保存） | 通读 `src/lib/*` 与 `src/components/editor/*` |
| 已有 AI Provider 代码 | 通读 `packages/ai-schema`、`packages/ai-core`、`apps/web/src/lib/ai/*` |
| 测试 | 执行 `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm test:e2e`（结果见 §7） |

## 2. 已有能力（已实现 + 已有自动化测试）

| 能力 | 位置 | 说明 | 测试 |
| --- | --- | --- | --- |
| 图层几何与顺序 | `editor-core/src/operations.ts` | 增删/移动/缩放/旋转/复制/层级/显隐/锁定/透明度/居中/适应/边界钳制/重排/重命名 | 13 |
| 撤销重做 | `editor-core/src/history.ts` | 150 步上限、提交清空重做、`replacePresent` 合并会话 | 5 |
| 上传校验 | `editor-core/src/uploads.ts` | MIME/扩展名/大小（20MB）/单边 12000px/总像素 4000 万；`fitInside` 等比缩放计算 | 5 |
| 印刷换算与预检 | `editor-core/src/print.ts` | mm↔px、目标 DPI 所需像素、低分辨率判定（<50% 为错误）、安全区判定、整份预检报告 | 7 |
| 导出像素预算 | `editor-core/src/export-budget.ts` | 预览=画布原始像素；印刷=目标 DPI，倍率上限 4×，像素上限 1600 万/单边 8192px，超限拒绝且给出原因 | 8 |
| 图片解码与缩放（浏览器） | `apps/web/src/lib/image.ts` | `FileReader` → `Image` → canvas 缩放至最长边 2500px，PNG/WebP 保留 Alpha | E2E 间接覆盖 |
| 导出渲染（浏览器） | `apps/web/src/lib/export.ts` | 用 Konva 离屏 Stage 渲染图层 → `toDataURL`，含内存不足时的明确报错 | E2E（像素级断言） |
| 项目保存与迁移 | `apps/web/src/lib/project-repo.ts` + `project-schema/src/migrations.ts` | 本地存储仓库、损坏数据兜底、未来版本拒绝、迁移链 | 15 + 12 |
| 模板坐标系 | `project-schema` + `template-library` | 画布/可编辑区/安全区/出血/输出规格；10 个示例模板 | 4 + 6 |
| AI 合约与模拟 Provider | `ai-schema` / `ai-core` | 能力声明、严格请求校验、任务状态机、用量台账、验证记录、模拟 Provider | 26 + 52 |

**P0 新增（本次）**：

| 能力 | 位置 | 说明 | 测试 |
| --- | --- | --- | --- |
| 确定性素材生成 | `editor-core/src/fixtures.ts` | `RasterImage`（RGBA `Uint8ClampedArray`）、参数校验、`createRandom`（mulberry32）、checker/gradient/noise/透明边框生成器、`hashRaster`（32 位双哈希）、5 个命名固定素材 | 13 |
| PNG 编解码（测试/基准用） | `editor-core/src/png.ts` | `encodePng`（8 位 RGBA，filter 0 + zlib）、`decodePng`（8 位、非交错、支持灰度/RGB/RGBA、filter 0–4）、`crc32` | 7 |
| 基准框架 | `editor-core/src/algorithms.bench.ts` + `vitest.bench.config.mts` | 预热 + 多次采样 + 批量操作；输出单次耗时/最快/最慢；可 `pnpm bench` 重复运行 | —（基准脚本自身断言确定性） |

> `fixtures.ts` 与 `png.ts` **不**从 `packages/editor-core/src/index.ts` 导出：前者是测试素材工具，后者依赖 `node:zlib`，绝不能进入浏览器产物。

## 3. 缺失能力（P1–P4 待实现，当前完全不存在）

| 计划能力 | 现状 | 备注 |
| --- | --- | --- |
| 重复平铺（水平/垂直/双向） | **不存在** | 编辑器只能放单张图片图层 |
| 镜像平铺 | **不存在** | 同上 |
| 无缝纹理辅助（边缘偏移/接缝检查/融合） | **不存在** | 无任何接缝度量代码 |
| 图案排列（网格/错位/半落位/间距） | **不存在** | 无排列算法 |
| 密度与缩放控制（大小/旋转/间距/偏移） | **不存在** | 仅单图层 x/y/scale/rotation |
| 颜色变体（替换/亮度/对比度/饱和度） | **不存在** | 无像素级颜色算子；仅整层 `opacity` |
| 图像裁切（crop 交互） | **仅数据层** | `ImageLayer.crop` 字段存在并参与渲染，但 UI 无裁切工具 |
| 图像锐化/去噪 | **不存在** | — |
| 透明边缘检测/清理 | **不存在** | — |
| 输出尺寸/长宽比/有效分辨率检测 | **部分** | 有印刷所需像素与低分辨率预检，无长宽比/有效 DPI 报告 |
| 四点透视/单应变换 | **不存在** | 无任何变换矩阵代码 |
| 网格形变 / 贴图遮罩 | **不存在** | `docs/` 中只有设计描述 |
| 结果缓存与内容指纹复用 | **不存在** | 无缓存层；`hashRaster` 为 P0 提供指纹基础 |

## 4. 数据契约（算法必须复用，不得另起一套）

| 契约 | 定义位置 | 关键约束 |
| --- | --- | --- |
| `Project` / `Canvas` / `Layer` | `packages/project-schema/src/project.ts`、`layers.ts` | 含 `schemaVersion`；图层为 `image` / `text` 判别联合；`width`/`height` 必须为正；`opacity ∈ [0,1]` |
| `ImageLayer.src` | 同上 | 数据 URL 或 URL 字符串（本地存储方案下为 data URL） |
| `Crop` | `layers.ts` | `x,y ≥ 0`，宽高 > 0，单位为素材原始像素 |
| `ProductTemplate` | `packages/template-schema` | `canvas`/`editableArea`/`safeArea`/`bleed`/`outputSpec`，`verified` 与 `example` 标记 |
| `RasterImage`（P0 新增） | `editor-core/src/fixtures.ts` | RGBA 4 通道 `Uint8ClampedArray`，长度必须等于 `width*height*4`；算法输入输出的统一内存形态 |
| `AiRequest` / `AiCapability` | `packages/ai-schema` | 严格模式拒绝供应商特有字段；本地算法**不得**复用此结构（能力边界见 §6） |

## 5. 依赖关系与边界

```
project-schema (zod)
   ↑
editor-core (纯逻辑，无 DOM/无 node 依赖，除 png.ts 与 bench)
   ↑                    ↑
apps/web(editor)     ai-core → ai-schema / cloud-*
```

- `editor-core` 目前只依赖 `@acs/project-schema`；P1/P2 若需要参数校验，将复用 `zod`（经 `project-schema` 传递依赖，或显式声明）。
- 浏览器专属能力（`CanvasRenderingContext2D`、`createImageBitmap`、Web Worker）属于 `apps/web`；算法核心保持在 `editor-core` 内可测的纯函数。
- `png.ts` 是唯一允许依赖 Node 内置模块的文件，仅用于测试与基准；浏览器侧编解码继续走 `apps/web/src/lib/image.ts`。

## 6. 能力边界（必须在 UI 与文档中区分）

| 类别 | 判定 |
| --- | --- |
| 图案排列 / 纹理生成 | 确定性本地算法，可离线、可复现、零成本。**不是 AI 生成** |
| 图像处理（颜色/裁剪/缩放/锐化） | 确定性本地算法；插值放大**不等于**超分辨率 |
| AI 图像生成 / 抠图 / 场景贴图 | 需外部 Provider；当前只有模拟实现，未接入任何真实服务 |
| 3D 与真实产品贴图 | 仅有能力声明与四条透视变换的预研计划，**未实现** |

## 7. 测试缺口（P0 结束时仍存在）

1. **算法本身还没有测试**——因为算法还不存在；P1/P2 每项必须带正常/边界/异常/确定性四类测试。
2. **浏览器侧无像素级单元测试**：`apps/web` 无 jsdom/canvas 测试环境，画布行为只由 Playwright 覆盖。
3. **无性能回归门禁**：`pnpm bench` 只在人工执行时记录，尚未接入 CI 阈值。
4. **PNG 解码器能力有限**：仅 8 位、非交错、灰度/RGB/RGBA；不校验 CRC；16 位与交错文件会明确报错，但尚无对应测试用例覆盖"调色板 PNG"。
5. **无真实设备内存测试**：内存数据均来自 Node 进程（`process.memoryUsage`），移动端浏览器内存峰值未测。
6. **素材内容校验仍是扩展名/MIME/大小**，未做魔数校验（既有待办）。
7. **无跨端一致性测试**：Node 端像素结果与浏览器 canvas 结果的一致性未验证（P1 需补）。
8. **`fixtures.ts` 的固定素材尚无版本化样本文件**：当前以代码生成，未导出 PNG 存档供人工比对。

## 8. 基准与素材（P0 交付）

- 固定素材：5 个命名素材 + 4 档基准尺寸，定义与哈希稳定性由 `fixtures.test.ts` 锁定。
- 基准协议、环境与实测结果见 `docs/algorithm-benchmarks.md`。
- 复现命令：`pnpm bench`（= `pnpm --filter @acs/editor-core bench`）。

## 9. 结论与建议顺序

1. P0 已建立可复现的素材与基准；`editor-core` 具备承载 P1/P2 纯算法的基础设施（校验、哈希、编解码、内存形态统一）。
2. 实测表明 **1 MP 单遍像素运算 10–40ms、4 MP 47–176ms**，因此 P1 必须"低分辨率预览 + 延迟高清渲染"，不能每次交互全分辨率重算。
3. 建议 P1 首个落地顺序：参数校验与结果指纹 → 平铺（含镜像）→ 排列（网格/错位/间距）→ 无缝辅助（接缝度量）→ 颜色变体。
4. 编辑器集成（P3）复用现有 `Project`/`Layer`/历史机制，算法输出必须作为新图层进入，保留原始素材。
