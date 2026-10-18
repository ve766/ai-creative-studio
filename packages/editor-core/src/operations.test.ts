import { describe, expect, it } from "vitest";
import { createImageLayer, createProject, createTextLayer, type Project } from "@acs/project-schema";
import {
  addLayer,
  centerLayer,
  clampLayer,
  duplicateLayer,
  findLayer,
  fitLayerToBox,
  moveLayer,
  removeLayer,
  renameProject,
  reorderLayers,
  setLayerOpacity,
  toggleLayer,
  updateLayer
} from "./operations";

function baseProject(): Project {
  return createProject({
    name: "编辑器测试",
    templateId: "mug-standard",
    templateVersion: 1,
    canvas: { width: 1000, height: 800, backgroundColor: "#fff", dpi: 300, unit: "px" }
  });
}

function withTwoLayers(): Project {
  let project = baseProject();
  project = addLayer(project, createTextLayer({ text: "底层", x: 0, y: 0, id: "l1" }));
  project = addLayer(project, createTextLayer({ text: "顶层", x: 10, y: 10, id: "l2" }));
  return project;
}

describe("layer operations", () => {
  it("adds layers in order", () => {
    const project = withTwoLayers();
    expect(project.layers.map((layer) => layer.id)).toEqual(["l1", "l2"]);
  });

  it("updates a layer and refreshes updatedAt", () => {
    const project = withTwoLayers();
    const next = updateLayer(project, "l1", { x: 100, rotation: 45 });
    expect(findLayer(next, "l1")?.x).toBe(100);
    expect(findLayer(next, "l1")?.rotation).toBe(45);
    expect(next.updatedAt >= project.updatedAt).toBe(true);
  });

  it("rejects invalid patches", () => {
    const project = withTwoLayers();
    expect(() => updateLayer(project, "l1", { opacity: 9 })).toThrow();
  });

  it("removes layers and throws for unknown ids", () => {
    const project = withTwoLayers();
    expect(removeLayer(project, "l1").layers.map((l) => l.id)).toEqual(["l2"]);
    expect(() => removeLayer(project, "missing")).toThrow();
  });

  it("duplicates a layer with a new id and offset", () => {
    const project = withTwoLayers();
    const next = duplicateLayer(project, "l1");
    expect(next.layers).toHaveLength(3);
    const clone = next.layers[1];
    expect(clone?.id).not.toBe("l1");
    expect(clone?.x).toBe(24);
  });

  it("moves layers up, down, to top and bottom", () => {
    const project = withTwoLayers();
    expect(moveLayer(project, "l1", "up").layers.map((l) => l.id)).toEqual(["l2", "l1"]);
    expect(moveLayer(project, "l2", "down").layers.map((l) => l.id)).toEqual(["l2", "l1"]);
    expect(moveLayer(project, "l2", "bottom").layers.map((l) => l.id)).toEqual(["l2", "l1"]);
    expect(moveLayer(project, "l1", "top").layers.map((l) => l.id)).toEqual(["l2", "l1"]);
  });

  it("reorders layers from an explicit id list", () => {
    const project = withTwoLayers();
    expect(reorderLayers(project, ["l2", "l1"]).layers.map((l) => l.id)).toEqual(["l2", "l1"]);
  });

  it("toggles visibility and lock", () => {
    const project = withTwoLayers();
    const hidden = toggleLayer(project, "l1", "visible");
    expect(findLayer(hidden, "l1")?.visible).toBe(false);
    const locked = toggleLayer(project, "l1", "locked");
    expect(findLayer(locked, "l1")?.locked).toBe(true);
  });

  it("clamps opacity into range", () => {
    const project = withTwoLayers();
    expect(findLayer(setLayerOpacity(project, "l1", 5), "l1")?.opacity).toBe(1);
    expect(findLayer(setLayerOpacity(project, "l1", -1), "l1")?.opacity).toBe(0);
  });

  it("centers a layer on the canvas", () => {
    const project = withTwoLayers();
    const layer = findLayer(project, "l1");
    if (!layer) throw new Error("missing layer");
    const centered = centerLayer(project, "l1");
    const result = findLayer(centered, "l1");
    expect(result?.x).toBe((1000 - layer.width) / 2);
    expect(result?.y).toBe((800 - layer.height) / 2);
  });

  it("fits an image layer into a box proportionally", () => {
    let project = baseProject();
    const image = createImageLayer({
      id: "img1",
      src: "data:image/png;base64,AA",
      x: 0,
      y: 0,
      width: 400,
      height: 200,
      naturalWidth: 400,
      naturalHeight: 200
    });
    project = addLayer(project, image);
    const fitted = findLayer(fitLayerToBox(project, "img1", { x: 0, y: 0, width: 200, height: 200 }), "img1");
    expect(fitted?.width).toBe(200);
    expect(fitted?.height).toBe(100);
  });

  it("clamps a layer so it stays reachable inside the canvas", () => {
    const project = withTwoLayers();
    const clamped = findLayer(clampLayer(project, "l1", { x: 0, y: 0, width: 1000, height: 800 }), "l1");
    expect(clamped?.x).toBeLessThanOrEqual(999);
    expect(clamped?.y).toBeGreaterThanOrEqual(-clamped!.height + 1);
  });

  it("renames a project and rejects empty names", () => {
    const project = baseProject();
    expect(renameProject(project, "新名字").name).toBe("新名字");
    expect(() => renameProject(project, "   ")).toThrow();
  });
});
