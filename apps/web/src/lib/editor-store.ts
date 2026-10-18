import { create } from "zustand";
import type { Layer, LayerPatch, Project } from "@acs/project-schema";
import type { HistoryState } from "@acs/editor-core";
import {
  addLayer as opAddLayer,
  canRedo,
  canUndo,
  centerLayer as opCenter,
  commit,
  createHistory,
  duplicateLayer as opDuplicate,
  fitLayerToBox,
  moveLayer as opMove,
  redo,
  removeLayer as opRemove,
  renameProject as opRenameProject,
  reorderLayers as opReorder,
  replacePresent,
  setLayerOpacity as opSetOpacity,
  toggleLayer as opToggle,
  undo,
  updateLayer as opUpdate,
  type MoveDirection
} from "@acs/editor-core";

const HISTORY_LIMIT = 150;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export interface EditorState {
  project: Project | null;
  history: HistoryState<Project> | null;
  selectedLayerId: string | null;
  zoom: number;
  pan: { x: number; y: number };
  saveState: SaveState;
  lastSavedAt: string | null;
  error: string | null;
  editSession: boolean;
  load(project: Project): void;
  unload(): void;
  apply(mutator: (project: Project) => Project): void;
  applyTransient(mutator: (project: Project) => Project): void;
  commitHistory(): void;
  undo(): void;
  redo(): void;
  select(id: string | null): void;
  setZoom(zoom: number): void;
  zoomBy(factor: number, anchor?: { x: number; y: number }): void;
  setPan(pan: { x: number; y: number }): void;
  fitToViewport(width: number, height: number): void;
  setSaveState(state: SaveState): void;
  markSaved(at: string): void;
  setError(message: string | null): void;
  addLayer(layer: Layer): void;
  removeLayer(id: string): void;
  updateLayer(id: string, patch: LayerPatch): void;
  updateLayerTransient(id: string, patch: LayerPatch): void;
  duplicateLayer(id: string): void;
  moveLayer(id: string, direction: MoveDirection): void;
  toggleLayer(id: string, prop: "visible" | "locked"): void;
  setLayerOpacity(id: string, opacity: number): void;
  centerLayer(id: string): void;
  fitLayerToCanvas(id: string): void;
  reorderLayers(ids: string[]): void;
  renameProject(name: string): void;
}

function clampZoom(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

export const useEditorStore = create<EditorState>((set, get) => ({
  project: null,
  history: null,
  selectedLayerId: null,
  zoom: 1,
  pan: { x: 0, y: 0 },
  saveState: "idle",
  lastSavedAt: null,
  error: null,
  editSession: false,

  load(project) {
    set({
      project,
      history: createHistory(project),
      selectedLayerId: null,
      zoom: 1,
      pan: { x: 0, y: 0 },
      saveState: "idle",
      lastSavedAt: null,
      error: null,
      editSession: false
    });
  },

  unload() {
    set({
      project: null,
      history: null,
      selectedLayerId: null,
      saveState: "idle",
      lastSavedAt: null,
      error: null,
      editSession: false
    });
  },

  apply(mutator) {
    const { project, history } = get();
    if (!project || !history) return;
    try {
      const next = mutator(project);
      set({
        project: next,
        history: commit(history, next, HISTORY_LIMIT),
        saveState: "dirty",
        error: null,
        editSession: false
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "操作失败", editSession: false });
    }
  },

  applyTransient(mutator) {
    const { project, history, editSession } = get();
    if (!project || !history) return;
    try {
      const next = mutator(project);
      set({
        project: next,
        history: editSession
          ? replacePresent(history, next)
          : commit(history, next, HISTORY_LIMIT),
        saveState: "dirty",
        error: null,
        editSession: true
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "操作失败", editSession: false });
    }
  },

  commitHistory() {
    if (!get().editSession) return;
    set({ editSession: false });
  },

  undo() {
    const { history } = get();
    if (!history || !canUndo(history)) return;
    const next = undo(history);
    set({
      history: next,
      project: next.present,
      saveState: "dirty",
      error: null,
      editSession: false
    });
  },

  redo() {
    const { history } = get();
    if (!history || !canRedo(history)) return;
    const next = redo(history);
    set({
      history: next,
      project: next.present,
      saveState: "dirty",
      error: null,
      editSession: false
    });
  },

  select(id) {
    set({ selectedLayerId: id });
  },

  setZoom(zoom) {
    set({ zoom: clampZoom(zoom) });
  },

  zoomBy(factor, anchor) {
    const { zoom, pan } = get();
    const nextZoom = clampZoom(zoom * factor);
    if (Math.abs(nextZoom - zoom) < 0.0001) return;
    if (!anchor) {
      set({ zoom: nextZoom });
      return;
    }
    const ratio = nextZoom / zoom;
    set({
      zoom: nextZoom,
      pan: {
        x: anchor.x - (anchor.x - pan.x) * ratio,
        y: anchor.y - (anchor.y - pan.y) * ratio
      }
    });
  },

  setPan(pan) {
    set({ pan });
  },

  fitToViewport(width, height) {
    const { project } = get();
    if (!project || width <= 0 || height <= 0) return;
    const scale = Math.min(width / project.canvas.width, height / project.canvas.height) * 0.9;
    const zoom = clampZoom(scale);
    set({
      zoom,
      pan: {
        x: (width - project.canvas.width * zoom) / 2,
        y: (height - project.canvas.height * zoom) / 2
      }
    });
  },

  setSaveState(state) {
    set({ saveState: state });
  },

  markSaved(at) {
    set({ saveState: "saved", lastSavedAt: at, error: null });
  },

  setError(message) {
    set({ error: message, saveState: message ? "error" : get().saveState });
  },

  addLayer(layer) {
    get().apply((project) => opAddLayer(project, layer));
    set({ selectedLayerId: layer.id });
  },

  removeLayer(id) {
    get().apply((project) => opRemove(project, id));
    if (get().selectedLayerId === id) set({ selectedLayerId: null });
  },

  updateLayer(id, patch) {
    get().apply((project) => opUpdate(project, id, patch));
  },

  updateLayerTransient(id, patch) {
    get().applyTransient((project) => opUpdate(project, id, patch));
  },

  duplicateLayer(id) {
    get().apply((project) => opDuplicate(project, id));
  },

  moveLayer(id, direction) {
    get().apply((project) => opMove(project, id, direction));
  },

  toggleLayer(id, prop) {
    get().apply((project) => opToggle(project, id, prop));
  },

  setLayerOpacity(id, opacity) {
    get().apply((project) => opSetOpacity(project, id, opacity));
  },

  centerLayer(id) {
    get().apply((project) => opCenter(project, id));
  },

  fitLayerToCanvas(id) {
    get().apply((project) =>
      fitLayerToBox(project, id, {
        x: 0,
        y: 0,
        width: project.canvas.width,
        height: project.canvas.height
      })
    );
  },

  reorderLayers(ids) {
    get().apply((project) => opReorder(project, ids));
  },

  renameProject(name) {
    get().apply((project) => opRenameProject(project, name));
  }
}));

export const selectCanUndo = (state: EditorState): boolean =>
  state.history ? canUndo(state.history) : false;

export const selectCanRedo = (state: EditorState): boolean =>
  state.history ? canRedo(state.history) : false;

export const selectSelectedLayer = (state: EditorState): Layer | null => {
  if (!state.project || !state.selectedLayerId) return null;
  return state.project.layers.find((layer) => layer.id === state.selectedLayerId) ?? null;
};
