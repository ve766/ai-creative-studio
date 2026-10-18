import Konva from "konva";
import type { Layer, Project } from "@acs/project-schema";
import { requiredPixelsForPrint } from "@acs/editor-core";
import { loadImageElement } from "./image";

export type ExportMode = "preview" | "print";

export interface ExportOptions {
  mode: ExportMode;
  maxPixelRatio?: number;
}

const MAX_PRINT_SCALE = 4;

export function computePixelRatio(project: Project, mode: ExportMode): number {
  if (mode === "preview") return 1;
  const print = project.print;
  if (!print) return 1;
  const targetPx = requiredPixelsForPrint(print.targetWidthMm, print.dpi);
  return Math.min(targetPx / project.canvas.width, MAX_PRINT_SCALE);
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
): Promise<string> {
  const pixelRatio = computePixelRatio(project, options.mode);
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
    const dataUrl = stage.toDataURL({ pixelRatio, mimeType: "image/png" });
    return dataUrl;
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
