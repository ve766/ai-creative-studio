import { cropRaster, resizeRaster, type CropRect } from "../pattern/geometry";
import { hashRaster, type RasterImage } from "../raster";
import {
  assertCropRectInside,
  clampCropRect,
  normalizeCropRect,
  planResize,
  type CropRectInput,
  type ResizePlan,
  type ResizeRequest
} from "./params";

export interface CropResult {
  image: RasterImage;
  rect: CropRect;
  contentHash: string;
}

export function cropImage(image: RasterImage, rect: CropRectInput): CropResult {
  const normalized = normalizeCropRect(image, rect);
  const cropped = cropRaster(image, normalized);
  return { image: cropped, rect: normalized, contentHash: hashRaster(cropped) };
}

export function cropImageClamped(image: RasterImage, rect: CropRectInput): CropResult {
  const normalized = clampCropRect(image, rect);
  assertCropRectInside(image, normalized);
  const cropped = cropRaster(image, normalized);
  return { image: cropped, rect: normalized, contentHash: hashRaster(cropped) };
}

export interface ResizeResult {
  image: RasterImage;
  plan: ResizePlan;
  contentHash: string;
  resampled: boolean;
}

export function resizeImage(image: RasterImage, request: ResizeRequest): ResizeResult {
  const plan = planResize(image, request);
  const resampled = plan.width !== image.width || plan.height !== image.height;
  const target = resampled ? resizeRaster(image, plan.width, plan.height) : image;
  return { image: target, plan, contentHash: hashRaster(target), resampled };
}
