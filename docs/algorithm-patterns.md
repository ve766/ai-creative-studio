# 本地图案算法引擎（Algorithm Engine V1 / P1）

> 状态：**已实现并已通过自动化测试**（`packages/editor-core/src/pattern/`，70 个用例）。
> 尚未接入编辑器 UI（P3 负责），因此**界面里暂时看不到这些功能**。
> 本文件描述算法契约、公式、性能实测与能力边界。基准数据见 `docs/algorithm-benchmarks.md`。

## 1. 范围与能力边界

### 已实现（确定性本地算法，零外部服务、零费用）

| 能力 | 入口 |
| --- | --- |
| 重复平铺（水平/垂直/双向） | `repeatTile` |
| 镜像平铺（水平/垂直/两者） | `mirrorTile` |
| 周期性偏移（无缝流程的可视化与修补基础） | `offsetWrap` |
| 接缝度量（接缝差异均值/最大值） | `measureSeam` / `measureSeams` |
| 无缝辅助（边缘镜像融合，可调强度） | `makeSeamless` |
| 图案排列（网格/错位/半落位 + 间距） | `planArrange` / `planArrangeLayout` / `arrangeMotif` |
| 密度与缩放（图案大小/旋转/间距/偏移/抖动） | `PatternSpec` + `buildPattern` |
| 颜色变体（亮度/对比度/饱和度、颜色替换、预设变体） | `adjustColor` / `replaceColor` / `applyVariant` |
| 几何基础（等比/自由缩放、旋转、裁切） | `resizeRaster` / `rotateRaster` / `cropRaster` |
| 预览/成品分级、像素预算、参数校验、结果指纹 | `planPatternRender` / `buildPattern` / `patternFingerprint` |

### 明确**不是**什么（不得在 UI/文档/销售材料中混淆）

- **不是 AI 生成**：全部为确定性像素运算，不调用任何模型或网络服务。
- **不是「任意图片一键无缝」**：`makeSeamless` 只在接缝处做有限宽度的边缘镜像融合，会引入对称痕迹；对内容不匹配的图片无法真正无缝。
- **插值放大不是超分辨率**：`resizeRaster` 的最大放大倍数内只有双线性插值，不恢复细节。
- **旋转裁切是真实损失**：`rotationDeg` 使用 `expand: false`，旋转后超出画布四角的内容会被裁掉。
- **不是 3D 贴图**：不涉及透视、网格形变、遮挡或光照。

## 2. 模块结构

```
packages/editor-core/src/
  errors.ts    AlgorithmError（code: INVALID_PARAM / INVALID_IMAGE / TOO_LARGE / UNSUPPORTED）
  raster.ts    RasterImage 统一内存形态、索引/读写、随机数、hashRaster、hashString
  validate.ts  参数校验（抛 INVALID_PARAM）
  pattern/
    params.ts    参数类型 + 归一化（默认值、范围、枚举、像素预算）
    geometry.ts  resizeRaster / rotateRaster / cropRaster
    tile.ts      repeatTile / mirrorTile / offsetWrap
    seamless.ts  measureSeam / measureSeams / makeSeamless
    arrange.ts   planArrangeLayout / planArrange / renderLayout / arrangeMotif
    color.ts     adjustColor / replaceColor / COLOR_VARIANTS / applyVariant
    pattern.ts   planPatternRender / buildPattern / patternFingerprint
    index.ts     对外导出
```

依赖方向：`pattern/* → raster / validate / errors`；`pattern/pattern.ts → arrange / color / geometry / params`。**不依赖 DOM、不依赖 Node 内置模块**，可在浏览器与测试环境同构运行。

## 3. 数据契约

```ts
interface RasterImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray; // RGBA，长度必须 = width * height * 4
}
```

- 所有算法**不修改输入**，返回新的 `RasterImage`（除非明确说明是原地操作，当前没有）。
- 尺寸上限 `MAX_RASTER_PIXELS = 32_000_000`（超过抛 `TOO_LARGE`），是内存保护而非画质限制。
- 错误一律是 `AlgorithmError`，带机器可读 `code`：
  - `INVALID_PARAM`：参数非法（NaN、Infinity、非整数、越界、未知枚举）。
  - `INVALID_IMAGE`：图像数据非法、坐标越界、文件结构错误。
  - `TOO_LARGE`：输出像素超过上限。
  - `UNSUPPORTED`：预留（当前算法路径未使用）。

## 4. 算法与公式（可复现）

### 4.1 `resizeRaster(image, width, height)`

- 放大（目标 ≥ 源）：**双线性插值**，采样点 `(x + 0.5) * scale - 0.5`，坐标钳制到图像内。
- 缩小（任一方向 scale > 1）：**面积平均**，按每个源像素与目标像素的重叠面积加权：
  `sum(源通道值 × 重叠面积) / sum(重叠面积)`，四舍五入。
- 相同尺寸：返回独立副本（`data.slice()`），不共享缓冲区。
- 2×2 → 1×1 的结果可精确断言（测试用例：`[0,100,200,255]` 四像素 → 139）。

### 4.2 `rotateRaster(image, degrees, { expand })`

- 逆映射 + 双线性采样，绕图像中心旋转。
- `expand: false`（默认）：保持原尺寸，四角内容被裁掉。
- `expand: true`：画布扩大为外接矩形 `ceil(|w·cos| + |h·sin|) × ceil(|w·sin| + |h·cos|)`（对浮点误差做 6 位定点后向上取整，保证 90° 时得到精确的 `h × w`）。
- 落在源图之外的目标像素保持透明（不填边）。
- 测试：2×2 图像旋转 90° 逐像素精确对应；0° 与原图哈希一致。

### 4.3 `cropRaster(image, { x, y, width, height })`

- 按行 `data.set` 复制；越界、非整数起点、非正尺寸一律拒绝（不静默裁剪）。

### 4.4 `repeatTile` / `mirrorTile`

- 输出尺寸 = `源尺寸 × (columns, rows)`；
- `mirrorTile` 规则：**奇数列水平翻转**（`mode: horizontal|both`）、**奇数行垂直翻转**（`mode: vertical|both`）；因此 2×2 区块内部是四向镜像，天然消除平铺接缝。
- 实现：整行 `Uint8ClampedArray.set`（不镜像时是内存拷贝级）；镜像行逐像素反序复制。**不含逐像素坐标校验**，这是实测优化（见 `docs/algorithm-benchmarks.md` §9）。

### 4.5 `offsetWrap(image, offsetX, offsetY)`

- 环形平移：`sourceX = (x - shiftX + w) % w`，负偏移自动归一化，`shift = w` 为恒等。
- 用途：把纹理接缝移到画面中央以便人工检查/修补（标准无缝工作流）。

### 4.6 `measureSeam` / `measureSeams`

- 水平接缝 = 第 0 列与第 `w-1` 列的逐通道绝对差；垂直接缝同理。
- 输出 `{ axis, pairs, meanDelta, maxDelta }`（对 4 个通道求平均/取最大）。
- 纯只读、微秒级（512² 实测 0.17–0.22ms），可用于 UI 实时提示「这张图平铺会有接缝」。

### 4.7 `makeSeamless(image, { axis, blend })`

- 做法：在接缝处把最外侧 `band` 列（行）与**对侧镜像**做线性融合：
  `out(x) = original(x) · (1 − w) + original(w−1−x) · w`，`w = 1 − x / band`。
- 因此 **x = 0 的像素与 x = w−1 完全相同**，接缝差异在该列严格为 0（测试断言满足），整体 `meanDelta` 下降。
- `band` 由强度决定（`none=0`、`soft=4%`、`medium=10%`、`strong=20%`，取长边比例）。
- 代价与限制：牺牲带宽范围内的原始细节，并产生镜像对称痕迹；**对边缘内容毫不相关的照片无法真正无缝**。

### 4.8 排列（`planArrangeLayout`）

设单元尺寸 `cellW × cellH`，间距 `gapX/gapY`，抖动 `jitter`（默认 0）：

```
staggerX = pattern === "half-drop" ? floor(cellW / 2) : 0
staggerY = pattern === "offset"    ? floor(cellH / 2) : 0
canvasW  = columns · cellW + (columns − 1) · gapX + staggerX + 2 · jitter
canvasH  = rows · cellH + (rows − 1) · gapY + staggerY + 2 · jitter

单元 (row, column):
  x = jitter + column · (cellW + gapX)
  y = jitter + row    · (cellH + gapY)
  half-drop 且 row 为奇数 → x += staggerX
  offset    且 column 为奇数 → y += staggerY
  jitter > 0 → x += round((rand()·2 − 1) · jitter)，y 同理（rand = mulberry32(seed)）
```

- 抖动使用**种子化伪随机**，因此「同参数同种子 → 同结果」；种子默认 `20261019`。
- 画布按最大抖动量外扩，保证抖动后单元不被裁切。
- 合成公式（source-over，预乘前）：
  `outA = sa + da(1 − sa)`，
  `outC = (srcC·sa + dstC·da·(1 − sa)) / outA`；
  `sa = 255` 直接覆盖，`sa = 0` 直接跳过（实测优化）。

### 4.9 颜色

`adjustColor` 顺序固定为 **亮度 → 对比度 → 饱和度**（可复现、可断言）：

```
亮度： v1 = v + brightness/100 · 255
对比： v2 = 128 + (v1 − 128) · (100 + contrast) / 100
饱和： luma = 0.299·r2 + 0.587·g2 + 0.114·b2
      v3 = luma + (v2 − luma) · (100 + saturation) / 100
输出： 四舍五入并钳制到 0–255；Alpha 完全不变
```

- `contrast = 0` 时中灰 128 不变；`saturation = −100` 时 `r = g = b = luma`（测试断言 200/100/50 → 124）。
- `replaceColor`：容差判定用**三通道最大绝对差**（不是欧氏距离），`maxDelta ≤ tolerance` 即替换；Alpha 保留。零点与边界均有测试（tolerance 19 不替换、20 替换）。
- `COLOR_VARIANTS`：6 个预设（原始/暖色/冷色/明亮/低饱和/浓郁），id 唯一，第一个是「原始」；未知 id 返回原图。

### 4.10 顶层 `buildPattern(source, spec, budget)`

```
cell = round(source 尺寸 × motifScale × effectiveScale)
motif = adjustColor(rotate(resize(source, cell), rotationDeg, expand:false), adjust)
image = renderLayout(motif, layout(spec 缩放后的 gap/jitter))
```

返回 `{ image, fingerprint, contentHash, plan, spec }`：

- `fingerprint`：`hash(hashRaster(source) | JSON(归一化 spec))`——**只取决于输入与参数**，与预览/成品分辨率无关，适合作为缓存键。
- `contentHash`：输出像素的 `hashRaster`，用于验证结果一致或做缓存失效判断。
- `plan`：输出尺寸、单元尺寸、`effectiveScale`、`capped`、`tileCount`。

## 5. 预览 / 成品分级（性能与内存纪律）

`planPatternRender(source, spec, budget)`：

| 模式 | 行为 |
| --- | --- |
| `preview` | `effectiveScale = min(1, previewMaxEdge / 最长边)`；`capped = true` 表示被降采样；**不会抛 TOO_LARGE**（交互必须始终可用） |
| `final` | 不做降采样；若输出像素 > `maxPixels`（默认 3200 万）→ 抛 `TOO_LARGE`，**明确报错而不是静默缩小** |

配套规则（P3 集成时**必须**遵守，依据见实测）：

1. 交互预览使用 `previewMaxEdge ≤ 256`，且只在该参数真正变化时重建（不要每帧/每次鼠标移动重建）。
2. 高清成品走 `final` 模式，异步执行并显示运行状态。
3. 交互路径禁止 PNG 编解码（4.19MP 编码 127–212ms、解码 236–537ms）。
4. 不得同时保留多份全尺寸位图：4K RGBA 单张即 64MB（实测 `arrayBuffers +237MB` / 4 张）。

## 6. 测试覆盖（70 个用例）

| 文件 | 用例 | 重点 |
| --- | --- | --- |
| `params.test.ts` | 6 | 默认值、边界、NaN/Infinity/非整数/越界、未知枚举、预算归一化 |
| `geometry.test.ts` | 10 | 2×2→1×1 精确面积平均、常量图放大不变、90° 精确旋转、外接矩形、裁切越界 |
| `tile.test.ts` | 10 | 四向镜像规则、1×1 恒等、负偏移归一化、像素上限、非法模式 |
| `seamless.test.ts` | 8 | 梯度接缝度量、`blend: none` 恒等、边界列严格相等、双轴、源图不被修改、非法枚举 |
| `arrange.test.ts` | 13 | 网格/半落位/错位尺寸与坐标、间距留空、抖动种子确定性、alpha 合成、透明像素忽略 |
| `color.test.ts` | 11 | 亮度/对比度/饱和度公式与钳制、灰度化、颜色替换容差边界、预设唯一性与确定性 |
| `pattern.test.ts` | 12 | 成品尺寸、预览封顶、指纹跨分辨率稳定、参数/源变化导致指纹变化、种子复现、越界拒绝、源图不变 |

四类要求（正常 / 边界 / 异常 / 确定性）在每个文件里都有对应用例。

## 7. 已知限制与后续（P2/P3）

1. 排列只支持 `grid / offset / half-drop` 三种；「砖砌」「随机散布」等未实现，不假装支持。
2. 旋转不填补四角（`expand: false`），需要 P2 提供带边界的旋转裁切交互。
3. `makeSeamless` 是**有限辅助**，不是任意图像的真无缝方案；UI 必须显示接缝度量数值，让用户自己判断。
4. 预览的固定开销主要来自对**整幅源图**的面积平均缩小（见基准 §9），P3 可缓存一份小尺寸 mip 以进一步降低交互延迟。
5. 未做 Web Worker 并行、未做 GPU 加速；全部为单线程同步计算，长任务需要 P3 的异步封装。
6. 跨端一致性（Node 结果 vs 浏览器 Canvas 结果）未验证，列入 P3 待办。
