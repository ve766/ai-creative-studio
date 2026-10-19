import type { ImageLayer, Project } from "@acs/project-schema";
import { createImageLayer } from "@acs/project-schema";
import type { PreflightIssue, RasterImage } from "@acs/editor-core";
import {
  AlgorithmError,
  applyAdjustments,
  buildSizeReport,
  cleanAlphaFringe,
  cropImageClamped,
  planResize,
  resizeImage,
  trimTransparentEdges,
  type ColorAdjustInput,
  type CropRectInput,
  type ResizeRequest
} from "@acs/editor-core";

export type RasterPixels = RasterImage;

export interface RasterCodec {
  decode: (src: string) => Promise<RasterPixels>;
  encode: (raster: RasterPixels) => Promise<string>;
}

export interface ImageOperationRequest {
  crop?: CropRectInput;
  resize?: ResizeRequest;
  opacity?: number;
  color?: ColorAdjustInput;
  trimTransparent?: { threshold?: number };
  cleanFringe?: { threshold?: number };
}

export interface ImageOperationOutcome {
  raster: RasterPixels;
  steps: string[];
  notes: string[];
  originX: number;
  originY: number;
}

const STEP_LABELS = {
  trim: "去除透明边缘",
  crop: "裁切",
  resize: "缩放",
  adjust: "颜色/透明度调整",
  cleanFringe: "清理透明毛边"
} as const;

export function runImageOperation(
  raster: RasterPixels,
  request: ImageOperationRequest
): ImageOperationOutcome {
  let current = raster;
  let originX = 0;
  let originY = 0;
  const steps: string[] = [];
  const notes: string[] = [];

  if (request.trimTransparent) {
    const trimmed = trimTransparentEdges(current, { threshold: request.trimTransparent.threshold });
    if (trimmed.changed) {
      originX += trimmed.report.left;
      originY += trimmed.report.top;
      current = trimmed.image;
      steps.push(STEP_LABELS.trim);
      notes.push(
        `去除透明边缘：上 ${trimmed.report.top}px、右 ${trimmed.report.right}px、下 ${trimmed.report.bottom}px、左 ${trimmed.report.left}px`
      );
    } else {
      notes.push(
        trimmed.report.entirelyTransparent
          ? "未去除透明边缘：图片整体透明，无法判断内容边界"
          : "未去除透明边缘：四边没有可裁切的透明区域"
      );
    }
  }

  if (request.crop) {
    const cropped = cropImageClamped(current, request.crop);
    originX += cropped.rect.x;
    originY += cropped.rect.y;
    current = cropped.image;
    steps.push(STEP_LABELS.crop);
    notes.push(`裁切：${cropped.rect.x}, ${cropped.rect.y}, ${cropped.rect.width}×${cropped.rect.height}`);
  }

  if (request.resize) {
    const plan = planResize(current, request.resize);
    const resized = resizeImage(current, request.resize);
    current = resized.image;
    steps.push(STEP_LABELS.resize);
    notes.push(`${plan.reason}（${plan.width}×${plan.height}px）`);
    if (plan.upscale) {
      notes.push("注意：放大使用双线性插值，不会恢复细节，也不等同于超分辨率。");
    }
    if (plan.capped) {
      notes.push("注意：目标尺寸超过像素预算，已按比例缩小。");
    }
  }

  const wantsAdjust =
    (request.opacity !== undefined && request.opacity !== 1) ||
    (request.color !== undefined &&
      [request.color.brightness, request.color.contrast, request.color.saturation].some(
        (value) => value !== undefined && value !== 0
      ));
  if (wantsAdjust) {
    current = applyAdjustments(current, { opacity: request.opacity, color: request.color });
    steps.push(STEP_LABELS.adjust);
  }

  if (request.cleanFringe) {
    const cleaned = cleanAlphaFringe(current, { threshold: request.cleanFringe.threshold });
    current = cleaned.image;
    steps.push(STEP_LABELS.cleanFringe);
    if (cleaned.clearedPixels > 0) {
      notes.push(
        `清理透明毛边：清除了 ${cleaned.clearedPixels} 个半透明像素（阈值 ${cleaned.threshold}）。这是毛边清理，不是背景移除。`
      );
    } else {
      notes.push("清理透明毛边：没有发现阈值以下的半透明像素。");
    }
  }

  return { raster: current, steps, notes, originX, originY };
}

export interface ResultLayerGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
}

export function planResultGeometry(
  source: ImageLayer,
  result: { width: number; height: number; originX: number; originY: number }
): ResultLayerGeometry {
  const scaleX = source.width / source.naturalWidth;
  const scaleY = source.height / source.naturalHeight;
  return {
    x: Math.round((source.x + result.originX * scaleX) * 100) / 100,
    y: Math.round((source.y + result.originY * scaleY) * 100) / 100,
    width: Math.max(1, Math.round(result.width * scaleX)),
    height: Math.max(1, Math.round(result.height * scaleY)),
    naturalWidth: result.width,
    naturalHeight: result.height
  };
}

export type ApplyImageOperationResult =
  | { ok: true; layer: ImageLayer; steps: string[]; notes: string[] }
  | { ok: false; message: string };

export async function applyImageOperation(
  layer: ImageLayer,
  request: ImageOperationRequest,
  codec: RasterCodec
): Promise<ApplyImageOperationResult> {
  let raster: RasterPixels;
  try {
    raster = await codec.decode(layer.src);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "图片解码失败"
    };
  }

  let outcome: ImageOperationOutcome;
  try {
    outcome = runImageOperation(raster, request);
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof AlgorithmError
          ? error.message
          : error instanceof Error
            ? error.message
            : "图像处理失败"
    };
  }

  if (outcome.steps.length === 0) {
    return { ok: false, message: "没有可应用的图像处理步骤" };
  }

  let src: string;
  try {
    src = await codec.encode(outcome.raster);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "新图层编码失败"
    };
  }

  const geometry = planResultGeometry(layer, {
    width: outcome.raster.width,
    height: outcome.raster.height,
    originX: outcome.originX,
    originY: outcome.originY
  });

  const suffix = outcome.steps.join("+");
  return {
    ok: true,
    layer: createImageLayer({
      name: `${layer.name.slice(0, 22)}（${suffix.slice(0, 6)}）`,
      src,
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      naturalWidth: geometry.naturalWidth,
      naturalHeight: geometry.naturalHeight
    }),
    steps: outcome.steps,
    notes: outcome.notes
  };
}

export function describeLayerOutput(project: Project, layer: ImageLayer): PreflightIssue[] {
  if (!project.print) {
    return [];
  }
  return buildSizeReport(
    { width: layer.naturalWidth, height: layer.naturalHeight },
    {
      widthMm: project.print.targetWidthMm,
      heightMm: project.print.targetHeightMm,
      dpi: project.print.dpi
    }
  ).issues;
}

export function createBrowserCodec(): RasterCodec {
  return {
    async decode(src) {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new window.Image();
        element.crossOrigin = "anonymous";
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("图片解码失败，可能已损坏"));
        element.src = src;
      });
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("当前浏览器不支持图像处理");
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      return {
        width: imageData.width,
        height: imageData.height,
        data: new Uint8ClampedArray(imageData.data)
      };
    },
    async encode(raster) {
      const canvas = document.createElement("canvas");
      canvas.width = raster.width;
      canvas.height = raster.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("当前浏览器不支持图像处理");
      const imageData = new ImageData(
        new Uint8ClampedArray(raster.data),
        raster.width,
        raster.height
      );
      context.putImageData(imageData, 0, 0);
      return canvas.toDataURL("image/png");
    }
  };
}
