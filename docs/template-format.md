# 产品模板与坐标系规范

## 1. 两层尺寸概念

这是本项目的核心设计约束，必须严格区分：

| 概念 | 字段 | 含义 |
| --- | --- | --- |
| **工作区画布** | `canvas` | 归一化编辑坐标（最长边 ≤ 2100px），仅用于编辑与预览 |
| **物理输出规格** | `outputSpec` / `print` | 真实毫米尺寸、DPI 与目标格式，用于印刷与预检 |

理由：真实印刷尺寸在 300dpi 下动辄数千像素（A2 海报 420×594mm ≈ 4961×7016px），直接用超大画布会显著拖慢浏览器渲染。模板将画布保持在与输出**相同宽高比**的归一化尺寸，物理尺寸另行记录。

坐标换算：

```
mmPerPx  = outputSpec.widthMm / canvas.width
px       = mm / mmPerPx
requiredPixelsForPrint(mm, dpi) = ceil(mm / 25.4 * dpi)
```

## 2. 模板字段

```ts
interface ProductTemplate {
  id: string;                    // 稳定 ID，永不改变
  schemaVersion: number;         // 模板 Schema 版本
  version: number;               // 模板内容版本，规格变化时必须递增
  category: TemplateCategory;    // 见下
  name: string;
  description: string;
  previewImage: string;          // 预览图路径
  verified: boolean;             // 是否经过印刷厂验证
  example: boolean;              // 是否为示例模板
  canvas: { width; height; backgroundColor; dpi; unit };
  editableArea: { x; y; width; height };
  safeArea: { top; right; bottom; left } | null;
  bleed: { top; right; bottom; left } | null;
  overlays: Array<{ id; kind: 'occlusion' | 'texture' | 'light' | ...; src; opacity; blendMode }>;
  model3d: { src; version; materialName; uvArea } | null;
  outputSpec: { widthMm; heightMm; dpi; format; verified } | null;
}
```

类别：`mug`、`tote-bag`、`tshirt`、`phone-case`、`notebook`、`poster`、`mousepad`、`cushion`、`bottle`、`sticker`。

单位约定：

- `editableArea`、`safeArea`、`bleed` 一律使用**画布像素**（`canvas.unit = 'px'`）
- `outputSpec` 使用**毫米**
- 若未来某个模板改用 mm 坐标系，必须在模板中显式声明并在渲染层做换算

## 3. 版本化规则

1. 模板 ID 是稳定标识，**永不改变**（改名、改类别都不换 ID）
2. 任何影响输出结果的变更（尺寸、可编辑区域、安全区、出血、输出规格）必须递增 `version`
3. 仅文案、预览图等不影响输出的变更可以不递增版本
4. 项目创建时记录 `templateId` + `templateVersion`，**永久锁定**
5. 模板升级不得改变已有项目的设计：读取项目时按其记录的版本渲染，不能自动替换为最新版本
6. 云端化后模板入库，`template_versions` 表保存每个版本快照

## 4. 已验证 vs 示例

- `verified = true`：规格来自供应商确认的正式生产文件
- `verified = false` / `example = true`：来自公开常规数据，**未经印刷验证**

当前 v0.1.0 的 10 个模板**全部为示例模板**（`verified = false`、`example = true`），UI 已用「示例模板」徽标明确标注。

**禁止**在没有真实生产规格的情况下把模板标记为已验证。

## 5. 当前模板清单

| ID | 类别 | 画布 (px) | 输出 (mm) | 出血 (px) | 安全区 (px) |
| --- | --- | --- | --- | --- | --- |
| `mug-standard` | mug | 1600×680 | 200×85 | 24 | 40 |
| `tote-bag-standard` | tote-bag | 1000×1200 | 250×300 | 12 | 40 |
| `tshirt-basic` | tshirt | 1200×1600 | 300×400 | 12 | 60–80 |
| `phone-case-standard` | phone-case | 700×1450 | 70×145 | 20 | 50–80 |
| `notebook-a5` | notebook | 1181×1676 | 148×210 | 24 | 64 |
| `poster-a2` | poster | 1260×1782 | 420×594 | 9 | 30 |
| `mousepad-standard` | mousepad | 1600×600 | 800×300 | 6 | 20 |
| `cushion-square` | cushion | 1200×1200 | 450×450 | 13 | 53 |
| `bottle-standard` | bottle | 800×2100 | 80×210 | 30 | 50 |
| `sticker-square` | sticker | 1000×1000 | 100×100 | 20 | 30 |

## 6. 模板校验

`validateTemplates()` 检查：

- Schema 合法性
- ID 唯一
- 可编辑区域不得超出画布

任何新增模板都必须通过该校验（已有测试覆盖）。

## 7. 叠加层（预留）

`overlays` 用于真实感预览：

- `occlusion`：遮挡层（例如马克杯手柄），渲染在图案之上
- `texture`：表面纹理，使用 `multiply` / `overlay` 等混合模式
- `light`：光照层，使用 `screen` / `soft-light`

当前模板 `overlays` 均为空数组；引入真实预览资源后再填充，且递增模板版本。

## 8. 3D 配置（预留）

`model3d` 约定：

- `src`：glTF/GLB 路径，必须记录来源与授权
- `version`：模型版本
- `materialName`：目标材质名
- `uvArea`：图案映射的 UV 区域

原则：先完成 1–2 种具备可验证 UV 映射的产品，再扩展。禁止用产品照片冒充 3D 编辑。
