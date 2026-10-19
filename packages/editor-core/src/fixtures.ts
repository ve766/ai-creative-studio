export const RGBA_CHANNELS = 4;
export const MAX_FIXTURE_PIXELS = 32_000_000;

export interface RasterImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export type Rgba = readonly [number, number, number, number];
export type Rgb = readonly [number, number, number];

export class FixtureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FixtureError";
  }
}

function assertPositiveInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new FixtureError(`${label} 必须是正整数，收到 ${String(value)}`);
  }
}

function assertChannel(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 255) {
    throw new FixtureError(`${label} 必须是 0–255 的有限数字，收到 ${String(value)}`);
  }
}

export function createRaster(width: number, height: number): RasterImage {
  assertPositiveInt(width, "宽度");
  assertPositiveInt(height, "高度");
  if (width * height > MAX_FIXTURE_PIXELS) {
    throw new FixtureError(`素材像素数超过上限 ${MAX_FIXTURE_PIXELS}`);
  }
  return { width, height, data: new Uint8ClampedArray(width * height * RGBA_CHANNELS) };
}

export function rasterIndex(image: RasterImage, x: number, y: number): number {
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new FixtureError("像素坐标必须是整数");
  }
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
    throw new FixtureError(`像素坐标越界：(${x}, ${y}) 不在 ${image.width}×${image.height} 内`);
  }
  return (y * image.width + x) * RGBA_CHANNELS;
}

export function setPixel(image: RasterImage, x: number, y: number, rgba: Rgba): void {
  for (const channel of rgba) assertChannel(channel, "颜色通道");
  const index = rasterIndex(image, x, y);
  image.data[index] = rgba[0];
  image.data[index + 1] = rgba[1];
  image.data[index + 2] = rgba[2];
  image.data[index + 3] = rgba[3];
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
  for (const channel of rgba) assertChannel(channel, "颜色通道");
  for (let index = 0; index < image.data.length; index += RGBA_CHANNELS) {
    image.data[index] = rgba[0];
    image.data[index + 1] = rgba[1];
    image.data[index + 2] = rgba[2];
    image.data[index + 3] = rgba[3];
  }
}

export function createRandom(seed: number): () => number {
  if (!Number.isFinite(seed)) throw new FixtureError(`随机种子必须是有限数字，收到 ${String(seed)}`);
  let state = Math.floor(seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CheckerOptions {
  cellSize?: number;
  colorA?: Rgb;
  colorB?: Rgb;
  alpha?: number;
}

export function fillChecker(image: RasterImage, options: CheckerOptions = {}): void {
  const cellSize = options.cellSize ?? 32;
  assertPositiveInt(cellSize, "格子尺寸");
  const colorA = options.colorA ?? [255, 255, 255];
  const colorB = options.colorB ?? [0, 0, 0];
  const alpha = options.alpha ?? 255;
  assertChannel(alpha, "透明度");
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const onA = (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0;
      const color = onA ? colorA : colorB;
      const index = (y * image.width + x) * RGBA_CHANNELS;
      image.data[index] = color[0];
      image.data[index + 1] = color[1];
      image.data[index + 2] = color[2];
      image.data[index + 3] = alpha;
    }
  }
}

export type GradientAxis = "x" | "y" | "diagonal";

export interface GradientOptions {
  from?: Rgb;
  to?: Rgb;
  axis?: GradientAxis;
  alpha?: number;
}

export function fillGradient(image: RasterImage, options: GradientOptions = {}): void {
  const from = options.from ?? [0, 0, 0];
  const to = options.to ?? [255, 255, 255];
  const axis = options.axis ?? "x";
  const alpha = options.alpha ?? 255;
  assertChannel(alpha, "透明度");
  const spanX = Math.max(1, image.width - 1);
  const spanY = Math.max(1, image.height - 1);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const ratio =
        axis === "x" ? x / spanX : axis === "y" ? y / spanY : (x / spanX + y / spanY) / 2;
      const index = (y * image.width + x) * RGBA_CHANNELS;
      image.data[index] = Math.round(from[0] + (to[0] - from[0]) * ratio);
      image.data[index + 1] = Math.round(from[1] + (to[1] - from[1]) * ratio);
      image.data[index + 2] = Math.round(from[2] + (to[2] - from[2]) * ratio);
      image.data[index + 3] = alpha;
    }
  }
}

export interface NoiseOptions {
  seed: number;
  amplitude?: number;
  monochrome?: boolean;
}

export function addNoise(image: RasterImage, options: NoiseOptions): void {
  const amplitude = options.amplitude ?? 32;
  if (!Number.isFinite(amplitude) || amplitude < 0 || amplitude > 255) {
    throw new FixtureError(`噪声幅度必须在 0–255 之间，收到 ${String(amplitude)}`);
  }
  const random = createRandom(options.seed);
  const monochrome = options.monochrome ?? true;
  const offset = () => Math.round((random() * 2 - 1) * amplitude);
  for (let index = 0; index < image.data.length; index += RGBA_CHANNELS) {
    if (monochrome) {
      const delta = offset();
      image.data[index] = (image.data[index] ?? 0) + delta;
      image.data[index + 1] = (image.data[index + 1] ?? 0) + delta;
      image.data[index + 2] = (image.data[index + 2] ?? 0) + delta;
    } else {
      image.data[index] = (image.data[index] ?? 0) + offset();
      image.data[index + 1] = (image.data[index + 1] ?? 0) + offset();
      image.data[index + 2] = (image.data[index + 2] ?? 0) + offset();
    }
  }
}

export interface TransparentBorderOptions {
  thickness?: number;
  opaque?: Rgb;
}

export function fillTransparentBorder(image: RasterImage, options: TransparentBorderOptions = {}): void {
  const thickness = options.thickness ?? 2;
  assertPositiveInt(thickness, "透明边框厚度");
  if (thickness * 2 >= Math.min(image.width, image.height)) {
    throw new FixtureError("透明边框厚度超过素材尺寸");
  }
  fillRaster(image, [...(options.opaque ?? [200, 40, 40]), 255] as Rgba);
  const maxX = image.width - thickness;
  const maxY = image.height - thickness;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const onBorder = x < thickness || y < thickness || x >= maxX || y >= maxY;
      if (!onBorder) continue;
      image.data[(y * image.width + x) * RGBA_CHANNELS + 3] = 0;
    }
  }
}

export function hashRaster(image: RasterImage): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  const data = image.data;
  for (let index = 0; index < data.length; index += 1) {
    const value = data[index] ?? 0;
    first = Math.imul(first ^ value, 0x01000193);
    second = Math.imul(second + value + 0x9e3779b9, 0x85ebca6b);
  }
  const mix = (value: number): string => {
    let result = value >>> 0;
    result ^= result >>> 16;
    result = Math.imul(result, 0x7feb352d) >>> 0;
    result ^= result >>> 15;
    result = Math.imul(result, 0x846ca68b) >>> 0;
    result ^= result >>> 16;
    return (result >>> 0).toString(16).padStart(8, "0");
  };
  return `${image.width}x${image.height}:${mix(first)}${mix(second)}`;
}

export const FIXTURE_NAMES = [
  "checker-tiny",
  "checker-medium",
  "gradient-small",
  "noise-medium",
  "alpha-border-small"
] as const;

export type FixtureName = (typeof FIXTURE_NAMES)[number];

export function createFixture(name: FixtureName): RasterImage {
  switch (name) {
    case "checker-tiny": {
      const image = createRaster(8, 8);
      fillChecker(image, { cellSize: 2 });
      return image;
    }
    case "checker-medium": {
      const image = createRaster(256, 256);
      fillChecker(image, { cellSize: 32, colorA: [24, 88, 168], colorB: [248, 240, 216] });
      return image;
    }
    case "gradient-small": {
      const image = createRaster(64, 64);
      fillGradient(image, { from: [0, 0, 0], to: [255, 255, 255], axis: "diagonal" });
      return image;
    }
    case "noise-medium": {
      const image = createRaster(256, 256);
      fillChecker(image, { cellSize: 16, colorA: [128, 128, 128], colorB: [96, 96, 96] });
      addNoise(image, { seed: 20261019, amplitude: 24, monochrome: true });
      return image;
    }
    case "alpha-border-small": {
      const image = createRaster(64, 64);
      fillTransparentBorder(image, { thickness: 4 });
      return image;
    }
  }
}

export const BENCH_SIZES = [256, 512, 1024, 2048] as const;
