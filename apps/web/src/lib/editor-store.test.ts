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

describe("editor store edit sessions", () => {
  beforeEach(reset);

  function addTextLayer() {
    useEditorStore.getState().addLayer(createTextLayer({ id: "l1", text: "", x: 0, y: 0 }));
    return useEditorStore.getState();
  }

  it("collapses a typing session into a single undo step", () => {
    addTextLayer();
    const before = useEditorStore.getState().history?.past.length ?? 0;

    for (const value of ["a", "ab", "abc"]) {
      useEditorStore.getState().updateLayerTransient("l1", { text: value });
    }
    useEditorStore.getState().commitHistory();

    const state = useEditorStore.getState();
    expect(state.project?.layers[0]).toMatchObject({ text: "abc" });
    expect(state.history?.past.length).toBe(before + 1);
    expect(state.editSession).toBe(false);

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project?.layers[0]).toMatchObject({ text: "" });
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().project?.layers[0]).toMatchObject({ text: "abc" });
  });

  it("starts a new undo step after the previous session is committed", () => {
    addTextLayer();
    useEditorStore.getState().updateLayerTransient("l1", { text: "第一段" });
    useEditorStore.getState().commitHistory();
    useEditorStore.getState().updateLayerTransient("l1", { text: "第二段" });
    useEditorStore.getState().commitHistory();

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project?.layers[0]).toMatchObject({ text: "第一段" });
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project?.layers[0]).toMatchObject({ text: "" });
  });

  it("ends the session when a normal committed action happens", () => {
    addTextLayer();
    useEditorStore.getState().updateLayerTransient("l1", { text: "abc" });
    expect(useEditorStore.getState().editSession).toBe(true);

    useEditorStore.getState().updateLayer("l1", { x: 50 });
    expect(useEditorStore.getState().editSession).toBe(false);

    useEditorStore.getState().updateLayerTransient("l1", { text: "abcd" });
    useEditorStore.getState().commitHistory();

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project?.layers[0]).toMatchObject({ text: "abc", x: 50 });
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project?.layers[0]).toMatchObject({ text: "abc", x: 0 });
  });

  it("ends the session on undo so the next edit becomes its own step", () => {
    addTextLayer();
    useEditorStore.getState().updateLayerTransient("l1", { text: "abc" });
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().editSession).toBe(false);
    expect(useEditorStore.getState().project?.layers[0]).toMatchObject({ text: "" });
  });

  it("drops the redo stack once a transient edit starts", () => {
    addTextLayer();
    useEditorStore.getState().updateLayer("l1", { x: 10 });
    useEditorStore.getState().undo();
    expect(selectCanRedo(useEditorStore.getState())).toBe(true);

    useEditorStore.getState().updateLayerTransient("l1", { text: "新内容" });
    expect(selectCanRedo(useEditorStore.getState())).toBe(false);
  });
});
