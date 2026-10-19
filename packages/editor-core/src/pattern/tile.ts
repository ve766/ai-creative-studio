import { invalidParam } from "../errors";
import {
  RGBA_CHANNELS,
  assertPixelBudget,
  createRaster,
  wrapRaster,
  type RasterImage
} from "../raster";
import {
  normalizeMirrorTile,
  normalizeTileRepeat,
  type MirrorTileInput,
  type MirrorTileParams,
  type TileRepeatInput,
  type TileRepeatParams
} from "./params";

function blitRegion(
  source: RasterImage,
  target: RasterImage,
  targetColumn: number,
  targetRow: number,
  mirrorX: boolean,
  mirrorY: boolean
): void {
  const rowBytes = source.width * RGBA_CHANNELS;
  const targetWidthPx = target.width * RGBA_CHANNELS;
  const columnOffset = targetColumn * source.width * RGBA_CHANNELS;
  const rowOffset = targetRow * source.height * targetWidthPx;

  for (let y = 0; y < source.height; y += 1) {
    const sourceY = mirrorY ? source.height - 1 - y : y;
    const sourceRowStart = sourceY * rowBytes;
    const targetRowStart = rowOffset + y * targetWidthPx + columnOffset;
    if (!mirrorX) {
      target.data.set(
        source.data.subarray(sourceRowStart, sourceRowStart + rowBytes),
        targetRowStart
      );
      continue;
    }
    for (let x = 0; x < source.width; x += 1) {
      const sourcePixel = sourceRowStart + (source.width - 1 - x) * RGBA_CHANNELS;
      const targetPixel = targetRowStart + x * RGBA_CHANNELS;
      target.data[targetPixel] = source.data[sourcePixel] ?? 0;
      target.data[targetPixel + 1] = source.data[sourcePixel + 1] ?? 0;
      target.data[targetPixel + 2] = source.data[sourcePixel + 2] ?? 0;
      target.data[targetPixel + 3] = source.data[sourcePixel + 3] ?? 0;
    }
  }
}

export function repeatTile(source: RasterImage, input: TileRepeatInput = {}): RasterImage {
  wrapRaster(source);
  const params: TileRepeatParams = normalizeTileRepeat(input);
  const width = source.width * params.columns;
  const height = source.height * params.rows;
  assertPixelBudget(width, height);
  const output = createRaster(width, height);
  for (let row = 0; row < params.rows; row += 1) {
    for (let column = 0; column < params.columns; column += 1) {
      blitRegion(source, output, column, row, false, false);
    }
  }
  return output;
}

export function mirrorTile(source: RasterImage, input: MirrorTileInput = {}): RasterImage {
  wrapRaster(source);
  const params: MirrorTileParams = normalizeMirrorTile(input);
  const width = source.width * params.columns;
  const height = source.height * params.rows;
  assertPixelBudget(width, height);
  const output = createRaster(width, height);
  const flipHorizontal = params.mode === "horizontal" || params.mode === "both";
  const flipVertical = params.mode === "vertical" || params.mode === "both";

  for (let row = 0; row < params.rows; row += 1) {
    for (let column = 0; column < params.columns; column += 1) {
      blitRegion(
        source,
        output,
        column,
        row,
        flipHorizontal && column % 2 === 1,
        flipVertical && row % 2 === 1
      );
    }
  }
  return output;
}

export function offsetWrap(image: RasterImage, offsetX: number, offsetY: number): RasterImage {
  wrapRaster(image);
  if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)) {
    throw invalidParam(`偏移必须是有限数字，收到 (${String(offsetX)}, ${String(offsetY)})`);
  }
  const shiftX = ((Math.trunc(offsetX) % image.width) + image.width) % image.width;
  const shiftY = ((Math.trunc(offsetY) % image.height) + image.height) % image.height;
  const output = createRaster(image.width, image.height);
  for (let y = 0; y < image.height; y += 1) {
    const sourceY = (y - shiftY + image.height) % image.height;
    for (let x = 0; x < image.width; x += 1) {
      const sourceX = (x - shiftX + image.width) % image.width;
      const from = (sourceY * image.width + sourceX) * RGBA_CHANNELS;
      const to = (y * image.width + x) * RGBA_CHANNELS;
      output.data[to] = image.data[from] ?? 0;
      output.data[to + 1] = image.data[from + 1] ?? 0;
      output.data[to + 2] = image.data[from + 2] ?? 0;
      output.data[to + 3] = image.data[from + 3] ?? 0;
    }
  }
  return output;
}
