import { invalidParam } from "../errors";
import {
  MAX_RASTER_PIXELS,
  type RasterImage
} from "../raster";
import {
  requireFiniteInRange,
  requireIntegerInRange,
  requirePositiveInt
} from "../validate";

export const DEFAULT_ALPHA_THRESHOLD = 16;
export const DEFAULT_SHARPEN_AMOUNT = 0;
export const MAX_SHARPEN_RADIUS = 3;
export const DEFAULT_DENOISE_STRENGTH = 0;
export const DEFAULT_TARGET_DPI = 300;

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropRectInput {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export function assertCropRectInside(image: RasterImage, rect: CropRect): void {
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > image.width || rect.y + rect.height > image.height) {
    throw invalidParam(
      `裁切区域 (${rect.x}, ${rect.y}, ${rect.width}x${rect.height}) 超出图像 ${image.width}x${image.height}`
    );
  }
}

export function normalizeCropRect(image: RasterImage, input: CropRectInput): CropRect {
  const x = requireIntegerInRange(input.x ?? 0, 0, image.width, "裁切起点 x");
  const y = requireIntegerInRange(input.y ?? 0, 0, image.height, "裁切起点 y");
  const width = requirePositiveInt(input.width, "裁切宽度");
  const height = requirePositiveInt(input.height, "裁切高度");
  const rect: CropRect = { x, y, width, height };
  assertCropRectInside(image, rect);
  return rect;
}

export function clampCropRect(image: RasterImage, input: CropRectInput): CropRect {
  const width = requirePositiveInt(input.width, "裁切宽度");
  const height = requirePositiveInt(input.height, "裁切高度");
  const x = Math.min(Math.max(Math.trunc(input.x ?? 0), 0), Math.max(0, image.width - 1));
  const y = Math.min(Math.max(Math.trunc(input.y ?? 0), 0), Math.max(0, image.height - 1));
  const clampedWidth = Math.min(width, image.width - x);
  const clampedHeight = Math.min(height, image.height - y);
  if (clampedWidth <= 0 || clampedHeight <= 0) {
    throw invalidParam(`裁切区域经过边界收缩后为空（起点 ${x}, ${y}）`);
  }
  return { x, y, width: clampedWidth, height: clampedHeight };
}

export type ResizeMode = "exact" | "fit-max-edge" | "print";

export interface ResizeRequest {
  mode: ResizeMode;
  width?: number;
  height?: number;
  maxEdge?: number;
  widthMm?: number;
  dpi?: number;
  maxPixels?: number;
}

export interface ResizePlan {
  mode: ResizeMode;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  upscale: boolean;
  capped: boolean;
  reason: string;
}

function fitInsideMaxPixels(
  width: number,
  height: number,
  maxPixels: number
): { width: number; height: number; capped: boolean } {
  if (width * height <= maxPixels) {
    return { width, height, capped: false };
  }
  const scale = Math.sqrt(maxPixels / (width * height));
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
    capped: true
  };
}

export function planResize(image: RasterImage, request: ResizeRequest): ResizePlan {
  const maxPixels = requirePositiveInt(request.maxPixels ?? MAX_RASTER_PIXELS, "像素上限");

  if (request.mode === "exact") {
    const width = requirePositiveInt(request.width ?? Number.NaN, "目标宽度");
    const height = requirePositiveInt(request.height ?? Number.NaN, "目标高度");
    const fitted = fitInsideMaxPixels(width, height, maxPixels);
    return {
      mode: request.mode,
      width: fitted.width,
      height: fitted.height,
      scaleX: fitted.width / image.width,
      scaleY: fitted.height / image.height,
      upscale: fitted.width > image.width || fitted.height > image.height,
      capped: fitted.capped,
      reason: fitted.capped
        ? `目标 ${width}x${height} 超过像素上限 ${maxPixels}，已按比例缩小`
        : "按指定尺寸输出"
    };
  }

  if (request.mode === "fit-max-edge") {
    const maxEdge = requirePositiveInt(request.maxEdge ?? Number.NaN, "最大边长");
    const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    return {
      mode: request.mode,
      width,
      height,
      scaleX: width / image.width,
      scaleY: height / image.height,
      upscale: false,
      capped: scale < 1,
      reason: scale < 1 ? `最长边限制为 ${maxEdge}px` : "原图未超过限制，保持原尺寸"
    };
  }

  if (request.mode === "print") {
    const widthMm = requireFiniteInRange(request.widthMm ?? Number.NaN, 1, 100000, "印刷宽度(mm)");
    const dpi = requireFiniteInRange(request.dpi ?? DEFAULT_TARGET_DPI, 1, 2400, "目标 DPI");
    const pixelsPerMm = dpi / 25.4;
    const desiredWidth = Math.max(1, Math.ceil(widthMm * pixelsPerMm));
    const aspect = image.height / image.width;
    const desiredHeight = Math.max(1, Math.round(desiredWidth * aspect));
    const fitted = fitInsideMaxPixels(desiredWidth, desiredHeight, maxPixels);
    return {
      mode: request.mode,
      width: fitted.width,
      height: fitted.height,
      scaleX: fitted.width / image.width,
      scaleY: fitted.height / image.height,
      upscale: fitted.width > image.width,
      capped: fitted.capped,
      reason: fitted.capped
        ? `目标 ${desiredWidth}x${desiredHeight} 超过像素上限 ${maxPixels}，已按比例缩小`
        : `按 ${widthMm}mm @ ${dpi}dpi 输出`
    };
  }

  throw invalidParam(`缩放模式必须是 exact / fit-max-edge / print，收到 ${String(request.mode)}`);
}

export interface OpacityParams {
  opacity: number;
}

export function normalizeOpacity(value: number): number {
  return requireFiniteInRange(value, 0, 1, "不透明度");
}

export interface SharpenParams {
  amount: number;
  radius: number;
}

export interface SharpenInput {
  amount?: number;
  radius?: number;
}

export function normalizeSharpen(input: SharpenInput = {}): SharpenParams {
  return {
    amount: requireFiniteInRange(input.amount ?? DEFAULT_SHARPEN_AMOUNT, 0, 100, "锐化强度"),
    radius: requireIntegerInRange(input.radius ?? 1, 1, MAX_SHARPEN_RADIUS, "锐化半径")
  };
}

export interface DenoiseParams {
  strength: number;
}

export function normalizeDenoise(strength = DEFAULT_DENOISE_STRENGTH): DenoiseParams {
  return { strength: requireFiniteInRange(strength, 0, 100, "去噪强度") };
}

export interface AlphaThresholdParams {
  threshold: number;
}

export function normalizeAlphaThreshold(threshold = DEFAULT_ALPHA_THRESHOLD): AlphaThresholdParams {
  return { threshold: requireIntegerInRange(threshold, 1, 254, "透明阈值") };
}

export interface OutputSpec {
  widthMm: number;
  heightMm?: number;
  dpi: number;
  minimumDpi?: number;
}

export interface NormalizedOutputSpec {
  widthMm: number;
  heightMm: number | null;
  dpi: number;
  minimumDpi: number;
}

export function normalizeOutputSpec(input: OutputSpec): NormalizedOutputSpec {
  const widthMm = requireFiniteInRange(input.widthMm, 0.1, 100000, "输出宽度(mm)");
  const heightMm =
    input.heightMm === undefined
      ? null
      : requireFiniteInRange(input.heightMm, 0.1, 100000, "输出高度(mm)");
  const dpi = requireFiniteInRange(input.dpi, 1, 2400, "目标 DPI");
  const minimumDpi = requireFiniteInRange(input.minimumDpi ?? Math.min(dpi, 150), 1, 2400, "最低 DPI");
  return { widthMm, heightMm, dpi, minimumDpi };
}
