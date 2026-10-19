import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { crc32, decodePng, encodePng, PNG_SIGNATURE } from "./png";
import {
  FIXTURE_NAMES,
  FixtureError,
  createFixture,
  getPixel,
  hashRaster,
  setPixel,
  createRaster
} from "./fixtures";

function buildTinyPng(colorType: number, channels: number, pixels: number[]): Uint8Array {
  const table = (() => {
    const result = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      result[index] = value >>> 0;
    }
    return result;
  })();
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const body = new Uint8Array([...type].map((char) => char.charCodeAt(0)).concat(Array.from(data)));
    let crc = 0xffffffff;
    for (const byte of body) crc = (table[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
    const checksum = (crc ^ 0xffffffff) >>> 0;
    const out = new Uint8Array(4 + body.length + 4);
    out[0] = (data.length >>> 24) & 0xff;
    out[1] = (data.length >>> 16) & 0xff;
    out[2] = (data.length >>> 8) & 0xff;
    out[3] = data.length & 0xff;
    out.set(body, 4);
    out[4 + body.length] = (checksum >>> 24) & 0xff;
    out[5 + body.length] = (checksum >>> 16) & 0xff;
    out[6 + body.length] = (checksum >>> 8) & 0xff;
    out[7 + body.length] = checksum & 0xff;
    return out;
  };
  const header = new Uint8Array(13);
  header[3] = 1;
  header[7] = 1;
  header[8] = 8;
  header[9] = colorType;
  const raw = new Uint8Array(1 + channels);
  raw[0] = 0;
  raw.set(pixels.slice(0, channels), 1);
  return Uint8Array.from([
    ...PNG_SIGNATURE,
    ...chunk("IHDR", header),
    ...chunk("IDAT", new Uint8Array(deflateSync(raw))),
    ...chunk("IEND", new Uint8Array(0))
  ]);
}

describe("PNG codec", () => {
  it("computes the standard CRC-32 check value", () => {
    expect(crc32(Uint8Array.from("123456789", (char) => char.charCodeAt(0)))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it("writes a real PNG container for RGBA input", () => {
    const image = createRaster(3, 2);
    setPixel(image, 0, 0, [1, 2, 3, 4]);
    const encoded = encodePng(image);
    expect(Array.from(encoded.subarray(0, 8))).toEqual(Array.from(PNG_SIGNATURE));
    const text = String.fromCharCode(...encoded.subarray(12, 16));
    expect(text).toBe("IHDR");
    expect(encoded[16 + 8]).toBe(8);
    expect(encoded[16 + 9]).toBe(6);
    expect(pngHasChunk(encoded, "IDAT")).toBe(true);
    expect(pngHasChunk(encoded, "IEND")).toBe(true);
  });

  it("round-trips every named fixture without changing a single byte", () => {
    for (const name of FIXTURE_NAMES) {
      const fixture = createFixture(name);
      const decoded = decodePng(encodePng(fixture));
      expect(decoded.width).toBe(fixture.width);
      expect(decoded.height).toBe(fixture.height);
      expect(decoded.sourceChannels).toBe(4);
      expect(hashRaster(decoded)).toBe(hashRaster(fixture));
      expect(Array.from(decoded.data)).toEqual(Array.from(fixture.data));
    }
  });

  it("round-trips alpha values exactly", () => {
    const image = createRaster(4, 1);
    setPixel(image, 0, 0, [10, 20, 30, 0]);
    setPixel(image, 1, 0, [10, 20, 30, 64]);
    setPixel(image, 2, 0, [10, 20, 30, 200]);
    setPixel(image, 3, 0, [10, 20, 30, 255]);
    const decoded = decodePng(encodePng(image));
    expect([0, 1, 2, 3].map((x) => getPixel(decoded, x, 0)[3])).toEqual([0, 64, 200, 255]);
  });

  it("expands RGB and greyscale PNGs into RGBA with opaque alpha", () => {
    const rgb = decodePng(buildTinyPng(2, 3, [1, 2, 3]));
    expect(rgb.sourceChannels).toBe(3);
    expect(getPixel(rgb, 0, 0)).toEqual([1, 2, 3, 255]);

    const grey = decodePng(buildTinyPng(0, 1, [128]));
    expect(grey.sourceChannels).toBe(1);
    expect(getPixel(grey, 0, 0)).toEqual([128, 128, 128, 255]);
  });

  it("rejects malformed input with explicit errors", () => {
    expect(() => decodePng(new Uint8Array(0))).toThrow(/过短/u);
    expect(() => decodePng(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(/不是合法的 PNG/u);

    const valid = encodePng(createFixture("checker-tiny"));
    expect(() => decodePng(valid.subarray(0, 20))).toThrow(FixtureError);
    expect(() => decodePng(valid.subarray(0, valid.length - 4))).toThrow(FixtureError);

    const interlaced = valid.slice();
    interlaced[8 + 8 + 12] = 1;
    expect(() => decodePng(interlaced)).toThrow(/交错/u);

    const unsupportedDepth = valid.slice();
    unsupportedDepth[8 + 8 + 8] = 16;
    expect(() => decodePng(unsupportedDepth)).toThrow(/位深/u);

    const unsupportedColor = valid.slice();
    unsupportedColor[8 + 8 + 9] = 3;
    expect(() => decodePng(unsupportedColor)).toThrow(/颜色类型/u);
  });

  it("rejects a pixel buffer that does not match its declared size", () => {
    const image = { width: 4, height: 4, data: new Uint8ClampedArray(8) };
    expect(() => encodePng(image)).toThrow(/长度与宽高不匹配/u);
  });
});

function pngHasChunk(bytes: Uint8Array, type: string): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const name = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0
    );
    if (name === type) return true;
    offset += 12 + length;
  }
  return false;
}
