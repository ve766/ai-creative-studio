import { expect, test } from "@playwright/test";
import {
  createProjectFromTemplate,
  setNumberField,
  storedLayer,
  uploadPattern,
  waitForStoredLayer
} from "./helpers";

test("图像处理闭环：裁切/调整生成新图层且可撤销", async ({ page }) => {
  await createProjectFromTemplate(page, "标准马克杯");
  await uploadPattern(page);
  await expect(page.locator(".layer-row")).toHaveCount(1);

  const source = await waitForStoredLayer(page);
  expect(source.type).toBe("image");
  expect(source.naturalWidth).toBe(8);
  expect(source.naturalHeight).toBe(8);

  const section = page.locator(".panel-section", { hasText: "图像处理（生成新图层）" });
  await expect(section).toBeVisible();
  await expect(section).toContainText("原图 8×8px");
  await expect(section).toContainText("dpi");

  await setNumberField(page, "裁切宽", 4);
  await setNumberField(page, "裁切高", 4);
  await section.getByRole("button", { name: "裁切为新图层" }).click();

  await expect(page.locator(".layer-row")).toHaveCount(2);
  await expect(page.locator(".notice-info")).toContainText("已生成新图层");

  const cropped = await waitForStoredLayer(page, 1);
  expect(cropped.naturalWidth).toBe(4);
  expect(cropped.naturalHeight).toBe(4);
  expect(cropped.width).toBeCloseTo(source.width / 2, 0);
  expect(cropped.height).toBeCloseTo(source.height / 2, 0);
  expect(cropped.x).toBeCloseTo(source.x, 0);
  expect(cropped.y).toBeCloseTo(source.y, 0);

  await page.locator(".layer-row").first().click();
  await page.keyboard.press("Control+z");
  await expect(page.locator(".layer-row")).toHaveCount(1);

  await page.locator(".layer-row").first().click();
  await expect(section).toBeVisible();
  await setNumberField(page, "亮度", 40);
  await section.getByRole("button", { name: "调整为新图层" }).click();

  await expect(page.locator(".layer-row")).toHaveCount(2);
  await expect.poll(async () => (await storedLayer(page, 1))?.naturalWidth).toBe(8);
  const adjusted = await waitForStoredLayer(page, 1);
  expect(adjusted.naturalHeight).toBe(8);
  expect(adjusted.src).not.toBe(source.src);
});
