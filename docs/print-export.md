# 印刷输出规范

> 状态：基础能力已实现（预检、参考导出），**供应商规格对接尚未实现**（阶段 6）。
> 印刷生产功能必须独立于 AI 效果图生成。

## 1. 效果图与生产文件的严格区分

| 类型 | 用途 | 分辨率 | 颜色 | 是否可用于生产 |
| --- | --- | --- | --- | --- |
| 效果图 PNG | 展示、分享 | 画布原始分辨率 | 屏幕 RGB | **否** |
| 印刷参考 PNG | 内部核对尺寸 | 按目标 DPI 计算 | 屏幕 RGB | **否**（未做色彩校准） |
| 生产文件（阶段 6） | 交印刷厂 | 供应商规定 | 视供应商要求 | 是 |

UI 与文件名必须体现这一区分（当前导出文件名为 `*-effect.png` 与 `*-print-ref.png`）。

## 2. 核心换算

```
MM_PER_INCH = 25.4
mmToPixels(mm, dpi)          = round(mm / 25.4 * dpi)
requiredPixelsForPrint(mm,dpi) = ceil(mm / 25.4 * dpi)
pixelsToMm(px, dpi)          = px / dpi * 25.4
```

实现位置：`packages/editor-core/src/print.ts`（有测试覆盖）。

## 3. 导出模式

### 3.1 导出效果图 PNG（preview）

- `pixelRatio = 1`
- 输出尺寸 = 画布尺寸
- 用途：预览、分享、在编辑器外查看

### 3.2 导出印刷参考 PNG（print）

- 目标像素 = `requiredPixelsForPrint(targetWidthMm, dpi)`
- `pixelRatio = min(目标像素 / 画布宽度, 4)`
- 上限 4 倍，防止内存爆炸
- **明确不通过放大低分辨率图片来伪造细节**：该导出只是把矢量/文字与已有位图按目标 DPI 栅格化，无法增加原始位图的真实细节

**禁止**：把简单放大的低分辨率图片宣称为提高了真实细节。

## 4. 预检报告

实现位置：`buildPreflightReport(project, context)`。

| 代码 | 级别 | 触发条件 |
| --- | --- | --- |
| `EMPTY_DESIGN` | warning | 项目中没有任何图层 |
| `LOW_RESOLUTION` | error（< 50% 所需像素）/ warning | 图片图层的原始宽度低于按其实际输出尺寸与目标 DPI 计算出的所需像素 |
| `OUTSIDE_SAFE_AREA` | info | 可见图层超出安全区，可能被裁切 |

低分辨率判定：

```
effectiveMm = (placedWidthPx / canvasWidthPx) * targetWidthMm
requiredPx  = requiredPixelsForPrint(effectiveMm, targetDpi)
if naturalWidth < requiredPx -> LOW_RESOLUTION
```

## 5. 出血区与安全区

- 出血（`bleed`）：画布向外的延伸区域，避免裁切露白；模板中以画布像素表示内缩参考线
- 安全区（`safeArea`）：重要内容必须位于此区域内
- 编辑器以不同颜色的虚线参考线展示，线宽与虚线间隔按当前缩放补偿，保证视觉粗细一致

## 6. 产品输出规格

每个模板的 `outputSpec` 包含：`widthMm`、`heightMm`、`dpi`、`format`、`verified`。

- `verified = false` 表示规格未经印刷厂验证（当前全部模板如此）
- 无 `outputSpec` 的模板不能生成印刷参考文件，UI 应禁用对应按钮

## 7. 阶段 6 计划

1. 按供应商规格定义输出模板（尺寸、出血、色彩空间、格式）
2. 支持 PDF / SVG 导出（在供应商确实要求时）
3. 生产级预检：透明背景、字体嵌入、边缘裁切、最小线宽
4. 颜色配置与色彩转换（仅在供应商规格明确时实现，不臆测 CMYK 参数）
5. 输出一致性测试：验证导出尺寸与指定规格一致（含容差）

## 8. 明确不做的事

- 不把屏幕 RGB 效果图描述为已完成专业印刷色彩校准的文件
- 不实现没有供应商依据的专用生产格式
- 不用放大位图冒充高分辨率源文件
- 不把 AI 场景融合结果自动视为印刷生产文件
