import {
  RasterError,
  RGBA_CHANNELS,
  createRandom,
  createRaster,
  fillRaster,
  hashRaster,
  rasterIndex,
  setPixel,
  getPixel,
  toRgba
} from "./raster";

export {
  RasterError as FixtureError,
  RGBA_CHANNELS,
  createRandom,
  createRaster,
  fillRaster,
  hashRaster,
  rasterIndex,
  setPixel,
  getPixel
};
export type { RasterImage, Rgba, Rgb } from "./raster";

import type { RasterImage, Rgb } from "./raster";

export const MAX_FIXTURE_PIXELS = 32_000_000;

function assertPositiveInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RasterError(`${label} 必须是正整数，收到 ${String(value)}`);
  }
}

function assertChannel(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 255) {
    throw new RasterError(`${label} 必须是 0–255 的有限数字，收到 ${String(value)}`);
  }
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
    throw new RasterError(`噪声幅度必须在 0–255 之间，收到 ${String(amplitude)}`);
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

export function fillTransparentBorder(
  image: RasterImage,
  options: TransparentBorderOptions = {}
): void {
  const thickness = options.thickness ?? 2;
  assertPositiveInt(thickness, "透明边框厚度");
  if (thickness * 2 >= Math.min(image.width, image.height)) {
    throw new RasterError("透明边框厚度超过素材尺寸");
  }
  fillRaster(image, toRgba(options.opaque ?? [200, 40, 40]));
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
