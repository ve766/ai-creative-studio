import { RasterError } from "../errors";
import {
  RGBA_CHANNELS,
  assertPixelBudget,
  cloneRaster,
  createRaster,
  rasterIndex,
  wrapRaster,
  type RasterImage
} from "../raster";
import { requireFiniteInRange, requirePositiveInt } from "../validate";

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function sampleBilinear(image: RasterImage, x: number, y: number, channel: number): number {
  const clampedX = Math.min(image.width - 1, Math.max(0, x));
  const clampedY = Math.min(image.height - 1, Math.max(0, y));
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(image.width - 1, x0 + 1);
  const y1 = Math.min(image.height - 1, y0 + 1);
  const fx = clampedX - x0;
  const fy = clampedY - y0;
  const p00 = image.data[rasterIndex(image, x0, y0) + channel] ?? 0;
  const p10 = image.data[rasterIndex(image, x1, y0) + channel] ?? 0;
  const p01 = image.data[rasterIndex(image, x0, y1) + channel] ?? 0;
  const p11 = image.data[rasterIndex(image, x1, y1) + channel] ?? 0;
  const top = p00 + (p10 - p00) * fx;
  const bottom = p01 + (p11 - p01) * fx;
  return top + (bottom - top) * fy;
}

export function resizeRaster(
  image: RasterImage,
  targetWidth: number,
  targetHeight: number
): RasterImage {
  wrapRaster(image);
  requirePositiveInt(targetWidth, "目标宽度");
  requirePositiveInt(targetHeight, "目标高度");
  assertPixelBudget(targetWidth, targetHeight);

  if (targetWidth === image.width && targetHeight === image.height) {
    return cloneRaster(image);
  }

  const output = createRaster(targetWidth, targetHeight);
  const scaleX = image.width / targetWidth;
  const scaleY = image.height / targetHeight;
  const downscaling = scaleX > 1 || scaleY > 1;

  if (!downscaling) {
    for (let y = 0; y < targetHeight; y += 1) {
      const sourceY = (y + 0.5) * scaleY - 0.5;
      for (let x = 0; x < targetWidth; x += 1) {
        const sourceX = (x + 0.5) * scaleX - 0.5;
        const index = (y * targetWidth + x) * RGBA_CHANNELS;
        for (let channel = 0; channel < RGBA_CHANNELS; channel += 1) {
          output.data[index + channel] = Math.round(
            sampleBilinear(image, sourceX, sourceY, channel)
          );
        }
      }
    }
    return output;
  }

  for (let y = 0; y < targetHeight; y += 1) {
    const top = y * scaleY;
    const bottom = Math.min(image.height, (y + 1) * scaleY);
    for (let x = 0; x < targetWidth; x += 1) {
      const left = x * scaleX;
      const right = Math.min(image.width, (x + 1) * scaleX);
      const index = (y * targetWidth + x) * RGBA_CHANNELS;
      const sums = [0, 0, 0, 0];
      let weight = 0;
      const sourceWidth = image.width;
      const sourceData = image.data;
      for (let sourceY = Math.floor(top); sourceY < Math.ceil(bottom); sourceY += 1) {
        if (sourceY < 0 || sourceY >= image.height) continue;
        const weightY = Math.min(bottom, sourceY + 1) - Math.max(top, sourceY);
        if (weightY <= 0) continue;
        const rowStart = sourceY * sourceWidth;
        for (let sourceX = Math.floor(left); sourceX < Math.ceil(right); sourceX += 1) {
          if (sourceX < 0 || sourceX >= sourceWidth) continue;
          const weightX = Math.min(right, sourceX + 1) - Math.max(left, sourceX);
          if (weightX <= 0) continue;
          const area = weightX * weightY;
          const pixel = (rowStart + sourceX) * RGBA_CHANNELS;
          for (let channel = 0; channel < RGBA_CHANNELS; channel += 1) {
            sums[channel] = (sums[channel] ?? 0) + (sourceData[pixel + channel] ?? 0) * area;
          }
          weight += area;
        }
      }
      if (weight === 0) {
        throw new RasterError("缩小时找不到有效源像素，请检查目标尺寸");
      }
      for (let channel = 0; channel < RGBA_CHANNELS; channel += 1) {
        output.data[index + channel] = Math.round((sums[channel] ?? 0) / weight);
      }
    }
  }
  return output;
}

export interface RotateOptions {
  expand?: boolean;
}

export function rotateRaster(
  image: RasterImage,
  degrees: number,
  options: RotateOptions = {}
): RasterImage {
  wrapRaster(image);
  requireFiniteInRange(degrees, -360, 360, "旋转角度");
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const expand = options.expand ?? false;

  const sourceCenterX = image.width / 2;
  const sourceCenterY = image.height / 2;
  const targetWidth = expand
    ? Math.max(1, Math.ceil(Number((Math.abs(image.width * cos) + Math.abs(image.height * sin)).toFixed(6))))
    : image.width;
  const targetHeight = expand
    ? Math.max(1, Math.ceil(Number((Math.abs(image.width * sin) + Math.abs(image.height * cos)).toFixed(6))))
    : image.height;
  assertPixelBudget(targetWidth, targetHeight);

  const output = createRaster(targetWidth, targetHeight);
  const targetCenterX = targetWidth / 2;
  const targetCenterY = targetHeight / 2;

  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const dx = x + 0.5 - targetCenterX;
      const dy = y + 0.5 - targetCenterY;
      const sourceX = dx * cos + dy * sin + sourceCenterX - 0.5;
      const sourceY = -dx * sin + dy * cos + sourceCenterY - 0.5;
      if (sourceX < -0.5 || sourceY < -0.5 || sourceX > image.width - 0.5 || sourceY > image.height - 0.5) {
        continue;
      }
      const index = (y * targetWidth + x) * RGBA_CHANNELS;
      for (let channel = 0; channel < RGBA_CHANNELS; channel += 1) {
        output.data[index + channel] = Math.round(
          clamp01(sampleBilinear(image, sourceX, sourceY, channel) / 255) * 255
        );
      }
    }
  }
  return output;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function cropRaster(image: RasterImage, rect: CropRect): RasterImage {
  wrapRaster(image);
  if (!Number.isInteger(rect.x) || !Number.isInteger(rect.y)) {
    throw new RasterError("裁切起点必须是整数");
  }
  requirePositiveInt(rect.width, "裁切宽度");
  requirePositiveInt(rect.height, "裁切高度");
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > image.width || rect.y + rect.height > image.height) {
    throw new RasterError(
      `裁切区域 (${rect.x}, ${rect.y}, ${rect.width}x${rect.height}) 超出 ${image.width}x${image.height}`
    );
  }
  const output = createRaster(rect.width, rect.height);
  const rowBytes = rect.width * RGBA_CHANNELS;
  for (let y = 0; y < rect.height; y += 1) {
    const sourceStart = ((rect.y + y) * image.width + rect.x) * RGBA_CHANNELS;
    output.data.set(image.data.subarray(sourceStart, sourceStart + rowBytes), y * rowBytes);
  }
  return output;
}
