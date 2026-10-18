import Konva from "konva";
import type { Layer, Project } from "@acs/project-schema";
import { planExport, type ExportMode } from "@acs/editor-core";
import { loadImageElement } from "./image";

export type { ExportMode };

export interface ExportOptions {
  mode: ExportMode;
  maxPixelRatio?: number;
}

export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportError";
  }
}

export interface ExportResult {
  dataUrl: string;
  width: number;
  height: number;
  pixelRatio: number;
  capped: boolean;
  warning: string | null;
}

export function describePrintExport(project: Project) {
  return planExport({
    canvasWidth: project.canvas.width,
    canvasHeight: project.canvas.height,
    mode: "print",
    targetWidthMm: project.print?.targetWidthMm ?? null,
    targetDpi: project.print?.dpi ?? null
  });
}

function buildKonvaNode(layer: Layer, image: HTMLImageElement | null): Konva.Image | Konva.Text | null {
  const common = {
    x: layer.x,
    y: layer.y,
    width: layer.width,
    rotation: layer.rotation,
    opacity: layer.opacity,
    listening: false
  };

  if (layer.type === "image") {
    if (!image) return null;
    return new Konva.Image({
      ...common,
      height: layer.height,
      image,
      crop: layer.crop
        ? { x: layer.crop.x, y: layer.crop.y, width: layer.crop.width, height: layer.crop.height }
        : undefined
    });
  }

  // Text keeps an automatic height: a fixed height would clip overflowing lines.
  return new Konva.Text({
    ...common,
    text: layer.text,
    fontSize: layer.fontSize,
    fontFamily: layer.fontFamily,
    fontStyle: `${layer.fontStyle} ${layer.fontWeight}`.trim(),
    fill: layer.fill,
    align: layer.align,
    wrap: "word"
  });
}

export async function renderProjectToDataUrl(
  project: Project,
  options: ExportOptions
): Promise<ExportResult> {
  const planned = planExport({
    canvasWidth: project.canvas.width,
    canvasHeight: project.canvas.height,
    mode: options.mode,
    targetWidthMm: project.print?.targetWidthMm ?? null,
    targetDpi: project.print?.dpi ?? null,
    maxPrintScale: options.maxPixelRatio
  });
  if (!planned.ok) throw new ExportError(planned.message);

  const { plan } = planned;
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  document.body.appendChild(container);

  const stage = new Konva.Stage({
    container,
    width: project.canvas.width,
    height: project.canvas.height
  });
  const layer = new Konva.Layer({ listening: false });
  stage.add(layer);

  layer.add(
    new Konva.Rect({
      x: 0,
      y: 0,
      width: project.canvas.width,
      height: project.canvas.height,
      fill: project.canvas.backgroundColor,
      listening: false
    })
  );

  try {
    for (const item of project.layers) {
      if (!item.visible) continue;
      const image = item.type === "image" ? await loadImageElement(item.src) : null;
      const node = buildKonvaNode(item, image);
      if (node) layer.add(node);
    }
    layer.draw();
    let dataUrl: string;
    try {
      dataUrl = stage.toDataURL({ pixelRatio: plan.pixelRatio, mimeType: "image/png" });
    } catch (error) {
      throw new ExportError(
        `浏览器无法生成 ${plan.outputWidth}×${plan.outputHeight}px 的图片（可能内存不足），请降低画布尺寸或改用较小尺寸导出：${
          error instanceof Error ? error.message : "未知错误"
        }`
      );
    }
    if (!dataUrl || !dataUrl.startsWith("data:image/png")) {
      throw new ExportError("导出结果为空，请重试或降低画布尺寸");
    }
    return {
      dataUrl,
      width: plan.outputWidth,
      height: plan.outputHeight,
      pixelRatio: plan.pixelRatio,
      capped: plan.capped,
      warning: plan.warning
    };
  } finally {
    stage.destroy();
    container.remove();
  }
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function downloadText(text: string, filename: string, mime = "application/json"): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function safeFilename(name: string, suffix: string, ext = "png"): string {
  const base = name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "design";
  return `${base}-${suffix}.${ext}`;
}
