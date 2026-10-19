import {
  RGBA_CHANNELS,
  cloneRaster,
  createRaster,
  wrapRaster,
  type RasterImage
} from "../raster";
import {
  normalizeColorAdjust,
  normalizeColorReplace,
  type ColorAdjustInput,
  type ColorAdjustParams,
  type ColorReplaceInput
} from "./params";

const LUMA_RED = 0.299;
const LUMA_GREEN = 0.587;
const LUMA_BLUE = 0.114;

function clampChannel(value: number): number {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return Math.round(value);
}

export function adjustColor(image: RasterImage, input: ColorAdjustInput = {}): RasterImage {
  wrapRaster(image);
  const params = normalizeColorAdjust(input);
  if (params.brightness === 0 && params.contrast === 0 && params.saturation === 0) {
    return cloneRaster(image);
  }

  const brightnessOffset = (params.brightness / 100) * 255;
  const contrastFactor = (100 + params.contrast) / 100;
  const saturationFactor = (100 + params.saturation) / 100;
  const output = createRaster(image.width, image.height);

  for (let index = 0; index < image.data.length; index += RGBA_CHANNELS) {
    const red = (image.data[index] ?? 0) + brightnessOffset;
    const green = (image.data[index + 1] ?? 0) + brightnessOffset;
    const blue = (image.data[index + 2] ?? 0) + brightnessOffset;

    const contrastedRed = 128 + (red - 128) * contrastFactor;
    const contrastedGreen = 128 + (green - 128) * contrastFactor;
    const contrastedBlue = 128 + (blue - 128) * contrastFactor;

    const luma =
      LUMA_RED * contrastedRed + LUMA_GREEN * contrastedGreen + LUMA_BLUE * contrastedBlue;

    output.data[index] = clampChannel(luma + (contrastedRed - luma) * saturationFactor);
    output.data[index + 1] = clampChannel(luma + (contrastedGreen - luma) * saturationFactor);
    output.data[index + 2] = clampChannel(luma + (contrastedBlue - luma) * saturationFactor);
    output.data[index + 3] = image.data[index + 3] ?? 0;
  }
  return output;
}

export function replaceColor(image: RasterImage, input: ColorReplaceInput): RasterImage {
  wrapRaster(image);
  const params = normalizeColorReplace(input);
  const output = createRaster(image.width, image.height);
  for (let index = 0; index < image.data.length; index += RGBA_CHANNELS) {
    const distance = Math.max(
      Math.abs((image.data[index] ?? 0) - params.from[0]),
      Math.abs((image.data[index + 1] ?? 0) - params.from[1]),
      Math.abs((image.data[index + 2] ?? 0) - params.from[2])
    );
    const matched = distance <= params.tolerance;
    output.data[index] = matched ? params.to[0] : (image.data[index] ?? 0);
    output.data[index + 1] = matched ? params.to[1] : (image.data[index + 1] ?? 0);
    output.data[index + 2] = matched ? params.to[2] : (image.data[index + 2] ?? 0);
    output.data[index + 3] = image.data[index + 3] ?? 0;
  }
  return output;
}

export interface ColorVariant {
  id: string;
  label: string;
  adjust: ColorAdjustParams;
}

export const COLOR_VARIANTS: readonly ColorVariant[] = [
  { id: "original", label: "原始", adjust: normalizeColorAdjust({}) },
  { id: "warm", label: "暖色", adjust: normalizeColorAdjust({ brightness: 6, saturation: 18 }) },
  { id: "cool", label: "冷色", adjust: normalizeColorAdjust({ brightness: 4, saturation: 12, contrast: 6 }) },
  { id: "bright", label: "明亮", adjust: normalizeColorAdjust({ brightness: 14, contrast: 8 }) },
  { id: "muted", label: "低饱和", adjust: normalizeColorAdjust({ saturation: -35 }) },
  { id: "deep", label: "浓郁", adjust: normalizeColorAdjust({ contrast: 12, saturation: 25 }) }
];

export function applyVariant(image: RasterImage, variantId: string): RasterImage {
  const variant = COLOR_VARIANTS.find((item) => item.id === variantId);
  if (!variant) {
    return adjustColor(image, {});
  }
  return adjustColor(image, variant.adjust);
}
