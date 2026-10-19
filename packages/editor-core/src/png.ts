import { deflateSync, inflateSync } from "node:zlib";
import { RGBA_CHANNELS, FixtureError, type RasterImage } from "./fixtures";

export const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = (CRC_TABLE[(crc ^ (bytes[index] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function writeUint32(value: number): Uint8Array {
  return Uint8Array.from([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff
  ]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = Uint8Array.from([...type].map((char) => char.charCodeAt(0)));
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const checksum = crc32(body);
  const result = new Uint8Array(4 + body.length + 4);
  result.set(writeUint32(data.length), 0);
  result.set(body, 4);
  result.set(writeUint32(checksum), 4 + body.length);
  return result;
}

export interface EncodePngOptions {
  compressionLevel?: number;
}

export function encodePng(image: RasterImage, options: EncodePngOptions = {}): Uint8Array {
  const { width, height, data } = image;
  if (width <= 0 || height <= 0 || data.length !== width * height * RGBA_CHANNELS) {
    throw new FixtureError("无法编码：像素缓冲区长度与宽高不匹配");
  }

  const header = new Uint8Array(13);
  header.set(writeUint32(width), 0);
  header.set(writeUint32(height), 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = width * RGBA_CHANNELS;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    raw.set(data.subarray(y * stride, (y + 1) * stride), rowStart + 1);
  }

  const idat = new Uint8Array(
    deflateSync(raw, { level: options.compressionLevel ?? 6 })
  );

  const parts = [
    PNG_SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array(0))
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export interface DecodePngResult extends RasterImage {
  readonly sourceChannels: number;
}

export function decodePng(bytes: Uint8Array): DecodePngResult {
  if (bytes.length < 8) throw new FixtureError("PNG 数据过短");
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) throw new FixtureError("不是合法的 PNG 文件");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  let sawEnd = false;
  const idatParts: Uint8Array[] = [];

  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0
    );
    const dataStart = offset + 8;
    if (dataStart + length + 4 > bytes.length) throw new FixtureError("PNG 数据被截断");
    const data = bytes.subarray(dataStart, dataStart + length);

    if (type === "IHDR") {
      width = view.getUint32(dataStart);
      height = view.getUint32(dataStart + 4);
      const bitDepth = bytes[dataStart + 8] ?? 0;
      const colorType = bytes[dataStart + 9] ?? 0;
      const interlace = bytes[dataStart + 12] ?? 0;
      if (bitDepth !== 8) throw new FixtureError(`不支持的位深：${bitDepth}`);
      if (interlace !== 0) throw new FixtureError("不支持交错 PNG");
      if (colorType === 0) channels = 1;
      else if (colorType === 2) channels = 3;
      else if (colorType === 6) channels = 4;
      else throw new FixtureError(`不支持的颜色类型：${colorType}`);
      if (width <= 0 || height <= 0) throw new FixtureError("PNG 宽高无效");
    } else if (type === "IDAT") {
      idatParts.push(data);
    } else if (type === "IEND") {
      sawEnd = true;
      break;
    }
    offset = dataStart + length + 4;
  }

  if (!sawEnd) throw new FixtureError("PNG 缺少 IEND 块");
  if (channels === 0) throw new FixtureError("PNG 缺少 IHDR 块");

  const merged = new Uint8Array(idatParts.reduce((sum, part) => sum + part.length, 0));
  let mergedOffset = 0;
  for (const part of idatParts) {
    merged.set(part, mergedOffset);
    mergedOffset += part.length;
  }

  let raw: Uint8Array;
  try {
    raw = new Uint8Array(inflateSync(merged));
  } catch (error) {
    throw new FixtureError(
      `PNG 解压失败：${error instanceof Error ? error.message : "未知错误"}`
    );
  }

  const stride = width * channels;
  if (raw.length < (stride + 1) * height) throw new FixtureError("PNG 像素数据不完整");
  const data = new Uint8ClampedArray(width * height * RGBA_CHANNELS);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const lineStart = y * (stride + 1) + 1;
    const outStart = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[lineStart + x] ?? 0;
      const left = x >= channels ? (raw[outStart + x - channels] ?? 0) : 0;
      const up = y > 0 ? (raw[outStart - stride + x] ?? 0) : 0;
      const upLeft = y > 0 && x >= channels ? (raw[outStart - stride + x - channels] ?? 0) : 0;
      let decoded = value;
      if (filter === 1) decoded = value + left;
      else if (filter === 2) decoded = value + up;
      else if (filter === 3) decoded = value + Math.floor((left + up) / 2);
      else if (filter === 4) decoded = value + paeth(left, up, upLeft);
      else if (filter !== 0) throw new FixtureError(`未知的 PNG 过滤器：${filter}`);
      raw[outStart + x] = decoded & 0xff;
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = y * stride + x * channels;
      const target = (y * width + x) * RGBA_CHANNELS;
      if (channels === 4) {
        data[target] = raw[source] ?? 0;
        data[target + 1] = raw[source + 1] ?? 0;
        data[target + 2] = raw[source + 2] ?? 0;
        data[target + 3] = raw[source + 3] ?? 0;
      } else if (channels === 3) {
        data[target] = raw[source] ?? 0;
        data[target + 1] = raw[source + 1] ?? 0;
        data[target + 2] = raw[source + 2] ?? 0;
        data[target + 3] = 255;
      } else {
        const gray = raw[source] ?? 0;
        data[target] = gray;
        data[target + 1] = gray;
        data[target + 2] = gray;
        data[target + 3] = 255;
      }
    }
  }

  return { width, height, data, sourceChannels: channels };
}
