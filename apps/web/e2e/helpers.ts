import { inflateSync } from "node:zlib";
import { expect, type Page } from "@playwright/test";

export const STORAGE_PROJECTS_KEY = "acs.projects.v1";
export const STAGE_CANVAS = ".editor-stage-wrap canvas";

export const TINY_PATTERN_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGO4o6aGFTEMLQkAF/tKAS/fz4YAAAAASUVORK5CYII=",
  "base64"
);

export interface StoredLayer {
  id: string;
  type: "image" | "text";
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  fontSize?: number;
  text?: string;
  naturalWidth?: number;
  naturalHeight?: number;
}

export interface StoredProject {
  id: string;
  name: string;
  canvas: { width: number; height: number };
  layers: StoredLayer[];
  updatedAt: string;
}

export function must<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

export function first<T>(items: T[]): T {
  return must(items[0], "期望至少一个元素，但数组为空");
}

export async function createProjectFromTemplate(page: Page, templateName: string): Promise<void> {
  await page.goto("/templates");
  const card = page.locator("article.template-card", { hasText: templateName });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "开始设计" }).click();
  await expect(page).toHaveURL(/\/editor\/prj_/);
  await expect(page.locator(STAGE_CANVAS).first()).toBeVisible();
}

export async function uploadPattern(page: Page, name = "pattern.png"): Promise<void> {
  await page.setInputFiles('input[accept="image/png,image/jpeg,image/webp"]', {
    name,
    mimeType: "image/png",
    buffer: TINY_PATTERN_PNG
  });
}

export function numberField(page: Page, label: string) {
  return page.locator(`label.field:has(span.field-label:text-is("${label}")) input`);
}

export async function setNumberField(page: Page, label: string, value: number): Promise<void> {
  const input = numberField(page, label);
  await input.fill(String(value));
  await input.press("Enter");
  await expect(input).toHaveValue(String(value));
}

export async function currentZoom(page: Page): Promise<number> {
  const text = await page.locator(".editor-topbar span", { hasText: "%" }).first().innerText();
  const parsed = Number.parseInt(text.replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(parsed)) throw new Error(`无法读取缩放比例：${text}`);
  return parsed;
}

// Mirrors EditorWorkspace.fitToViewport so tests can convert canvas coordinates
// (the layer geometry stored in the project) into page coordinates.
export async function stageGeometry(
  page: Page,
  canvas: { width: number; height: number }
): Promise<{ zoom: number; toPagePoint: (point: { x: number; y: number }) => { x: number; y: number } }> {
  const wrap = page.locator(".editor-stage-wrap");
  const box = must(await wrap.boundingBox(), "编辑器画布区域不可见");
  const size = await wrap.evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight
  }));
  const zoom = Math.min(size.width / canvas.width, size.height / canvas.height) * 0.9;
  const panX = (size.width - canvas.width * zoom) / 2;
  const panY = (size.height - canvas.height * zoom) / 2;
  return {
    zoom,
    toPagePoint: (point) => ({
      x: box.x + panX + point.x * zoom,
      y: box.y + panY + point.y * zoom
    })
  };
}

export async function fitToViewport(page: Page): Promise<void> {
  await page.getByRole("button", { name: "适应", exact: true }).click();
}

// Autosave is debounced (800ms), so every read of the persisted project must be
// polled instead of read once.
export async function storedLayer(page: Page, index = 0): Promise<StoredLayer | null> {
  return page.evaluate(
    ({ key, layerIndex }) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const map = JSON.parse(raw) as Record<string, { layers?: unknown[] }>;
      const project = Object.values(map)[0];
      if (!project || !Array.isArray(project.layers)) return null;
      return (project.layers[layerIndex] ?? null) as never;
    },
    { key: STORAGE_PROJECTS_KEY, layerIndex: index }
  );
}

export async function storedProject(page: Page): Promise<StoredProject | null> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, unknown>;
    return (Object.values(map)[0] ?? null) as never;
  }, STORAGE_PROJECTS_KEY);
}

export async function waitForStoredLayer(page: Page, index = 0): Promise<StoredLayer> {
  await expect
    .poll(async () => (await storedLayer(page, index)) !== null, { timeout: 8000 })
    .toBe(true);
  return must(await storedLayer(page, index), "项目未持久化图层");
}

interface DecodedPng {
  width: number;
  height: number;
  channels: number;
  pixels: Uint8Array;
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

export function decodePng(buffer: Buffer): DecodedPng {
  const expected = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, 8).equals(expected)) throw new Error("不是合法的 PNG 文件");

  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data.readUInt8(8);
      const colorType = data.readUInt8(9);
      const interlaced = data.readUInt8(12);
      if (bitDepth !== 8) throw new Error(`不支持的位深：${bitDepth}`);
      if (interlaced !== 0) throw new Error("不支持交错 PNG");
      channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
      if (channels === 0) throw new Error(`不支持的颜色类型：${colorType}`);
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(stride * height);

  for (let y = 0; y < height; y += 1) {
    const filter = raw.readUInt8(y * (stride + 1));
    const lineStart = y * (stride + 1) + 1;
    const outStart = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw.readUInt8(lineStart + x);
      const left = x >= channels ? pixels[outStart + x - channels] ?? 0 : 0;
      const up = y > 0 ? pixels[outStart - stride + x] ?? 0 : 0;
      const upLeft = y > 0 && x >= channels ? pixels[outStart - stride + x - channels] ?? 0 : 0;
      let decoded = value;
      if (filter === 1) decoded = value + left;
      else if (filter === 2) decoded = value + up;
      else if (filter === 3) decoded = value + Math.floor((left + up) / 2);
      else if (filter === 4) decoded = value + paeth(left, up, upLeft);
      else if (filter !== 0) throw new Error(`未知的 PNG 过滤器：${filter}`);
      pixels[outStart + x] = decoded & 0xff;
    }
  }

  return { width, height, channels, pixels };
}

export function countPixelsNear(
  png: DecodedPng,
  rgb: [number, number, number],
  tolerance: number
): number {
  const [tr, tg, tb] = rgb;
  let count = 0;
  for (let i = 0; i < png.pixels.length; i += png.channels) {
    const r = png.pixels[i] ?? 0;
    const g = png.pixels[i + 1] ?? 0;
    const b = png.pixels[i + 2] ?? 0;
    if (
      Math.abs(r - tr) <= tolerance &&
      Math.abs(g - tg) <= tolerance &&
      Math.abs(b - tb) <= tolerance
    ) {
      count += 1;
    }
  }
  return count;
}
