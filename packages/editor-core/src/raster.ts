import { RasterError, tooLarge } from "./errors";

export { RasterError };

export const RGBA_CHANNELS = 4;
export const CHANNEL_MAX = 255;
export const MAX_RASTER_PIXELS = 32_000_000;

export interface RasterImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export type Rgba = readonly [number, number, number, number];
export type Rgb = readonly [number, number, number];

export function toRgba(rgb: Rgb, alpha = 255): Rgba {
  return [rgb[0], rgb[1], rgb[2], alpha];
}

export function assertPositiveInt(value: number, label: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new RasterError(`${label} 必须是正整数，收到 ${String(value)}`);
  }
  return value;
}

export function assertChannel(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > CHANNEL_MAX) {
    throw new RasterError(`${label} 必须在 0-255 之间，收到 ${String(value)}`);
  }
  return value;
}

export function assertFiniteInRange(value: number, min: number, max: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new RasterError(`${label} 必须是有限数字，收到 ${String(value)}`);
  }
  if (value < min || value > max) {
    throw new RasterError(`${label} 必须在 ${min}-${max} 之间，收到 ${String(value)}`);
  }
  return value;
}

export function assertIntegerInRange(
  value: number,
  min: number,
  max: number,
  label: string
): number {
  if (!Number.isInteger(value)) {
    throw new RasterError(`${label} 必须是整数，收到 ${String(value)}`);
  }
  return assertFiniteInRange(value, min, max, label);
}

export function assertPixelBudget(
  width: number,
  height: number,
  limit: number = MAX_RASTER_PIXELS
): void {
  if (width * height > limit) {
    throw tooLarge(
      `输出为 ${width}x${height}（${width * height} 像素），超过上限 ${limit} 像素；请降低分辨率或缩放比例`
    );
  }
}

export function createRaster(width: number, height: number): RasterImage {
  assertPositiveInt(width, "图像宽度");
  assertPositiveInt(height, "图像高度");
  assertPixelBudget(width, height);
  return { width, height, data: new Uint8ClampedArray(width * height * RGBA_CHANNELS) };
}

export function wrapRaster(image: RasterImage): RasterImage {
  if (image.width * image.height * RGBA_CHANNELS !== image.data.length) {
    throw new RasterError(
      `图像数据长度 ${image.data.length} 与 ${image.width}x${image.height} 不匹配`
    );
  }
  return image;
}

export function cloneRaster(image: RasterImage): RasterImage {
  wrapRaster(image);
  return { width: image.width, height: image.height, data: image.data.slice() };
}

export function rasterIndex(image: RasterImage, x: number, y: number): number {
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new RasterError("像素坐标必须是整数");
  }
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
    throw new RasterError(`像素坐标越界：(${x}, ${y}) 不在 ${image.width}×${image.height} 内`);
  }
  return (y * image.width + x) * RGBA_CHANNELS;
}

export function setPixel(image: RasterImage, x: number, y: number, rgba: Rgba): void {
  const index = rasterIndex(image, x, y);
  for (let channel = 0; channel < RGBA_CHANNELS; channel += 1) {
    image.data[index + channel] = assertChannel(rgba[channel] ?? 0, "颜色通道");
  }
}

export function getPixel(image: RasterImage, x: number, y: number): Rgba {
  const index = rasterIndex(image, x, y);
  return [
    image.data[index] ?? 0,
    image.data[index + 1] ?? 0,
    image.data[index + 2] ?? 0,
    image.data[index + 3] ?? 0
  ];
}

export function fillRaster(image: RasterImage, rgba: Rgba): void {
  for (let channel = 0; channel < RGBA_CHANNELS; channel += 1) {
    assertChannel(rgba[channel] ?? 0, "颜色通道");
  }
  for (let index = 0; index < image.data.length; index += RGBA_CHANNELS) {
    image.data[index] = rgba[0];
    image.data[index + 1] = rgba[1];
    image.data[index + 2] = rgba[2];
    image.data[index + 3] = rgba[3];
  }
}

export function createRandom(seed: number): () => number {
  if (!Number.isFinite(seed)) {
    throw new RasterError(`随机种子必须是有限数字，收到 ${String(seed)}`);
  }
  let state = Math.trunc(seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1) >>> 0;
    value = (value ^ (value + Math.imul(value ^ (value >>> 7), value | 61))) >>> 0;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeSeed(seed: number | undefined, fallback: number): number {
  if (seed === undefined) return fallback >>> 0;
  if (!Number.isFinite(seed)) {
    throw new RasterError(`随机种子必须是有限数字，收到 ${String(seed)}`);
  }
  return Math.trunc(seed) >>> 0;
}

function mix32(value: number): string {
  let result = value >>> 0;
  result ^= result >>> 16;
  result = Math.imul(result, 0x7feb352d) >>> 0;
  result ^= result >>> 15;
  result = Math.imul(result, 0x846ca68b) >>> 0;
  result ^= result >>> 16;
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function hashRaster(image: RasterImage): string {
  wrapRaster(image);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  const data = image.data;
  for (let index = 0; index < data.length; index += 1) {
    const value = data[index] ?? 0;
    first = Math.imul(first ^ value, 0x01000193);
    second = Math.imul(second + value + 0x9e3779b9, 0x85ebca6b);
  }
  return `${image.width}x${image.height}:${mix32(first)}${mix32(second)}`;
}

export function hashString(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second + code + 0x9e3779b9, 0x85ebca6b);
  }
  return `${mix32(first)}${mix32(second)}`;
}
