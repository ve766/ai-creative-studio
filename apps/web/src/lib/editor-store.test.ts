import { beforeEach, describe, expect, it } from "vitest";
import { createTextLayer } from "@acs/project-schema";
import { createProjectFromTemplate, getTemplate } from "@acs/template-library";
import { selectCanRedo, selectCanUndo, selectSelectedLayer, useEditorStore } from "./editor-store";

function freshProject() {
  const template = getTemplate("mug-standard");
  if (!template) throw new Error("template missing");
  return createProjectFromTemplate(template, "编辑器测试");
}

function reset() {
  useEditorStore.getState().unload();
  useEditorStore.getState().load(freshProject());
}

describe("editor store", () => {
  beforeEach(reset);

  it("loads a project with clean history", () => {
    const state = useEditorStore.getState();
    expect(state.project?.name).toBe("编辑器测试");
    expect(selectCanUndo(state)).toBe(false);
    expect(selectCanRedo(state)).toBe(false);
  });

  it("adds layers and marks the project dirty", () => {
    const store = useEditorStore.getState();
    store.addLayer(createTextLayer({ id: "l1", text: "标题", x: 0, y: 0 }));
    const state = useEditorStore.getState();
    expect(state.project?.layers).toHaveLength(1);
    expect(state.selectedLayerId).toBe("l1");
    expect(state.saveState).toBe("dirty");
    expect(selectCanUndo(state)).toBe(true);
  });

  it("undoes and redoes layer changes", () => {
    const store = useEditorStore.getState();
    store.addLayer(createTextLayer({ id: "l1", text: "标题", x: 0, y: 0 }));
    store.updateLayer("l1", { x: 300 });

    expect(useEditorStore.getState().project?.layers[0]?.x).toBe(300);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project?.layers[0]?.x).toBe(0);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project?.layers).toHaveLength(0);
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().project?.layers).toHaveLength(1);
  });

  it("keeps selection consistent when deleting a layer", () => {
    const store = useEditorStore.getState();
    store.addLayer(createTextLayer({ id: "l1", text: "标题", x: 0, y: 0 }));
    store.removeLayer("l1");
    const state = useEditorStore.getState();
    expect(state.selectedLayerId).toBeNull();
    expect(state.project?.layers).toHaveLength(0);
  });

  it("clamps zoom into the supported range", () => {
    const store = useEditorStore.getState();
    store.setZoom(100);
    expect(useEditorStore.getState().zoom).toBe(8);
    store.setZoom(0.0001);
    expect(useEditorStore.getState().zoom).toBe(0.05);
  });

  it("centers the canvas when fitting the viewport", () => {
    const project = useEditorStore.getState().project;
    if (!project) throw new Error("no project");
    useEditorStore.getState().fitToViewport(1000, 800);
    const state = useEditorStore.getState();
    expect(state.zoom).toBeGreaterThan(0);
    expect(state.pan.x).toBeCloseTo((1000 - project.canvas.width * state.zoom) / 2, 3);
  });

  it("exposes the selected layer through the selector", () => {
    const store = useEditorStore.getState();
    store.addLayer(createTextLayer({ id: "l1", text: "标题", x: 0, y: 0 }));
    expect(selectSelectedLayer(useEditorStore.getState())?.id).toBe("l1");
    useEditorStore.getState().select(null);
    expect(selectSelectedLayer(useEditorStore.getState())).toBeNull();
  });

  it("reports errors instead of crashing on invalid operations", () => {
    useEditorStore.getState().removeLayer("missing");
    expect(useEditorStore.getState().error).toBeTruthy();
  });
});
