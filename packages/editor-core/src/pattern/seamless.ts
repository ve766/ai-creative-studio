import { invalidParam } from "../errors";
import {
  RGBA_CHANNELS,
  assertPixelBudget,
  createRaster,
  rasterIndex,
  wrapRaster,
  type RasterImage
} from "../raster";

export type SeamAxis = "horizontal" | "vertical";

export interface SeamReport {
  axis: SeamAxis;
  pairs: number;
  meanDelta: number;
  maxDelta: number;
}

export interface SeamReportPair {
  horizontal: SeamReport;
  vertical: SeamReport;
}

function seamDelta(
  image: RasterImage,
  axis: SeamAxis,
  first: number,
  second: number
): SeamReport {
  const count = axis === "horizontal" ? image.height : image.width;
  let total = 0;
  let max = 0;
  for (let step = 0; step < count; step += 1) {
    const a =
      axis === "horizontal" ? rasterIndex(image, first, step) : rasterIndex(image, step, first);
    const b =
      axis === "horizontal" ? rasterIndex(image, second, step) : rasterIndex(image, step, second);
    for (let channel = 0; channel < RGBA_CHANNELS; channel += 1) {
      const delta = Math.abs((image.data[a + channel] ?? 0) - (image.data[b + channel] ?? 0));
      total += delta;
      if (delta > max) max = delta;
    }
  }
  const samples = count * RGBA_CHANNELS;
  return {
    axis,
    pairs: count,
    meanDelta: samples === 0 ? 0 : total / samples,
    maxDelta: max
  };
}

export function measureSeam(image: RasterImage, axis: SeamAxis = "horizontal"): SeamReport {
  wrapRaster(image);
  if (image.width < 2 || image.height < 2) {
    throw invalidParam("接缝检查需要至少 2x2 的图像");
  }
  if (axis === "horizontal") {
    return seamDelta(image, axis, 0, image.width - 1);
  }
  return seamDelta(image, axis, 0, image.height - 1);
}

export function measureSeams(image: RasterImage): SeamReportPair {
  return {
    horizontal: measureSeam(image, "horizontal"),
    vertical: measureSeam(image, "vertical")
  };
}

export type SeamlessBlend = "none" | "soft" | "medium" | "strong";

const BLEND_RATIO: Record<SeamlessBlend, number> = {
  none: 0,
  soft: 0.04,
  medium: 0.1,
  strong: 0.2
};

export interface SeamlessInput {
  axis?: SeamAxis | "both";
  blend?: SeamlessBlend;
}

export interface SeamlessResult {
  image: RasterImage;
  appliedBlend: SeamlessBlend;
  bandX: number;
  bandY: number;
}

function blendHorizontal(output: RasterImage, band: number): void {
  if (band <= 0) return;
  const width = output.width;
  const limit = Math.min(band, Math.floor(width / 2));
  for (let x = 0; x < limit; x += 1) {
    const weight = 1 - x / limit;
    const mirrorX = width - 1 - x;
    for (let y = 0; y < output.height; y += 1) {
      const index = (y * width + x) * RGBA_CHANNELS;
      const mirrorIndex = (y * width + mirrorX) * RGBA_CHANNELS;
      for (let channel = 0; channel < RGBA_CHANNELS; channel += 1) {
        const base = output.data[index + channel] ?? 0;
        const mirror = output.data[mirrorIndex + channel] ?? 0;
        output.data[index + channel] = Math.round(base * (1 - weight) + mirror * weight);
      }
    }
  }
}

function blendVertical(output: RasterImage, band: number): void {
  if (band <= 0) return;
  const width = output.width;
  const height = output.height;
  const limit = Math.min(band, Math.floor(height / 2));
  for (let y = 0; y < limit; y += 1) {
    const weight = 1 - y / limit;
    const mirrorY = height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * RGBA_CHANNELS;
      const mirrorIndex = (mirrorY * width + x) * RGBA_CHANNELS;
      for (let channel = 0; channel < RGBA_CHANNELS; channel += 1) {
        const base = output.data[index + channel] ?? 0;
        const mirror = output.data[mirrorIndex + channel] ?? 0;
        output.data[index + channel] = Math.round(base * (1 - weight) + mirror * weight);
      }
    }
  }
}

export function makeSeamless(image: RasterImage, input: SeamlessInput = {}): SeamlessResult {
  wrapRaster(image);
  const axis = input.axis ?? "both";
  if (axis !== "horizontal" && axis !== "vertical" && axis !== "both") {
    throw invalidParam(`接缝方向必须是 horizontal / vertical / both，收到 ${String(axis)}`);
  }
  const blend = input.blend ?? "medium";
  if (!(blend in BLEND_RATIO)) {
    throw invalidParam(`融合强度必须是 none / soft / medium / strong，收到 ${String(blend)}`);
  }
  assertPixelBudget(image.width, image.height);

  const ratio = BLEND_RATIO[blend];
  const bandX =
    axis === "horizontal" || axis === "both" ? Math.max(1, Math.round(image.width * ratio)) : 0;
  const bandY =
    axis === "vertical" || axis === "both" ? Math.max(1, Math.round(image.height * ratio)) : 0;

  const output = createRaster(image.width, image.height);
  output.data.set(image.data);

  if (ratio > 0) {
    blendHorizontal(output, bandX);
    blendVertical(output, bandY);
  }

  return {
    image: output,
    appliedBlend: blend,
    bandX: ratio > 0 ? bandX : 0,
    bandY: ratio > 0 ? bandY : 0
  };
}
