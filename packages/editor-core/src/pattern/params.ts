import { requireFiniteInRange, requireIntegerInRange, requirePositiveInt } from "../validate";
import { invalidParam } from "../errors";
import type { Rgb } from "../raster";

export const MAX_TILE_COUNT = 64;
export const MAX_GAP = 4096;
export const MAX_JITTER = 1024;
export const MIN_MOTIF_SCALE = 0.02;
export const MAX_MOTIF_SCALE = 8;
export const MAX_ARRANGE_CELLS = MAX_TILE_COUNT * MAX_TILE_COUNT;
export const DEFAULT_SEED = 20261019;

export interface TileRepeatParams {
  columns: number;
  rows: number;
}

export interface TileRepeatInput {
  columns?: number;
  rows?: number;
}

export function normalizeTileRepeat(input: TileRepeatInput = {}): TileRepeatParams {
  return {
    columns: requireIntegerInRange(input.columns ?? 2, 1, MAX_TILE_COUNT, "平铺列数"),
    rows: requireIntegerInRange(input.rows ?? 2, 1, MAX_TILE_COUNT, "平铺行数")
  };
}

export type MirrorMode = "horizontal" | "vertical" | "both";

const MIRROR_MODES: readonly MirrorMode[] = ["horizontal", "vertical", "both"];

export interface MirrorTileParams extends TileRepeatParams {
  mode: MirrorMode;
}

export interface MirrorTileInput extends TileRepeatInput {
  mode?: string;
}

export function normalizeMirrorTile(input: MirrorTileInput = {}): MirrorTileParams {
  const base = normalizeTileRepeat(input);
  const mode = input.mode ?? "both";
  if (!MIRROR_MODES.includes(mode as MirrorMode)) {
    throw invalidParam(`镜像模式必须是 ${MIRROR_MODES.join(" / ")}，收到 ${String(mode)}`);
  }
  return { ...base, mode: mode as MirrorMode };
}

export type ArrangePattern = "grid" | "offset" | "half-drop";

const ARRANGE_PATTERNS: readonly ArrangePattern[] = ["grid", "offset", "half-drop"];

export interface ArrangeParams {
  columns: number;
  rows: number;
  pattern: ArrangePattern;
  gapX: number;
  gapY: number;
  jitter: number;
  seed: number;
}

export interface ArrangeInput {
  columns?: number;
  rows?: number;
  pattern?: string;
  gapX?: number;
  gapY?: number;
  jitter?: number;
  seed?: number;
}

export function normalizeArrange(input: ArrangeInput = {}): ArrangeParams {
  const columns = requireIntegerInRange(input.columns ?? 3, 1, MAX_TILE_COUNT, "排列列数");
  const rows = requireIntegerInRange(input.rows ?? 3, 1, MAX_TILE_COUNT, "排列行数");
  if (columns * rows > MAX_ARRANGE_CELLS) {
    throw invalidParam(`排列单元总数 ${columns * rows} 超过上限 ${MAX_ARRANGE_CELLS}`);
  }
  const pattern = input.pattern ?? "grid";
  if (!ARRANGE_PATTERNS.includes(pattern as ArrangePattern)) {
    throw invalidParam(`排列方式必须是 ${ARRANGE_PATTERNS.join(" / ")}，收到 ${String(pattern)}`);
  }
  return {
    columns,
    rows,
    pattern: pattern as ArrangePattern,
    gapX: requireIntegerInRange(input.gapX ?? 0, 0, MAX_GAP, "水平间距"),
    gapY: requireIntegerInRange(input.gapY ?? 0, 0, MAX_GAP, "垂直间距"),
    jitter: requireIntegerInRange(input.jitter ?? 0, 0, MAX_JITTER, "抖动幅度"),
    seed: requireIntegerInRange(input.seed ?? DEFAULT_SEED, 0, 0xffffffff, "随机种子")
  };
}

export interface ColorAdjustParams {
  brightness: number;
  contrast: number;
  saturation: number;
}

export interface ColorAdjustInput {
  brightness?: number;
  contrast?: number;
  saturation?: number;
}

export function normalizeColorAdjust(input: ColorAdjustInput = {}): ColorAdjustParams {
  return {
    brightness: requireFiniteInRange(input.brightness ?? 0, -100, 100, "亮度"),
    contrast: requireFiniteInRange(input.contrast ?? 0, -100, 100, "对比度"),
    saturation: requireFiniteInRange(input.saturation ?? 0, -100, 100, "饱和度")
  };
}

export interface ColorReplaceParams {
  from: Rgb;
  to: Rgb;
  tolerance: number;
}

export interface ColorReplaceInput {
  from: readonly number[];
  to: readonly number[];
  tolerance?: number;
}

function normalizeColorTriplet(value: readonly number[], label: string): Rgb {
  if (value.length !== 3) {
    throw invalidParam(`${label} 必须是 [r, g, b] 三个通道，收到 ${value.length} 个`);
  }
  return [
    requireIntegerInRange(value[0] ?? Number.NaN, 0, 255, `${label} R`),
    requireIntegerInRange(value[1] ?? Number.NaN, 0, 255, `${label} G`),
    requireIntegerInRange(value[2] ?? Number.NaN, 0, 255, `${label} B`)
  ];
}

export function normalizeColorReplace(input: ColorReplaceInput): ColorReplaceParams {
  return {
    from: normalizeColorTriplet(input.from, "源颜色"),
    to: normalizeColorTriplet(input.to, "目标颜色"),
    tolerance: requireFiniteInRange(input.tolerance ?? 0, 0, 255, "容差")
  };
}

export interface PatternSpec extends ArrangeParams {
  motifScale: number;
  rotationDeg: number;
  adjust: ColorAdjustParams;
}

export interface PatternSpecInput extends ArrangeInput {
  motifScale?: number;
  rotationDeg?: number;
  adjust?: ColorAdjustInput;
}

export function normalizePatternSpec(input: PatternSpecInput = {}): PatternSpec {
  const arrange = normalizeArrange(input);
  return {
    ...arrange,
    motifScale: requireFiniteInRange(
      input.motifScale ?? 1,
      MIN_MOTIF_SCALE,
      MAX_MOTIF_SCALE,
      "图案缩放"
    ),
    rotationDeg: requireFiniteInRange(input.rotationDeg ?? 0, -180, 180, "图案旋转"),
    adjust: normalizeColorAdjust(input.adjust)
  };
}

export interface RenderBudget {
  mode: "preview" | "final";
  previewMaxEdge?: number;
  maxPixels?: number;
}

export const DEFAULT_PREVIEW_MAX_EDGE = 512;

export interface NormalizedRenderBudget {
  mode: "preview" | "final";
  previewMaxEdge: number;
  maxPixels: number;
}

export function normalizeRenderBudget(
  input: RenderBudget,
  maxPixelsDefault: number
): NormalizedRenderBudget {
  if (input.mode !== "preview" && input.mode !== "final") {
    throw invalidParam(`渲染模式必须是 preview / final，收到 ${String(input.mode)}`);
  }
  return {
    mode: input.mode,
    previewMaxEdge: requirePositiveInt(input.previewMaxEdge ?? DEFAULT_PREVIEW_MAX_EDGE, "预览最大边长"),
    maxPixels: requirePositiveInt(input.maxPixels ?? maxPixelsDefault, "像素上限")
  };
}
