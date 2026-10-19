import { RGBA_CHANNELS, cloneRaster, createRaster, wrapRaster, type RasterImage } from "../raster";
import { adjustColor } from "../pattern/color";
import type { ColorAdjustInput } from "../pattern/params";
import {
  normalizeDenoise,
  normalizeOpacity,
  normalizeSharpen,
  type DenoiseParams,
  type SharpenInput,
  type SharpenParams
} from "./params";

function clampByte(value: number): number {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return Math.round(value);
}

export function applyOpacity(image: RasterImage, opacity: number): RasterImage {
  wrapRaster(image);
  const value = normalizeOpacity(opacity);
  if (value === 1) {
    return cloneRaster(image);
  }
  const output = cloneRaster(image);
  for (let index = 3; index < output.data.length; index += RGBA_CHANNELS) {
    output.data[index] = Math.round((output.data[index] ?? 0) * value);
  }
  return output;
}

export interface AdjustmentsInput {
  opacity?: number;
  color?: ColorAdjustInput;
}

export function applyAdjustments(image: RasterImage, input: AdjustmentsInput = {}): RasterImage {
  const opacity = normalizeOpacity(input.opacity ?? 1);
  const adjusted = adjustColor(image, input.color);
  return opacity === 1 ? adjusted : applyOpacity(adjusted, opacity);
}

function blurChannel(
  source: Float64Array,
  target: Float64Array,
  width: number,
  height: number,
  radius: number
): void {
  const window = radius * 2 + 1;
  const scratch = new Float64Array(source.length);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * width;
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleX = Math.min(width - 1, Math.max(0, x + offset));
        sum += source[rowStart + sampleX] ?? 0;
      }
      scratch[rowStart + x] = sum / window;
    }
  }
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      let sum = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleY = Math.min(height - 1, Math.max(0, y + offset));
        sum += scratch[sampleY * width + x] ?? 0;
      }
      target[y * width + x] = sum / window;
    }
  }
}

export function sharpen(image: RasterImage, input: SharpenInput = {}): RasterImage {
  wrapRaster(image);
  const params: SharpenParams = normalizeSharpen(input);
  if (params.amount === 0) {
    return cloneRaster(image);
  }
  const { width, height } = image;
  const pixels = width * height;
  const premultiplied = [
    new Float64Array(pixels),
    new Float64Array(pixels),
    new Float64Array(pixels),
    new Float64Array(pixels)
  ];
  for (let index = 0; index < pixels; index += 1) {
    const base = index * RGBA_CHANNELS;
    const alpha = image.data[base + 3] ?? 0;
    const factor = alpha / 255;
    premultiplied[0]![index] = (image.data[base] ?? 0) * factor;
    premultiplied[1]![index] = (image.data[base + 1] ?? 0) * factor;
    premultiplied[2]![index] = (image.data[base + 2] ?? 0) * factor;
    premultiplied[3]![index] = alpha;
  }

  const blurred = [
    new Float64Array(pixels),
    new Float64Array(pixels),
    new Float64Array(pixels),
    new Float64Array(pixels)
  ];
  for (let channel = 0; channel < RGBA_CHANNELS; channel += 1) {
    blurChannel(premultiplied[channel]!, blurred[channel]!, width, height, params.radius);
  }

  const amount = params.amount / 100;
  const output = createRaster(width, height);
  for (let index = 0; index < pixels; index += 1) {
    const base = index * RGBA_CHANNELS;
    const alphaSharp =
      (premultiplied[3]![index] ?? 0) + amount * ((premultiplied[3]![index] ?? 0) - (blurred[3]![index] ?? 0));
    const alpha = clampByte(alphaSharp);
    const factor = alpha / 255;
    for (let channel = 0; channel < 3; channel += 1) {
      const sharpened =
        (premultiplied[channel]![index] ?? 0) +
        amount * ((premultiplied[channel]![index] ?? 0) - (blurred[channel]![index] ?? 0));
      output.data[base + channel] = factor <= 0 ? 0 : clampByte(sharpened / factor);
    }
    output.data[base + 3] = alpha;
  }
  return output;
}

function medianOfNine(samples: number[]): number {
  for (let index = 1; index < 9; index += 1) {
    const value = samples[index] ?? 0;
    let cursor = index - 1;
    while (cursor >= 0 && (samples[cursor] ?? 0) > value) {
      samples[cursor + 1] = samples[cursor] ?? 0;
      cursor -= 1;
    }
    samples[cursor + 1] = value;
  }
  return samples[4] ?? 0;
}

export function denoise(image: RasterImage, strength = 0): RasterImage {
  wrapRaster(image);
  const params: DenoiseParams = normalizeDenoise(strength);
  if (params.strength === 0) {
    return cloneRaster(image);
  }
  const { width, height } = image;
  const output = cloneRaster(image);
  const mix = params.strength / 100;
  const samples = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const data = image.data;
  const target0 = output.data;

  for (let y = 0; y < height; y += 1) {
    const rowUp = (y > 0 ? y - 1 : 0) * width;
    const rowMid = y * width;
    const rowDown = (y + 1 < height ? y + 1 : height - 1) * width;
    for (let x = 0; x < width; x += 1) {
      const leftX = (x > 0 ? x - 1 : 0) * RGBA_CHANNELS;
      const midX = x * RGBA_CHANNELS;
      const rightX = (x + 1 < width ? x + 1 : width - 1) * RGBA_CHANNELS;
      const up0 = rowUp * RGBA_CHANNELS + leftX;
      const up1 = rowUp * RGBA_CHANNELS + midX;
      const up2 = rowUp * RGBA_CHANNELS + rightX;
      const mid0 = rowMid * RGBA_CHANNELS + leftX;
      const mid1 = rowMid * RGBA_CHANNELS + midX;
      const mid2 = rowMid * RGBA_CHANNELS + rightX;
      const down0 = rowDown * RGBA_CHANNELS + leftX;
      const down1 = rowDown * RGBA_CHANNELS + midX;
      const down2 = rowDown * RGBA_CHANNELS + rightX;
      for (let channel = 0; channel < 3; channel += 1) {
        samples[0] = data[up0 + channel] ?? 0;
        samples[1] = data[up1 + channel] ?? 0;
        samples[2] = data[up2 + channel] ?? 0;
        samples[3] = data[mid0 + channel] ?? 0;
        samples[4] = data[mid1 + channel] ?? 0;
        samples[5] = data[mid2 + channel] ?? 0;
        samples[6] = data[down0 + channel] ?? 0;
        samples[7] = data[down1 + channel] ?? 0;
        samples[8] = data[down2 + channel] ?? 0;
        const middle = medianOfNine(samples);
        const original = target0[mid1 + channel] ?? 0;
        target0[mid1 + channel] = clampByte(original + (middle - original) * mix);
      }
    }
  }
  return output;
}
