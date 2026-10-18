import { describe, expect, it } from "vitest";
import { createImageLayer, createProject } from "@acs/project-schema";
import {
  buildPreflightReport,
  checkImageLayerResolution,
  isLayerInsideSafeArea,
  mmToPixels,
  pixelsToMm,
  requiredPixelsForPrint
} from "./print";

describe("print math", () => {
  it("converts mm to pixels at a given dpi", () => {
    expect(mmToPixels(25.4, 300)).toBe(300);
    expect(requiredPixelsForPrint(200, 300)).toBe(2363);
  });

  it("converts pixels back to mm", () => {
    expect(Math.round(pixelsToMm(300, 300))).toBe(25);
  });
});

describe("resolution preflight", () => {
  it("flags low resolution layers", () => {
    const issues = checkImageLayerResolution({
      layerId: "img1",
      name: "图案",
      naturalWidth: 200,
      naturalHeight: 200,
      placedWidthPx: 1600,
      canvasWidthPx: 1600,
      targetWidthMm: 200,
      targetDpi: 300
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("LOW_RESOLUTION");
    expect(issues[0]?.level).toBe("error");
  });

  it("passes high resolution layers", () => {
    const issues = checkImageLayerResolution({
      layerId: "img1",
      name: "图案",
      naturalWidth: 3000,
      naturalHeight: 3000,
      placedWidthPx: 1600,
      canvasWidthPx: 1600,
      targetWidthMm: 200,
      targetDpi: 300
    });
    expect(issues).toHaveLength(0);
  });

  it("detects layers outside the safe area", () => {
    const inside = { x: 100, y: 100, width: 100, height: 100 };
    expect(
      isLayerInsideSafeArea(
        { ...inside, id: "a", type: "text", name: "t", rotation: 0, opacity: 1, visible: true, locked: false, text: "", fontFamily: "sans", fontSize: 10, fontWeight: "normal", fontStyle: "normal", fill: "#000", align: "left" },
        { top: 50, right: 50, bottom: 50, left: 50 },
        { width: 1000, height: 800 }
      )
    ).toBe(true);
  });

  it("produces a report for an empty design", () => {
    const project = createProject({
      name: "空",
      templateId: "mug-standard",
      templateVersion: 1,
      canvas: { width: 1600, height: 680, backgroundColor: "#fff", dpi: 300, unit: "px" }
    });
    const report = buildPreflightReport(project, {
      canvas: project.canvas,
      targetWidthMm: 200,
      targetDpi: 300
    });
    expect(report.some((issue) => issue.code === "EMPTY_DESIGN")).toBe(true);
  });

  it("includes layer resolution findings in the report", () => {
    let project = createProject({
      name: "低清",
      templateId: "mug-standard",
      templateVersion: 1,
      canvas: { width: 1600, height: 680, backgroundColor: "#fff", dpi: 300, unit: "px" }
    });
    project = {
      ...project,
      layers: [
        createImageLayer({
          src: "data:image/png;base64,AA",
          x: 0,
          y: 0,
          width: 1600,
          height: 680,
          naturalWidth: 100,
          naturalHeight: 50
        })
      ]
    };
    const report = buildPreflightReport(project, {
      canvas: project.canvas,
      targetWidthMm: 200,
      targetDpi: 300
    });
    expect(report.some((issue) => issue.code === "LOW_RESOLUTION")).toBe(true);
  });
});
