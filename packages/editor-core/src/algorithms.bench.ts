import { describe, expect, it } from "vitest";
import { deflateSync, inflateSync } from "node:zlib";
import {
  BENCH_SIZES,
  MAX_FIXTURE_PIXELS,
  RGBA_CHANNELS,
  addNoise,
  createRaster,
  fillChecker,
  fillGradient,
  hashRaster
} from "./fixtures";
import { decodePng, encodePng } from "./png";
import { buildPattern, adjustColor, makeSeamless, measureSeams, mirrorTile, repeatTile } from "./pattern";
import {
  analyzeTransparentEdges,
  applyOpacity,
  buildOutputReport,
  cleanAlphaFringe,
  denoise,
  sharpen
} from "./image";
import { planExport } from "./export-budget";
import { buildPreflightReport } from "./print";
import { createImageLayer, createProject } from "@acs/project-schema";

interface Measurement {
  name: string;
  detail: string;
  iterations: number;
  batchSize: number;
  totalMs: number;
  perOpMs: number;
  minSampleMs: number;
  maxSampleMs: number;
}

const measurements: Measurement[] = [];

interface MeasureOptions {
  name: string;
  detail: string;
  iterations: number;
  batchSize?: number;
  operation: (index: number) => void;
}

function measure(options: MeasureOptions): Measurement {
  const { name, detail, iterations, operation } = options;
  const batchSize = options.batchSize ?? 1;
  const warmup = Math.max(1, Math.round(iterations / 10));
  for (let index = 0; index < warmup; index += 1) {
    for (let batch = 0; batch < batchSize; batch += 1) operation(index);
  }

  let totalMs = 0;
  let minSampleMs = Number.POSITIVE_INFINITY;
  let maxSampleMs = 0;
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    for (let batch = 0; batch < batchSize; batch += 1) operation(index);
    const elapsed = performance.now() - started;
    totalMs += elapsed;
    if (elapsed < minSampleMs) minSampleMs = elapsed;
    if (elapsed > maxSampleMs) maxSampleMs = elapsed;
  }

  const perOpMs = totalMs / (iterations * batchSize);
  const measurement: Measurement = {
    name,
    detail,
    iterations,
    batchSize,
    totalMs,
    perOpMs,
    minSampleMs: minSampleMs / batchSize,
    maxSampleMs: maxSampleMs / batchSize
  };
  measurements.push(measurement);
  return measurement;
}

let reported = 0;

function report(): void {
  const pending = measurements.slice(reported);
  reported = measurements.length;
  console.table(
    pending.map((item) => ({
      scene: item.name,
      scale: item.detail,
      samples: item.iterations,
      batch: item.batchSize,
      totalMs: item.totalMs.toFixed(1),
      perOpMs: item.perOpMs.toFixed(5),
      minMs: item.minSampleMs.toFixed(5),
      maxMs: item.maxSampleMs.toFixed(5)
    }))
  );
  for (const item of pending) {
    console.log(
      `BENCH|${item.name}|${item.detail}|${item.iterations}|${item.batchSize}|${item.totalMs.toFixed(
        1
      )}|${item.perOpMs.toFixed(5)}|${item.minSampleMs.toFixed(5)}|${item.maxSampleMs.toFixed(5)}`
    );
  }
}

function iterationsFor(pixels: number, light: number, heavy: number): number {
  return pixels >= 1024 * 1024 ? heavy : light;
}

describe("local algorithm baseline (P0)", () => {
  it("measures raster generation and PNG codec", () => {
    for (const size of BENCH_SIZES) {
      const pixels = size * size;
      const light = size >= 1024 ? 6 : 30;
      const heavy = 3;

      measure({
        name: `checker ${size}x${size}`,
        detail: `${pixels}px`,
        iterations: iterationsFor(pixels, light, heavy),
        operation: () => {
          const image = createRaster(size, size);
          fillChecker(image, { cellSize: 32 });
        }
      });

      const gradientImage = createRaster(size, size);
      measure({
        name: `gradient-diagonal ${size}x${size}`,
        detail: `${pixels}px`,
        iterations: iterationsFor(pixels, light, heavy),
        operation: () => {
          fillGradient(gradientImage, { axis: "diagonal" });
        }
      });

      const noiseImage = createRaster(size, size);
      measure({
        name: `noise-monochrome seed=20261019 ${size}x${size}`,
        detail: `${pixels}px`,
        iterations: iterationsFor(pixels, light, heavy),
        operation: () => {
          addNoise(noiseImage, { seed: 20261019, amplitude: 24 });
        }
      });

      const source = createRaster(size, size);
      fillChecker(source, { cellSize: 32 });
      const encoded = encodePng(source);
      const sizeKb = `${(encoded.length / 1024).toFixed(0)}KB`;

      measure({
        name: `png-encode ${size}x${size}`,
        detail: sizeKb,
        iterations: iterationsFor(pixels, light, heavy),
        operation: () => {
          encodePng(source);
        }
      });

      measure({
        name: `png-decode ${size}x${size}`,
        detail: sizeKb,
        iterations: iterationsFor(pixels, light, heavy),
        operation: () => {
          decodePng(encoded);
        }
      });

      measure({
        name: `hash-raster ${size}x${size}`,
        detail: `${pixels}px`,
        iterations: iterationsFor(pixels, light, heavy),
        operation: () => {
          hashRaster(source);
        }
      });
    }

    report();
    expect(measurements.length).toBe(BENCH_SIZES.length * 6);
  });

  it("measures pure planning algorithms", () => {
    const small = { width: 1600, height: 680 };

    const preview = measure({
      name: "planExport preview 1600x680",
      detail: "batch 500",
      iterations: 300,
      batchSize: 500,
      operation: () => {
        planExport({ canvasWidth: small.width, canvasHeight: small.height, mode: "preview" });
      }
    });
    expect(preview.perOpMs).toBeGreaterThan(0);

    measure({
      name: "planExport print-capped 12000x9000",
      detail: "300dpi / 200mm",
      iterations: 300,
      batchSize: 200,
      operation: () => {
        planExport({
          canvasWidth: 12000,
          canvasHeight: 9000,
          mode: "print",
          targetWidthMm: 200,
          targetDpi: 300
        });
      }
    });

    const project = createProject({
      name: "bench",
      templateId: "bench-template",
      templateVersion: 1,
      canvas: {
        width: 1600,
        height: 680,
        backgroundColor: "#ffffff",
        dpi: 300,
        unit: "px"
      }
    });
    for (let index = 0; index < 200; index += 1) {
      project.layers.push(
        createImageLayer({
          name: `layer-${index}`,
          src: "data:image/png;base64,",
          naturalWidth: 1200,
          naturalHeight: 1200,
          x: index,
          y: index,
          width: 600,
          height: 600
        })
      );
    }

    measure({
      name: "buildPreflightReport 200 layers",
      detail: "resolution + safe-area checks",
      iterations: 300,
      batchSize: 20,
      operation: () => {
        buildPreflightReport(project, { canvas: small, targetWidthMm: 200, targetDpi: 300 });
      }
    });

    report();
    expect(measurements.length).toBeGreaterThan(0);
  });

  it("measures raw zlib control group and invalid input path", () => {
    const size = 1024;
    const source = createRaster(size, size);
    fillChecker(source, { cellSize: 32 });

    const stride = size * RGBA_CHANNELS;
    const raw = new Uint8Array((stride + 1) * size);
    for (let y = 0; y < size; y += 1) {
      raw.set(source.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
    }
    const deflated = new Uint8Array(deflateSync(raw, { level: 6 }));

    measure({
      name: "raw zlib deflate control",
      detail: `${(deflated.length / 1024).toFixed(0)}KB`,
      iterations: 6,
      batchSize: 1,
      operation: () => {
        deflateSync(raw, { level: 6 });
      }
    });

    measure({
      name: "raw zlib inflate control",
      detail: `${(deflated.length / 1024).toFixed(0)}KB`,
      iterations: 30,
      batchSize: 1,
      operation: () => {
        inflateSync(deflated);
      }
    });

    const valid = encodePng(source);
    measure({
      name: "decodePng rejects garbage",
      detail: "8 bytes",
      iterations: 1000,
      batchSize: 50,
      operation: () => {
        try {
          decodePng(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]));
        } catch {
          return;
        }
      }
    });

    report();
    expect(valid.length).toBeGreaterThan(0);
  });

  it("measures the pattern engine preview and final paths", () => {
    const motifSize = 512;
    const motif = createRaster(motifSize, motifSize);
    fillChecker(motif, { cellSize: 64 });
    const spec = { columns: 4, rows: 4, motifScale: 0.5, rotationDeg: 8, gapX: 6, gapY: 6 };

    measure({
      name: "buildPattern final 4x4",
      detail: "512px motif, scale 0.5",
      iterations: 3,
      operation: () => {
        buildPattern(motif, spec, { mode: "final" });
      }
    });

    measure({
      name: "buildPattern preview 4x4",
      detail: "previewMaxEdge 512",
      iterations: 5,
      operation: () => {
        buildPattern(motif, spec, { mode: "preview", previewMaxEdge: 512 });
      }
    });

    measure({
      name: "buildPattern preview 4x4 small",
      detail: "previewMaxEdge 256",
      iterations: 5,
      operation: () => {
        buildPattern(motif, spec, { mode: "preview", previewMaxEdge: 256 });
      }
    });

    measure({
      name: "repeatTile 4x4 of 256px",
      detail: "1024x1024",
      iterations: 5,
      operation: () => {
        repeatTile(motif, { columns: 2, rows: 2 });
      }
    });

    measure({
      name: "mirrorTile 2x2 of 512px",
      detail: "1024x1024",
      iterations: 5,
      operation: () => {
        mirrorTile(motif, { columns: 2, rows: 2, mode: "both" });
      }
    });

    measure({
      name: "adjustColor 512x512",
      detail: "saturation + contrast",
      iterations: 5,
      operation: () => {
        adjustColor(motif, { saturation: 20, contrast: 10 });
      }
    });

    measure({
      name: "measureSeams 512x512",
      detail: "both axes",
      iterations: 30,
      operation: () => {
        measureSeams(motif);
      }
    });

    measure({
      name: "makeSeamless both medium 512x512",
      detail: "edge mirror blend",
      iterations: 5,
      operation: () => {
        makeSeamless(motif, { axis: "both", blend: "medium" });
      }
    });

    report();
    expect(measurements.length).toBeGreaterThan(0);
  });

  it("measures image processing ops", () => {
    const size = 512;
    const image = createRaster(size, size);
    fillGradient(image, { axis: "diagonal" });
    const transparentBordered = createRaster(size, size);
    fillChecker(transparentBordered, { cellSize: 64 });

    measure({
      name: "applyOpacity 512x512",
      detail: "opacity 0.5",
      iterations: 20,
      operation: () => {
        applyOpacity(image, 0.5);
      }
    });

    measure({
      name: "sharpen 512x512",
      detail: "amount 60, radius 1",
      iterations: 5,
      operation: () => {
        sharpen(image, { amount: 60, radius: 1 });
      }
    });

    measure({
      name: "denoise 512x512",
      detail: "strength 60, 3x3 median",
      iterations: 3,
      operation: () => {
        denoise(image, 60);
      }
    });

    measure({
      name: "analyzeTransparentEdges 512x512",
      detail: "threshold 16",
      iterations: 30,
      operation: () => {
        analyzeTransparentEdges(image);
      }
    });

    measure({
      name: "cleanAlphaFringe 512x512",
      detail: "threshold 16",
      iterations: 10,
      operation: () => {
        cleanAlphaFringe(transparentBordered, { threshold: 16 });
      }
    });

    measure({
      name: "inspectOutput + report 512x512",
      detail: "254mm @ 300dpi",
      iterations: 300,
      batchSize: 100,
      operation: () => {
        buildOutputReport(image, { widthMm: 254, dpi: 300 });
      }
    });

    report();
    expect(measurements.length).toBeGreaterThan(0);
  });

  it("measures large buffer memory footprint", () => {
    const size = 4096;
    const pixels = size * size;
    expect(pixels).toBeLessThanOrEqual(MAX_FIXTURE_PIXELS);

    const before = process.memoryUsage();
    const buffers: Uint8ClampedArray[] = [];
    for (let index = 0; index < 4; index += 1) {
      const image = createRaster(size, size);
      fillChecker(image, { cellSize: 64 });
      buffers.push(image.data);
    }
    const after = process.memoryUsage();
    const deltaMb = (after.arrayBuffers - before.arrayBuffers) / 1024 / 1024;
    console.log(
      `\n[memory] 4 x ${size}x${size} RGBA (single ${(
        (pixels * RGBA_CHANNELS) /
        1024 /
        1024
      ).toFixed(1)}MB, theoretical ${((pixels * RGBA_CHANNELS * 4) / 1024 / 1024).toFixed(
        1
      )}MB); measured arrayBuffers +${deltaMb.toFixed(1)}MB, heapUsed ${(
        (after.heapUsed - before.heapUsed) /
        1024 /
        1024
      ).toFixed(1)}MB, rss +${((after.rss - before.rss) / 1024 / 1024).toFixed(1)}MB\n`
    );

    expect(buffers).toHaveLength(4);
    expect(deltaMb).toBeGreaterThan(0);
  });
});
