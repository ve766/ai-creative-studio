import {
  RGBA_CHANNELS,
  assertPositiveInt,
  createRandom,
  createRaster,
  wrapRaster,
  type RasterImage
} from "../raster";
import { normalizeArrange, type ArrangeInput, type ArrangeParams } from "./params";

export interface ArrangeLayout {
  canvasWidth: number;
  canvasHeight: number;
  cellWidth: number;
  cellHeight: number;
  staggerX: number;
  staggerY: number;
  jitterPad: number;
  placements: Array<{ x: number; y: number }>;
}

export function planArrangeLayout(
  cellWidth: number,
  cellHeight: number,
  params: ArrangeParams
): ArrangeLayout {
  assertPositiveInt(cellWidth, "图案单元宽度");
  assertPositiveInt(cellHeight, "图案单元高度");
  const staggerX = params.pattern === "half-drop" ? Math.floor(cellWidth / 2) : 0;
  const staggerY = params.pattern === "offset" ? Math.floor(cellHeight / 2) : 0;
  const jitterPad = params.jitter;

  const canvasWidth =
    params.columns * cellWidth + (params.columns - 1) * params.gapX + staggerX + jitterPad * 2;
  const canvasHeight =
    params.rows * cellHeight + (params.rows - 1) * params.gapY + staggerY + jitterPad * 2;

  const random = createRandom(params.seed);
  const placements: Array<{ x: number; y: number }> = [];
  for (let row = 0; row < params.rows; row += 1) {
    for (let column = 0; column < params.columns; column += 1) {
      let x = jitterPad + column * (cellWidth + params.gapX);
      let y = jitterPad + row * (cellHeight + params.gapY);
      if (params.pattern === "half-drop" && row % 2 === 1) x += staggerX;
      if (params.pattern === "offset" && column % 2 === 1) y += staggerY;
      if (params.jitter > 0) {
        x += Math.round((random() * 2 - 1) * params.jitter);
        y += Math.round((random() * 2 - 1) * params.jitter);
      }
      placements.push({ x, y });
    }
  }

  return {
    canvasWidth,
    canvasHeight,
    cellWidth,
    cellHeight,
    staggerX,
    staggerY,
    jitterPad,
    placements
  };
}

export function planArrange(motif: RasterImage, input: ArrangeInput = {}): ArrangeLayout {
  wrapRaster(motif);
  return planArrangeLayout(motif.width, motif.height, normalizeArrange(input));
}

function blendPixel(
  target: RasterImage,
  targetX: number,
  targetY: number,
  red: number,
  green: number,
  blue: number,
  alpha: number
): void {
  if (targetX < 0 || targetY < 0 || targetX >= target.width || targetY >= target.height) return;
  if (alpha === 0) return;
  const index = (targetY * target.width + targetX) * RGBA_CHANNELS;
  if (alpha === 255) {
    target.data[index] = red;
    target.data[index + 1] = green;
    target.data[index + 2] = blue;
    target.data[index + 3] = 255;
    return;
  }
  const sourceAlpha = alpha / 255;
  const destAlpha = (target.data[index + 3] ?? 0) / 255;
  const outAlpha = sourceAlpha + destAlpha * (1 - sourceAlpha);
  if (outAlpha <= 0) return;
  const mix = (source: number, dest: number): number =>
    Math.round((source * sourceAlpha + dest * destAlpha * (1 - sourceAlpha)) / outAlpha);
  target.data[index] = mix(red, target.data[index] ?? 0);
  target.data[index + 1] = mix(green, target.data[index + 1] ?? 0);
  target.data[index + 2] = mix(blue, target.data[index + 2] ?? 0);
  target.data[index + 3] = Math.round(outAlpha * 255);
}

function blitMotif(target: RasterImage, motif: RasterImage, offsetX: number, offsetY: number): void {
  const rowBytes = motif.width * RGBA_CHANNELS;
  const targetRowBytes = target.width * RGBA_CHANNELS;
  const startY = Math.max(0, -offsetY);
  const endY = Math.min(motif.height, target.height - offsetY);
  const startX = Math.max(0, -offsetX);
  const endX = Math.min(motif.width, target.width - offsetX);
  if (startX >= endX || startY >= endY) return;

  const fullRow = startX === 0 && endX === motif.width;
  for (let y = startY; y < endY; y += 1) {
    const targetRowStart = (offsetY + y) * targetRowBytes + (offsetX + startX) * RGBA_CHANNELS;
    const sourceRowStart = y * rowBytes + startX * RGBA_CHANNELS;
    let opaque = true;
    for (let x = startX; x < endX; x += 1) {
      if ((motif.data[y * rowBytes + x * RGBA_CHANNELS + 3] ?? 0) !== 255) {
        opaque = false;
        break;
      }
    }
    if (opaque) {
      if (fullRow) {
        target.data.set(motif.data.subarray(y * rowBytes, y * rowBytes + rowBytes), (offsetY + y) * targetRowBytes + offsetX * RGBA_CHANNELS);
      } else {
        target.data.set(
          motif.data.subarray(sourceRowStart, sourceRowStart + (endX - startX) * RGBA_CHANNELS),
          targetRowStart
        );
      }
      continue;
    }
    for (let x = startX; x < endX; x += 1) {
      const source = y * rowBytes + x * RGBA_CHANNELS;
      blendPixel(
        target,
        offsetX + x,
        offsetY + y,
        motif.data[source] ?? 0,
        motif.data[source + 1] ?? 0,
        motif.data[source + 2] ?? 0,
        motif.data[source + 3] ?? 0
      );
    }
  }
}

export function renderLayout(motif: RasterImage, layout: ArrangeLayout): RasterImage {
  wrapRaster(motif);
  const output = createRaster(layout.canvasWidth, layout.canvasHeight);
  for (const placement of layout.placements) {
    blitMotif(output, motif, placement.x, placement.y);
  }
  return output;
}

export function arrangeMotif(motif: RasterImage, input: ArrangeInput = {}): RasterImage {
  return renderLayout(motif, planArrange(motif, input));
}
