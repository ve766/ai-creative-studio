import type { Layer, Project } from "@acs/project-schema";

export const MM_PER_INCH = 25.4;

export function mmToPixels(mm: number, dpi: number): number {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

export function pixelsToMm(px: number, dpi: number): number {
  return (px / dpi) * MM_PER_INCH;
}

export function requiredPixelsForPrint(mm: number, dpi: number): number {
  return Math.ceil((mm / MM_PER_INCH) * dpi);
}

export type PreflightLevel = "error" | "warning" | "info";

export interface PreflightIssue {
  level: PreflightLevel;
  code: string;
  message: string;
  layerId?: string;
}

export interface ImageLayerResolutionInput {
  layerId: string;
  name: string;
  naturalWidth: number;
  naturalHeight: number;
  placedWidthPx: number;
  canvasWidthPx: number;
  targetWidthMm: number;
  targetDpi: number;
}

export function checkImageLayerResolution(input: ImageLayerResolutionInput): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const effectiveMm = (input.placedWidthPx / input.canvasWidthPx) * input.targetWidthMm;
  const requiredPx = requiredPixelsForPrint(effectiveMm, input.targetDpi);
  if (input.naturalWidth < requiredPx) {
    const ratio = input.naturalWidth / requiredPx;
    issues.push({
      level: ratio < 0.5 ? "error" : "warning",
      code: "LOW_RESOLUTION",
      layerId: input.layerId,
      message: `图层「${input.name}」实际输出约需 ${requiredPx}px，原始宽度仅 ${input.naturalWidth}px，可能出现模糊`
    });
  }
  return issues;
}

export function isLayerInsideSafeArea(
  layer: Layer,
  safeArea: { top: number; right: number; bottom: number; left: number },
  canvas: { width: number; height: number }
): boolean {
  return (
    layer.x >= safeArea.left &&
    layer.y >= safeArea.top &&
    layer.x + layer.width <= canvas.width - safeArea.right &&
    layer.y + layer.height <= canvas.height - safeArea.bottom
  );
}

export interface PreflightContext {
  canvas: { width: number; height: number };
  targetWidthMm: number;
  targetDpi: number;
  safeArea?: { top: number; right: number; bottom: number; left: number } | null;
}

export function buildPreflightReport(project: Project, context: PreflightContext): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  if (project.layers.length === 0) {
    issues.push({ level: "warning", code: "EMPTY_DESIGN", message: "设计中没有任何图层" });
  }
  for (const layer of project.layers) {
    if (!layer.visible) continue;
    if (layer.type === "image") {
      issues.push(
        ...checkImageLayerResolution({
          layerId: layer.id,
          name: layer.name,
          naturalWidth: layer.naturalWidth,
          naturalHeight: layer.naturalHeight,
          placedWidthPx: layer.width,
          canvasWidthPx: context.canvas.width,
          targetWidthMm: context.targetWidthMm,
          targetDpi: context.targetDpi
        })
      );
    }
    if (context.safeArea && !isLayerInsideSafeArea(layer, context.safeArea, context.canvas)) {
      issues.push({
        level: "info",
        code: "OUTSIDE_SAFE_AREA",
        layerId: layer.id,
        message: `图层「${layer.name}」超出安全区，可能被裁切`
      });
    }
  }
  return issues;
}
