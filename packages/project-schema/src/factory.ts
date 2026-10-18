import type { Canvas, PrintSpec, Project } from "./project";
import { SCHEMA_VERSION } from "./project";
import type { ImageLayer, TextLayer } from "./layers";

export interface IdFactory {
  (prefix: string): string;
}

export function createId(prefix: string): string {
  const globalCrypto = globalThis.crypto;
  if (globalCrypto && typeof globalCrypto.randomUUID === "function") {
    return `${prefix}_${globalCrypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export interface CreateImageLayerInput {
  id?: string;
  name?: string;
  src: string;
  assetId?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
  rotation?: number;
  opacity?: number;
}

export function createImageLayer(input: CreateImageLayerInput): ImageLayer {
  return {
    id: input.id ?? createId("layer"),
    type: "image",
    name: input.name ?? "图片图层",
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    rotation: input.rotation ?? 0,
    opacity: input.opacity ?? 1,
    visible: true,
    locked: false,
    assetId: input.assetId ?? null,
    src: input.src,
    naturalWidth: input.naturalWidth,
    naturalHeight: input.naturalHeight,
    crop: null
  };
}

export interface CreateTextLayerInput {
  id?: string;
  name?: string;
  text: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fontSize?: number;
  fontFamily?: string;
  fill?: string;
  rotation?: number;
  opacity?: number;
}

export function createTextLayer(input: CreateTextLayerInput): TextLayer {
  const fontSize = input.fontSize ?? 48;
  return {
    id: input.id ?? createId("layer"),
    type: "text",
    name: input.name ?? "文字图层",
    x: input.x,
    y: input.y,
    width: input.width ?? 300,
    height: input.height ?? fontSize * 1.4,
    rotation: input.rotation ?? 0,
    opacity: input.opacity ?? 1,
    visible: true,
    locked: false,
    text: input.text,
    fontFamily: input.fontFamily ?? "sans-serif",
    fontSize,
    fontWeight: "normal",
    fontStyle: "normal",
    fill: input.fill ?? "#111827",
    align: "left"
  };
}

export interface CreateProjectInput {
  name: string;
  templateId: string;
  templateVersion: number;
  canvas: Canvas;
  id?: string;
  ownerId?: string | null;
  mode?: Project["mode"];
  print?: PrintSpec | null;
  layers?: Project["layers"];
}

export function createProject(input: CreateProjectInput): Project {
  const timestamp = nowIso();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: input.id ?? createId("prj"),
    name: input.name,
    ownerId: input.ownerId ?? null,
    mode: input.mode ?? "2d",
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    canvas: input.canvas,
    layers: input.layers ?? [],
    print: input.print ?? null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
