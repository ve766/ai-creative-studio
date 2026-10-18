import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  STAGE_CANVAS,
  countPixelsNear,
  createProjectFromTemplate,
  decodePng,
  fitToViewport,
  must,
  setNumberField,
  stageGeometry,
  storedLayer,
  storedProject,
  uploadPattern,
  waitForStoredLayer
} from "./helpers";

const MUG_CANVAS = { width: 1600, height: 680 };
const MUG_TARGET_WIDTH_MM = 200;
const MUG_DPI = 300;
const PATTERN_RGB: [number, number, number] = [220, 38, 38];

test("核心闭环：选模板 → 上传图案 → 调整位置/大小/旋转 → 保存 → 重载 → 导出 PNG", async ({
  page
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("真实文创产品");

  await createProjectFromTemplate(page, "标准马克杯");

  const stage = page.locator(STAGE_CANVAS).first();
  await expect(stage).toBeVisible();

  await uploadPattern(page);
  await expect(page.locator(".layer-row")).toHaveCount(1);

  const uploaded = await waitForStoredLayer(page);
  const project = must(await storedProject(page), "项目未持久化");
  expect(project.canvas).toMatchObject(MUG_CANVAS);
  expect(uploaded.type).toBe("image");
  expect(uploaded.naturalWidth).toBe(8);
  expect(uploaded.naturalHeight).toBe(8);

  const preflight = page.locator(".panel-section", { hasText: "导出前预检" });
  await expect(preflight.locator(".notice-danger")).toContainText("原始宽度仅 8px");

  await fitToViewport(page);
  const geometry = await stageGeometry(page, MUG_CANVAS);
  const centre = { x: uploaded.x + uploaded.width / 2, y: uploaded.y + uploaded.height / 2 };
  const from = geometry.toPagePoint(centre);
  const to = geometry.toPagePoint({ x: centre.x + 80, y: centre.y + 60 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();

  await expect.poll(async () => (await storedLayer(page))?.x ?? 0).toBeGreaterThan(uploaded.x);
  await expect.poll(async () => (await storedLayer(page))?.y ?? 0).toBeGreaterThan(uploaded.y);

  await setNumberField(page, "旋转°", 15);
  await setNumberField(page, "宽", 600);

  await expect.poll(async () => (await storedLayer(page))?.rotation).toBe(15);
  await expect.poll(async () => (await storedLayer(page))?.width).toBe(600);
  const edited = await waitForStoredLayer(page);

  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".editor-topbar .badge")).toHaveAttribute("data-state", "saved");

  await page.reload();
  await expect(page.locator(STAGE_CANVAS).first()).toBeVisible();
  await expect(page.locator(".layer-row")).toHaveCount(1);

  const reloaded = await waitForStoredLayer(page);
  expect(reloaded.rotation).toBe(15);
  expect(reloaded.width).toBe(600);
  expect(reloaded.x).toBeCloseTo(edited.x, 5);
  expect(reloaded.y).toBeCloseTo(edited.y, 5);

  await page.locator(".layer-row").first().click();
  await expect(
    page.locator('label.field:has(span.field-label:text-is("旋转°")) input')
  ).toHaveValue("15");

  const previewDownload = (
    await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /导出效果图 PNG/ }).click()
    ])
  )[0];
  const previewPath = must(await previewDownload.path(), "未获得效果图下载文件");
  const preview = decodePng(await readFile(previewPath));
  expect(preview.width).toBe(MUG_CANVAS.width);
  expect(preview.height).toBe(MUG_CANVAS.height);
  expect(countPixelsNear(preview, PATTERN_RGB, 24)).toBeGreaterThan(1000);

  const expectedPrintWidth = Math.ceil((MUG_TARGET_WIDTH_MM / 25.4) * MUG_DPI);
  const printDownload = (
    await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /导出印刷参考 PNG/ }).click()
    ])
  )[0];
  const printPath = must(await printDownload.path(), "未获得印刷参考下载文件");
  const printPng = decodePng(await readFile(printPath));
  expect(printPng.width).toBe(expectedPrintWidth);
  expect(printPng.height).toBe(
    Math.round((MUG_CANVAS.height * expectedPrintWidth) / MUG_CANVAS.width)
  );

  const jsonDownload = (
    await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "导出项目 JSON" }).click()
    ])
  )[0];
  const jsonPath = must(await jsonDownload.path(), "未获得项目 JSON 下载文件");
  const parsed = JSON.parse(await readFile(jsonPath, "utf8")) as {
    schemaVersion: number;
    layers: unknown[];
  };
  expect(parsed.schemaVersion).toBe(1);
  expect(parsed.layers).toHaveLength(1);
});

test("文字图层：长文本自动增高，不被裁切", async ({ page }) => {
  await createProjectFromTemplate(page, "标准马克杯");
  await page.getByRole("button", { name: "添加文字" }).click();
  await expect(page.locator(".layer-row")).toHaveCount(1);

  const before = await waitForStoredLayer(page);
  const fontSize = must(before.fontSize, "文字图层缺少字号");
  expect(fontSize).toBeGreaterThan(0);

  const longText = "文创图案设计排版文字内容换行测试一二三四五六七八九十";
  const textarea = page.locator(".panel-section", { hasText: "图层属性" }).locator("textarea");
  await textarea.fill(longText);
  await textarea.blur();

  await expect.poll(async () => (await storedLayer(page))?.height ?? 0).toBeGreaterThanOrEqual(
    fontSize * 2
  );

  const after = await waitForStoredLayer(page);
  expect(after.text).toBe(longText);
});
