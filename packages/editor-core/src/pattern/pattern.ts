import { tooLarge } from "../errors";
import {
  MAX_RASTER_PIXELS,
  hashRaster,
  hashString,
  wrapRaster,
  type RasterImage
} from "../raster";
import { planArrangeLayout, renderLayout, type ArrangeLayout } from "./arrange";
import { adjustColor } from "./color";
import { resizeRaster, rotateRaster } from "./geometry";
import {
  normalizePatternSpec,
  normalizeRenderBudget,
  normalizeArrange,
  type ArrangeParams,
  type PatternSpec,
  type PatternSpecInput,
  type RenderBudget
} from "./params";

export interface PatternPlan {
  mode: "preview" | "final";
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  effectiveScale: number;
  capped: boolean;
  tileCount: number;
  layout: ArrangeLayout;
  params: ArrangeParams;
}

export interface BuiltPattern {
  image: RasterImage;
  fingerprint: string;
  contentHash: string;
  plan: PatternPlan;
  spec: PatternSpec;
}

function scaleArrange(params: ArrangeParams, scale: number): ArrangeParams {
  if (scale === 1) return params;
  return normalizeArrange({
    ...params,
    gapX: Math.round(params.gapX * scale),
    gapY: Math.round(params.gapY * scale),
    jitter: Math.round(params.jitter * scale)
  });
}

export function planPatternRender(
  source: RasterImage,
  input: PatternSpecInput = {},
  budget: RenderBudget = { mode: "final" }
): PatternPlan {
  wrapRaster(source);
  const spec = normalizePatternSpec(input);
  const normalized = normalizeRenderBudget(budget, MAX_RASTER_PIXELS);

  const fullCellWidth = Math.max(1, Math.round(source.width * spec.motifScale));
  const fullCellHeight = Math.max(1, Math.round(source.height * spec.motifScale));
  const fullLayout = planArrangeLayout(fullCellWidth, fullCellHeight, spec);

  let effectiveScale = 1;
  let capped = false;
  if (normalized.mode === "preview") {
    const longest = Math.max(fullLayout.canvasWidth, fullLayout.canvasHeight);
    if (longest > normalized.previewMaxEdge) {
      effectiveScale = normalized.previewMaxEdge / longest;
      capped = true;
    }
  }

  const cellWidth = Math.max(1, Math.round(fullCellWidth * effectiveScale));
  const cellHeight = Math.max(1, Math.round(fullCellHeight * effectiveScale));
  const params = scaleArrange(spec, effectiveScale);
  const layout = effectiveScale === 1 ? fullLayout : planArrangeLayout(cellWidth, cellHeight, params);

  if (normalized.mode === "final" && layout.canvasWidth * layout.canvasHeight > normalized.maxPixels) {
    throw tooLarge(
      `最终输出为 ${layout.canvasWidth}x${layout.canvasHeight}（${
        layout.canvasWidth * layout.canvasHeight
      } 像素），超过上限 ${normalized.maxPixels} 像素；请减少平铺数量、缩小间距或降低图案缩放`
    );
  }

  return {
    mode: normalized.mode,
    width: layout.canvasWidth,
    height: layout.canvasHeight,
    cellWidth,
    cellHeight,
    effectiveScale,
    capped,
    tileCount: layout.placements.length,
    layout,
    params
  };
}

export function patternFingerprint(source: RasterImage, input: PatternSpecInput = {}): string {
  wrapRaster(source);
  const spec = normalizePatternSpec(input);
  return hashString(`${hashRaster(source)}|${JSON.stringify(spec)}`);
}

function prepareMotif(source: RasterImage, spec: PatternSpec, plan: PatternPlan): RasterImage {
  const scaled = resizeRaster(source, plan.cellWidth, plan.cellHeight);
  const rotated =
    spec.rotationDeg === 0 ? scaled : rotateRaster(scaled, spec.rotationDeg, { expand: false });
  return adjustColor(rotated, spec.adjust);
}

export function buildPattern(
  source: RasterImage,
  input: PatternSpecInput = {},
  budget: RenderBudget = { mode: "final" }
): BuiltPattern {
  wrapRaster(source);
  const spec = normalizePatternSpec(input);
  const plan = planPatternRender(source, spec, budget);
  const motif = prepareMotif(source, spec, plan);
  const image = renderLayout(motif, plan.layout);

  return {
    image,
    fingerprint: patternFingerprint(source, spec),
    contentHash: hashRaster(image),
    plan,
    spec
  };
}

export { prepareMotif };
