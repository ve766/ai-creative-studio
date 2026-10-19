import { describe, expect, it } from "vitest";
import {
  createImageLayer,
  createProject,
  type ImageLayer,
  type Project
} from "@acs/project-schema";
import {
  createRaster,
  fillRaster,
  getPixel,
  setPixel,
  type RasterImage
} from "@acs/editor-core";
import {
  applyImageOperation,
  describeLayerOutput,
  planResultGeometry,
  runImageOperation,
  type RasterCodec
} from "./image-ops";

function borderedImage(): RasterImage {
  const image = createRaster(8, 8);
  fillRaster(image, [0, 0, 0, 0]);
  for (let y = 2; y < 6; y += 1) {
    for (let x = 2; x < 6; x += 1) {
      setPixel(image, x, y, [255, 0, 0, 255]);
    }
  }
  return image;
}

function opaqueImage(size = 4): RasterImage {
  const image = createRaster(size, size);
  fillRaster(image, [10, 20, 30, 255]);
  return image;
}

function fakeCodec(raster: RasterImage, encoded = "data:image/png;base64,RESULT"): RasterCodec {
  return {
    decode: async () => raster,
    encode: async () => encoded
  };
}

function imageLayer(overrides: Partial<ImageLayer> = {}): ImageLayer {
  return {
    ...createImageLayer({
      name: "底图",
      src: "data:image/png;base64,SOURCE",
      x: 100,
      y: 50,
      width: 400,
      height: 400,
      naturalWidth: 8,
      naturalHeight: 8
    }),
    ...overrides
  };
}

function projectWithPrint(layer: ImageLayer): Project {
  return createProject({
    name: "测试",
    templateId: "mug-standard",
    templateVersion: 2,
    canvas: { width: 1000, height: 800, backgroundColor: "#fff", dpi: 300, unit: "px" },
    layers: [layer],
    print: {
      targetWidthMm: 100,
      targetHeightMm: 50,
      dpi: 300,
      bleedMm: 0,
      safeMarginMm: 0,
      format: "png"
    }
  });
}

describe("runImageOperation", () => {
  it("returns an untouched raster when nothing is requested", () => {
    const source = borderedImage();
    const outcome = runImageOperation(source, {});
    expect(outcome.steps).toEqual([]);
    expect(outcome.raster).toBe(source);
    expect(outcome.originX).toBe(0);
    expect(outcome.originY).toBe(0);
  });

  it("trims transparent edges and reports the origin offset", () => {
    const outcome = runImageOperation(borderedImage(), { trimTransparent: {} });
    expect(outcome.steps).toEqual(["去除透明边缘"]);
    expect(outcome.originX).toBe(2);
    expect(outcome.originY).toBe(2);
    expect(outcome.raster.width).toBe(4);
    expect(outcome.raster.height).toBe(4);
  });

  it("keeps the image when there is nothing to trim", () => {
    const source = opaqueImage();
    const outcome = runImageOperation(source, { trimTransparent: {} });
    expect(outcome.steps).toEqual([]);
    expect(outcome.raster).toBe(source);
    expect(outcome.notes.join()).toContain("没有可裁切的透明区域");
  });

  it("explains a fully transparent image instead of trimming it", () => {
    const transparent = createRaster(4, 4);
    const outcome = runImageOperation(transparent, { trimTransparent: {} });
    expect(outcome.steps).toEqual([]);
    expect(outcome.notes.join()).toContain("整体透明");
  });

  it("accumulates origin across trim then crop", () => {
    const outcome = runImageOperation(borderedImage(), {
      trimTransparent: {},
      crop: { x: 1, y: 1, width: 2, height: 2 }
    });
    expect(outcome.steps).toEqual(["去除透明边缘", "裁切"]);
    expect(outcome.originX).toBe(3);
    expect(outcome.originY).toBe(3);
    expect(outcome.raster.width).toBe(2);
    expect(outcome.raster.height).toBe(2);
  });

  it("clamps an out-of-range crop instead of failing", () => {
    const outcome = runImageOperation(opaqueImage(4), {
      crop: { x: 3, y: 3, width: 10, height: 10 }
    });
    expect(outcome.steps).toEqual(["裁切"]);
    expect(outcome.raster.width).toBe(1);
    expect(outcome.raster.height).toBe(1);
  });

  it("resizes to the requested maximum edge", () => {
    const outcome = runImageOperation(opaqueImage(8), {
      resize: { mode: "fit-max-edge", maxEdge: 4 }
    });
    expect(outcome.steps).toEqual(["缩放"]);
    expect(outcome.raster.width).toBe(4);
    expect(outcome.raster.height).toBe(4);
  });

  it("notes that upscaling is interpolation, not super resolution", () => {
    const outcome = runImageOperation(opaqueImage(4), {
      resize: { mode: "exact", width: 8, height: 8 }
    });
    expect(outcome.raster.width).toBe(8);
    expect(outcome.notes.join()).toContain("超分辨率");
  });

  it("applies opacity and colour adjustments as one step", () => {
    const outcome = runImageOperation(opaqueImage(2), {
      opacity: 0.5,
      color: { brightness: 10 }
    });
    expect(outcome.steps).toEqual(["颜色/透明度调整"]);
    expect(getPixel(outcome.raster, 0, 0)[3]).toBe(128);
    expect(getPixel(outcome.raster, 0, 0)[0]).toBeGreaterThan(10);
  });

  it("cleans semi-transparent fringe pixels and reports the count", () => {
    const source = createRaster(2, 2);
    fillRaster(source, [0, 0, 0, 0]);
    setPixel(source, 0, 0, [255, 255, 255, 5]);
    setPixel(source, 1, 0, [255, 255, 255, 255]);
    const outcome = runImageOperation(source, { cleanFringe: { threshold: 16 } });
    expect(outcome.steps).toEqual(["清理透明毛边"]);
    expect(outcome.notes.join()).toContain("1 个半透明像素");
    expect(getPixel(outcome.raster, 0, 0)).toEqual([0, 0, 0, 0]);
  });
});

describe("planResultGeometry", () => {
  it("maps result pixels back into layer coordinates", () => {
    const geometry = planResultGeometry(imageLayer(), {
      width: 4,
      height: 4,
      originX: 2,
      originY: 2
    });
    expect(geometry).toEqual({
      x: 200,
      y: 150,
      width: 200,
      height: 200,
      naturalWidth: 4,
      naturalHeight: 4
    });
  });

  it("honours non-uniform layer scaling", () => {
    const geometry = planResultGeometry(imageLayer({ width: 800, height: 400 }), {
      width: 4,
      height: 2,
      originX: 1,
      originY: 1
    });
    expect(geometry.x).toBe(200);
    expect(geometry.y).toBe(100);
    expect(geometry.width).toBe(400);
    expect(geometry.height).toBe(100);
  });
});

describe("applyImageOperation", () => {
  it("creates a new layer without mutating the source", async () => {
    const source = imageLayer();
    const snapshot = { ...source };
    const result = await applyImageOperation(source, { trimTransparent: {} }, fakeCodec(borderedImage()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layer.type).toBe("image");
    expect(result.layer.src).toBe("data:image/png;base64,RESULT");
    expect(result.layer.naturalWidth).toBe(4);
    expect(result.layer.naturalHeight).toBe(4);
    expect(result.layer.width).toBe(200);
    expect(result.layer.crop).toBeNull();
    expect(result.layer.name).toContain("去除透明边缘");
    expect(result.layer.id).not.toBe(source.id);
    expect(source).toEqual(snapshot);
  });

  it("reports when no step would change anything", async () => {
    const result = await applyImageOperation(imageLayer(), {}, fakeCodec(borderedImage()));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("没有可应用");
  });

  it("surfaces decode failures", async () => {
    const codec: RasterCodec = {
      decode: async () => {
        throw new Error("图片解码失败，可能已损坏");
      },
      encode: async () => "x"
    };
    const result = await applyImageOperation(imageLayer(), { trimTransparent: {} }, codec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("解码失败");
  });

  it("surfaces encode failures", async () => {
    const codec: RasterCodec = {
      decode: async () => borderedImage(),
      encode: async () => {
        throw new Error("新图层编码失败");
      }
    };
    const result = await applyImageOperation(imageLayer(), { trimTransparent: {} }, codec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("编码失败");
  });

  it("turns invalid parameters into a readable message", async () => {
    const result = await applyImageOperation(
      imageLayer(),
      { resize: { mode: "fit-max-edge", maxEdge: 0 } },
      fakeCodec(borderedImage())
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message.length).toBeGreaterThan(0);
  });
});

describe("describeLayerOutput", () => {
  it("warns when a small image cannot reach the target dpi", () => {
    const layer = imageLayer({ naturalWidth: 10, naturalHeight: 10 });
    const issues = describeLayerOutput(projectWithPrint(layer), layer);
    expect(issues.some((issue) => issue.code === "LOW_EFFECTIVE_DPI")).toBe(true);
  });

  it("stays silent when the project has no print target", () => {
    const layer = imageLayer();
    const project = createProject({
      name: "测试",
      templateId: "mug-standard",
      templateVersion: 2,
      canvas: { width: 1000, height: 800, backgroundColor: "#fff", dpi: 300, unit: "px" },
      layers: [layer]
    });
    expect(describeLayerOutput(project, layer)).toEqual([]);
  });
});
