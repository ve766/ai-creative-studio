# 本地图像处理算法（Algorithm Engine V1 / P2 + P3）

> 状态：**P2 已实现并已通过自动化测试**（`packages/editor-core/src/image/`，56 个用例）；**P3 已把其中一部分最小集成进编辑器**（`apps/web/src/lib/image-ops.ts`，19 个用例 + 1 个 E2E 闭环，见 §8）。
> 集成方式：处理结果以**新增图层**（`data:image/png`）形式落地，不覆盖原图层，可单步撤销；`sharpen` / `denoise` 仍未进入界面。
> 基准数据见 `docs/algorithm-benchmarks.md` §10。

## 1. 范围与能力边界

### 已实现（确定性本地运算，零费用、零外部服务）

| 能力 | 入口 |
| --- | --- |
| 裁切（严格校验 / 自动收缩两种语义） | `cropImage` / `cropImageClamped` |
| 缩放（指定尺寸 / 限制最长边 / 按 mm+DPI 印刷尺寸） | `planResize` / `resizeImage` |
| 不透明度（矩阵 Alpha 缩放） | `applyOpacity` / `applyAdjustments` |
| 亮度 / 对比度 / 饱和度（复用 P1 颜色实现） | `applyAdjustments` |
| 锐化（unsharp mask，**默认关闭**） | `sharpen` |
| 基础去噪（3×3 中值，**默认关闭**） | `denoise` |
| 透明边缘检测（四边可裁切量与不透明占比） | `analyzeTransparentEdges` |
| 透明边缘裁切 | `trimTransparentEdges` |
| 透明边缘清理（去除半透明毛边） | `cleanAlphaFringe` |
| 输出尺寸 / 长宽比 / 有效 DPI 检测与报告 | `inspectOutput` / `buildOutputReport` / `describeAspect` |

### 明确**不是**什么

- **不是超分辨率**：`resizeImage` 放大使用 P1 的双线性插值，不恢复细节；`planResize` 会通过 `upscale` 字段如实报告发生了放大。
- **不是 AI 抠图**：`cleanAlphaFringe` 只按 Alpha 阈值清理既有的半透明像素，**不会**识别或移除背景。
- **不是 AI 去噪 / 生成式修复**：`denoise` 是固定 3×3 中值滤波，对细纹与文字同样会模糊，默认关闭。
- **不追求「一键美化」**：`sharpen` 会产生光晕与噪点放大，默认关闭，界面必须让用户自行取舍。
- **不做非破坏性存储**：本轮只提供纯函数；「保留原始素材 + 参数」需要 P3 把参数写进项目数据。

## 2. 模块结构

```
packages/editor-core/src/image/
  params.ts   参数类型与归一化（裁切、缩放请求、透明度、锐化、去噪、Alpha 阈值、输出规格）
  edges.ts    analyzeTransparentEdges / trimTransparentEdges / cleanAlphaFringe
  adjust.ts   applyOpacity / applyAdjustments / sharpen / denoise
  inspect.ts  inspectOutput / buildOutputReport / describeAspect / simplifyAspect
  ops.ts      cropImage / cropImageClamped / resizeImage
  index.ts    对外导出
```

依赖方向：`image/* → raster / validate / errors / print`，并复用 `pattern/geometry`（缩放、裁切）与 `pattern/color`（颜色）。无 DOM、无 Node 依赖。

## 3. 关键契约

- 所有函数返回新图像，**不修改输入**（有测试逐一断言源图哈希不变）。
- 所有参数错误抛 `INVALID_PARAM`（`AlgorithmError`），带机器可读 `code`；像素预算超限抛 `TOO_LARGE`。
- 镜像与缩放等重采样输出的 `contentHash` = `hashRaster(输出)`，可作为缓存键与结果比对依据。
- 与 P1 共用 `RasterImage`（RGBA `Uint8ClampedArray`）与 `MAX_RASTER_PIXELS = 32_000_000`。

## 4. 算法与公式

### 4.1 裁切

- `cropImage(image, { x, y, width, height })`：起点必须为整数且落在图内、宽高必须为正整数、区域必须完全在图内，否则抛 `INVALID_PARAM`（**不静默裁剪**）。
- `cropImageClamped`：起点先截断为整数并收缩到 `[0, 尺寸-1]`，宽高再收缩到剩余区域；收缩后为空则报错。

### 4.2 缩放（`planResize`）

| 模式 | 目标尺寸 | 说明 |
| --- | --- | --- |
| `exact` | 指定的 `width × height` | 超过 `maxPixels` 时按比例缩小并置 `capped: true` |
| `fit-max-edge` | 保持比例，最长边 ≤ `maxEdge` | 原图更小则保持原尺寸（`upscale: false`） |
| `print` | `ceil(widthMm / 25.4 × dpi) × 同比例高度` | 用于印刷输出，`upscale` 如实标记需要放大 |

统一约束：`width × height ≤ maxPixels`（默认 3200 万），`reason` 字段给出中文原因说明。

### 4.3 不透明度

`out.a = round(a × opacity)`，RGB 不变。`opacity = 1` 返回等值副本（不做无意义运算）。取值范围 `[0, 1]`。

### 4.4 锐化（unsharp mask，premultiplied）

为避免透明边缘被邻域颜色污染，锐化在**预乘空间**进行：

```
pr = r × a / 255,  pg = g × a / 255,  pb = b × a / 255,  pa = a
对 pr/pg/pb/pa 分别做半径 r 的两次一维盒式模糊（边界钳制）→ blur
sharp = premul + amount/100 × (premul − blur)
out.a = clamp(sharp.a)
out.rgb = clamp(sharp.rgb / (out.a / 255))    // 解预乘
```

- `amount = 0`（默认）时直接返回副本（恒等）。
- 常量区域结果完全一致（无光晕、无偏移）——有测试断言。
- `amount ∈ [0, 100]`，`radius ∈ {1, 2, 3}`。

### 4.5 基础去噪（3×3 中值，默认关闭）

- `out = round(original + (median − original) × strength / 100)`，`strength ∈ [0, 100]`，`0` 为关闭。
- 边界采用**复制边缘**采样，因此任意位置都有 9 个样本。
- 中值用 9 元素插入排序实现（无每像素内存分配），Alpha 通道不变。
- **代价**：对文字与细线同样会模糊；只在成品阶段按需执行。

### 4.6 透明边缘

- `analyzeTransparentEdges(image, { threshold })`：逐行/逐列扫描 Alpha > threshold 的内容边界，返回四边的可裁切量、`opaqueRatio`、`fullyTransparentPixels`、`entirelyTransparent`。
  - 注意：**全透明图像**返回四边均为 `0`（不声称有可裁切边缘），并以 `entirelyTransparent: true` 明确标记。
- `trimTransparentEdges`：按上述四边裁切（整行 `set` 复制）；无需裁切或全透明时返回**原对象**且 `changed: false`。
- `cleanAlphaFringe`：把所有 `0 < a ≤ threshold` 的像素清零（RGB 与 Alpha 同时置 0），返回 `clearedPixels` 计数；`a = 0` 的像素不计入。这是**毛边清理**，不是抠图。

### 4.7 输出信息与有效分辨率（`inspectOutput` / `buildOutputReport`）

```
有效 DPI = 图片宽度像素 / (目标宽度mm / 25.4)
所需像素 = ceil(目标尺寸mm / 25.4 × 目标 DPI)     // 复用 print.ts
```

`buildOutputReport` 产出问题列表（复用 `print.ts` 的 `PreflightIssue` 结构，错误码唯一不冲突）：

| 错误码 | 等级 | 触发条件 |
| --- | --- | --- |
| `LOW_EFFECTIVE_DPI` | 有效 DPI 不足目标的一半 → `error`；否则不足 → `warning` | 与既有图层分辨率预检同一判据 |
| `BELOW_MINIMUM_DPI` | `error` | 有效 DPI 低于 `minimumDpi`（默认 `min(dpi, 150)`） |
| `ASPECT_MISMATCH` | `info` | 传入目标高宽时比例偏差 > 2% |

`describeAspect` 先匹配常见比例（1:1、5:4、4:3、3:2、7:5、16:9、2:1、3:1、1:√2，容差 1%），否则用 `simplifyAspect` 给出约分后的整数比或三位小数比。

## 5. 测试覆盖（56 个用例）

| 文件 | 用例 | 重点 |
| --- | --- | --- |
| `params.test.ts` | 15 | 裁切越界/非整数拒绝、收缩语义、三种缩放模式的尺寸与 `capped`/`upscale`/`reason`、全部参数范围与默认值 |
| `edges.test.ts` | 9 | 四边边距识别、阈值边界（10/16/100）、全透明特例、裁切不修改源图、无需裁切返回原对象、毛边清理计数与阈值拒绝 |
| `adjust.test.ts` | 14 | 不透明度取整与恒等副本、组合调整结果、锐化恒等/常量不变/亮点增强/半透明解预乘、去噪中值与强度混合、非法参数拒绝 |
| `plan.test.ts` | 18 | 裁切内容与指纹、同尺寸不重采样、比例识别与约分、有效 DPI/所需像素/方向/百万像素、三类报告问题与「无问题」正例、基于尺寸的 DPI 报告（不分配像素） |

## 6. 性能实测（512×512，2026-10-19）

| 操作 | 单次耗时 |
| --- | ---: |
| `applyOpacity` | 4.7–5.5 ms |
| `cleanAlphaFringe` | 5.9–8.0 ms |
| `analyzeTransparentEdges` | 6.1–7.5 ms |
| `sharpen`（amount 60, radius 1） | 77–81 ms |
| `denoise`（strength 60, 3×3 中值） | 79–230 ms |
| `inspectOutput + buildOutputReport` | 0.002 ms |

- **由基准定位并修复的性能缺陷**：首版 `denoise` 在每个像素上 `slice().sort()` 分配数组，512×512 实测 **896ms**；改为「边界复制 + 复用 9 元素数组 + 插入排序求中值」后降至 **79ms**（约 11×）。
- 结论：`sharpen` / `denoise` 属于**重操作**（0.26MP 约 0.08s，4MP 预计数秒），必须放在成品阶段异步执行并显示运行状态，不得进入拖拽/预览路径；`applyOpacity`、`analyzeTransparentEdges`、`inspectOutput` 足够轻量，可用于实时反馈。

## 6.1 编辑器集成（P3）

`apps/web/src/lib/image-ops.ts` 是算法层与编辑器之间的**唯一桥接层**，保持纯逻辑（可注入 `RasterCodec`，Node 下可测）。

- `runImageOperation(raster, request)`：按固定顺序执行 **去除透明边缘 → 裁切 → 缩放 → 调整（不透明度/颜色）→ 清理毛边**，返回 `{ raster, steps, notes, originX, originY }`。因为裁切会改变坐标系，`originX/originY` 会累加，供上层换算图层在画布上的新位置。
- `planResultGeometry(source, { width, height, originX, originY })`：按 `源图缩放系数 = 图层宽 / 原图像素宽` 换算处理后图层的画布位置与尺寸，支持非等比。
- `applyImageOperation(layer, request, codec)`：解码图层 → 运行算法 → 编码 → 返回 `{ ok: true, layer }` 或 `{ ok: false, message }`。成功时为**新增图层**（名称后缀标明操作，`crop: null`），调用方 `addLayer` 合成单步撤销；**从不修改原图层**。
- `createBrowserCodec()`：用 `canvas` 解码 `src`、以 `toDataURL("image/png")` 编码；DOM 只在函数体内引用，模块顶层保持可在 Node 加载。
- `describeLayerOutput(project, layer)`：复用 `buildSizeReport`，**不分配像素**即可给出图层有效 DPI 报告（P3 为此把 `inspect.ts` 拆出 `inspectDimensions` / `buildSizeReport`）。

界面入口：属性面板的「图像处理」区（裁切起点 X/Y、裁切宽/高、最长边、亮度/对比度/饱和度、调整透明度 + 5 个按钮），仅对 `type === "image"` 的图层显示。处理期间按钮禁用并显示 `processing` 状态；算法给出的 `notes`（放大、封顶、未裁切、清除像素数等）与错误以编辑器横幅如实展示。

## 7. 已知限制与后续

1. **无「原始素材 + 参数」的非破坏性存储**：P3 虽已接入撤销/重做，但结果被**烘焙**成新图层的 PNG，用户无法回改参数，项目体积也会随处理累积（见 `PROJECT_STATUS.md` 已知问题 29）。
2. 去噪仅中值滤波，未做边缘保持（如双边滤波）；锐化未做半径自适应，且两者**仍未进入界面**。
3. 有效 DPI 报告按**宽度**计算，高度仅在同比例时随宽度推导；P3 未补充非等比输出的双向报告。
4. 未做色域/ICC、色彩配置与半色调，印刷色彩一致性不在本阶段范围。
5. 跨端一致性（Node 结果 vs 浏览器 Canvas）与浏览器端性能仍未验证。
6. 全部处理在**主线程同步执行**，无 Web Worker、无进度与取消；大图处理会短暂冻结界面（见 `PROJECT_STATUS.md` 已知问题 30）。
