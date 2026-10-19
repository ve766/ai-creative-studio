import { RGBA_CHANNELS, wrapRaster, type RasterImage } from "../raster";
import { normalizeAlphaThreshold } from "./params";

export interface TransparentEdgeParams {
  threshold: number;
}

export interface TransparentEdgeInput {
  threshold?: number;
}

export interface TransparentEdgeReport {
  threshold: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
  opaqueRatio: number;
  entirelyTransparent: boolean;
  fullyTransparentPixels: number;
}

export interface TrimResult {
  image: RasterImage;
  report: TransparentEdgeReport;
  changed: boolean;
}

export interface FringeCleanResult {
  image: RasterImage;
  clearedPixels: number;
  threshold: number;
}

function rowHasContent(image: RasterImage, y: number, threshold: number): boolean {
  const rowStart = y * image.width * RGBA_CHANNELS;
  for (let x = 0; x < image.width; x += 1) {
    if ((image.data[rowStart + x * RGBA_CHANNELS + 3] ?? 0) > threshold) return true;
  }
  return false;
}

function columnHasContent(image: RasterImage, x: number, threshold: number): boolean {
  const stride = image.width * RGBA_CHANNELS;
  for (let y = 0; y < image.height; y += 1) {
    if ((image.data[y * stride + x * RGBA_CHANNELS + 3] ?? 0) > threshold) return true;
  }
  return false;
}

export function analyzeTransparentEdges(
  image: RasterImage,
  input: TransparentEdgeInput = {}
): TransparentEdgeReport {
  wrapRaster(image);
  const { threshold } = normalizeAlphaThreshold(input.threshold);

  let top = 0;
  while (top < image.height && !rowHasContent(image, top, threshold)) top += 1;

  let bottom = 0;
  while (bottom < image.height && !rowHasContent(image, image.height - 1 - bottom, threshold)) {
    bottom += 1;
  }

  let left = 0;
  while (left < image.width && !columnHasContent(image, left, threshold)) left += 1;

  let right = 0;
  while (right < image.width && !columnHasContent(image, image.width - 1 - right, threshold)) {
    right += 1;
  }

  let opaque = 0;
  let fullyTransparent = 0;
  for (let index = 3; index < image.data.length; index += RGBA_CHANNELS) {
    const alpha = image.data[index] ?? 0;
    if (alpha > threshold) opaque += 1;
    if (alpha === 0) fullyTransparent += 1;
  }

  const entirelyTransparent = opaque === 0;
  return {
    threshold,
    top: entirelyTransparent ? 0 : top,
    right: entirelyTransparent ? 0 : right,
    bottom: entirelyTransparent ? 0 : bottom,
    left: entirelyTransparent ? 0 : left,
    opaqueRatio: opaque / (image.width * image.height),
    entirelyTransparent,
    fullyTransparentPixels: fullyTransparent
  };
}

export function trimTransparentEdges(
  image: RasterImage,
  input: TransparentEdgeInput = {}
): TrimResult {
  const report = analyzeTransparentEdges(image, input);
  const width = image.width - report.left - report.right;
  const height = image.height - report.top - report.bottom;
  if (report.entirelyTransparent || width <= 0 || height <= 0) {
    return { image, report, changed: false };
  }
  const changed = report.left > 0 || report.right > 0 || report.top > 0 || report.bottom > 0;
  if (!changed) {
    return { image, report, changed: false };
  }

  const output: RasterImage = {
    width,
    height,
    data: new Uint8ClampedArray(width * height * RGBA_CHANNELS)
  };
  const sourceRowBytes = width * RGBA_CHANNELS;
  const sourceStride = image.width * RGBA_CHANNELS;
  for (let y = 0; y < height; y += 1) {
    const sourceStart = (report.top + y) * sourceStride + report.left * RGBA_CHANNELS;
    output.data.set(image.data.subarray(sourceStart, sourceStart + sourceRowBytes), y * sourceRowBytes);
  }
  return { image: output, report, changed: true };
}

export function cleanAlphaFringe(
  image: RasterImage,
  input: TransparentEdgeInput = {}
): FringeCleanResult {
  wrapRaster(image);
  const { threshold } = normalizeAlphaThreshold(input.threshold);
  const output: RasterImage = {
    width: image.width,
    height: image.height,
    data: image.data.slice()
  };
  let clearedPixels = 0;
  for (let index = 0; index < output.data.length; index += RGBA_CHANNELS) {
    const alpha = output.data[index + 3] ?? 0;
    if (alpha === 0 || alpha > threshold) continue;
    output.data[index] = 0;
    output.data[index + 1] = 0;
    output.data[index + 2] = 0;
    output.data[index + 3] = 0;
    clearedPixels += 1;
  }
  return { image: output, clearedPixels, threshold };
}
