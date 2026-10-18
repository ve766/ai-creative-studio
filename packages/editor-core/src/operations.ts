import type { Layer, LayerPatch, Project } from "@acs/project-schema";
import { LayerSchema, createId, nowIso } from "@acs/project-schema";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class LayerOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LayerOperationError";
  }
}

function touch(project: Project, layers: Layer[]): Project {
  return { ...project, layers, updatedAt: nowIso() };
}

function parseLayer(candidate: unknown): Layer {
  const parsed = LayerSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new LayerOperationError(
      `图层数据非法：${parsed.error.issues.map((issue) => issue.message).join("; ")}`
    );
  }
  return parsed.data;
}

export function findLayer(project: Project, layerId: string): Layer | null {
  return project.layers.find((layer) => layer.id === layerId) ?? null;
}

export function layerIndex(project: Project, layerId: string): number {
  return project.layers.findIndex((layer) => layer.id === layerId);
}

export function withLayer(
  project: Project,
  layerId: string,
  updater: (layer: Layer) => Layer
): Project {
  const index = layerIndex(project, layerId);
  if (index < 0) throw new LayerOperationError(`图层不存在：${layerId}`);
  const current = project.layers[index] as Layer;
  const next = parseLayer(updater(current));
  const layers = project.layers.slice();
  layers[index] = next;
  return touch(project, layers);
}

export function addLayer(project: Project, layer: Layer, index?: number): Project {
  const parsed = parseLayer(layer);
  const layers = project.layers.slice();
  const at = index === undefined ? layers.length : Math.max(0, Math.min(index, layers.length));
  layers.splice(at, 0, parsed);
  return touch(project, layers);
}

export function removeLayer(project: Project, layerId: string): Project {
  const layers = project.layers.filter((layer) => layer.id !== layerId);
  if (layers.length === project.layers.length) {
    throw new LayerOperationError(`图层不存在：${layerId}`);
  }
  return touch(project, layers);
}

export function updateLayer(project: Project, layerId: string, patch: LayerPatch): Project {
  return withLayer(project, layerId, (layer) => ({ ...layer, ...patch }) as Layer);
}

export function updateLayers(
  project: Project,
  entries: Array<{ id: string; patch: LayerPatch }>
): Project {
  let next = project;
  for (const entry of entries) {
    next = updateLayer(next, entry.id, entry.patch);
  }
  return next;
}

export function duplicateLayer(project: Project, layerId: string): Project {
  const index = layerIndex(project, layerId);
  if (index < 0) throw new LayerOperationError(`图层不存在：${layerId}`);
  const source = project.layers[index] as Layer;
  const clone = parseLayer({
    ...source,
    id: createId("layer"),
    name: `${source.name} 副本`,
    x: source.x + 24,
    y: source.y + 24
  });
  return addLayer(project, clone, index + 1);
}

export type MoveDirection = "up" | "down" | "top" | "bottom";

export function moveLayerToIndex(project: Project, layerId: string, targetIndex: number): Project {
  const index = layerIndex(project, layerId);
  if (index < 0) throw new LayerOperationError(`图层不存在：${layerId}`);
  const layers = project.layers.slice();
  const [layer] = layers.splice(index, 1);
  if (!layer) throw new LayerOperationError(`图层不存在：${layerId}`);
  const clamped = Math.max(0, Math.min(targetIndex, layers.length));
  layers.splice(clamped, 0, layer);
  return touch(project, layers);
}

export function moveLayer(project: Project, layerId: string, direction: MoveDirection): Project {
  const index = layerIndex(project, layerId);
  if (index < 0) throw new LayerOperationError(`图层不存在：${layerId}`);
  const last = project.layers.length - 1;
  const target =
    direction === "up"
      ? index + 1
      : direction === "down"
        ? index - 1
        : direction === "top"
          ? last
          : 0;
  const clamped = Math.max(0, Math.min(target, last));
  if (clamped === index) return project;
  return moveLayerToIndex(project, layerId, clamped);
}

export function toggleLayer(project: Project, layerId: string, prop: "visible" | "locked"): Project {
  return withLayer(project, layerId, (layer) => ({ ...layer, [prop]: !layer[prop] }) as Layer);
}

export function setLayerOpacity(project: Project, layerId: string, opacity: number): Project {
  const clamped = Math.max(0, Math.min(1, opacity));
  return withLayer(project, layerId, (layer) => ({ ...layer, opacity: clamped }) as Layer);
}

export function renameLayer(project: Project, layerId: string, name: string): Project {
  return withLayer(project, layerId, (layer) => ({ ...layer, name }) as Layer);
}

export function centerLayer(project: Project, layerId: string): Project {
  const layer = findLayer(project, layerId);
  if (!layer) throw new LayerOperationError(`图层不存在：${layerId}`);
  return withLayer(project, layerId, (current) => ({
    ...current,
    x: (project.canvas.width - current.width) / 2,
    y: (project.canvas.height - current.height) / 2
  }) as Layer);
}

export function fitLayerToBox(project: Project, layerId: string, box: Rect): Project {
  const layer = findLayer(project, layerId);
  if (!layer) throw new LayerOperationError(`图层不存在：${layerId}`);
  const ratio = Math.min(box.width / layer.width, box.height / layer.height);
  const width = Math.max(1, layer.width * ratio);
  const height = Math.max(1, layer.height * ratio);
  return withLayer(project, layerId, (current) => ({
    ...current,
    width,
    height,
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2
  }) as Layer);
}

export function clampLayer(project: Project, layerId: string, box: Rect): Project {
  return withLayer(project, layerId, (layer) => {
    const minX = box.x - layer.width + 1;
    const maxX = box.x + box.width - 1;
    const minY = box.y - layer.height + 1;
    const maxY = box.y + box.height - 1;
    return {
      ...layer,
      x: Math.max(minX, Math.min(maxX, layer.x)),
      y: Math.max(minY, Math.min(maxY, layer.y))
    } as Layer;
  });
}

export function reorderLayers(project: Project, orderedIds: string[]): Project {
  const byId = new Map(project.layers.map((layer) => [layer.id, layer]));
  const next: Layer[] = [];
  for (const id of orderedIds) {
    const layer = byId.get(id);
    if (layer) {
      next.push(layer);
      byId.delete(id);
    }
  }
  for (const layer of project.layers) {
    if (byId.has(layer.id)) next.push(layer);
  }
  return touch(project, next);
}

export function renameProject(project: Project, name: string): Project {
  const trimmed = name.trim();
  if (!trimmed) throw new LayerOperationError("项目名称不能为空");
  return { ...project, name: trimmed, updatedAt: nowIso() };
}
