import { expect, test } from "@playwright/test";
import { createProjectFromTemplate, currentZoom, uploadPattern } from "./helpers";

test("移动端：进入编辑器自动适应窗口，底部面板可开关，可上传图案", async ({ page }) => {
  await createProjectFromTemplate(page, "圆领 T 恤");

  const zoom = await currentZoom(page);
  expect(zoom).toBeLessThan(100);

  const leftPanel = page.locator(".editor-side").first();
  const rightPanel = page.locator(".editor-side-right");
  await expect(leftPanel).toHaveAttribute("data-open", "false");

  await page.getByRole("button", { name: "图层 / 工具" }).click();
  await expect(leftPanel).toHaveAttribute("data-open", "true");

  await uploadPattern(page);
  await expect(page.locator(".layer-row")).toHaveCount(1);
  await expect(leftPanel).toHaveAttribute("data-open", "false");

  await page.getByRole("button", { name: "属性 / 导出" }).click();
  await expect(rightPanel).toHaveAttribute("data-open", "true");
  await expect(page.getByRole("button", { name: /导出效果图 PNG/ })).toBeVisible();

  await page.getByRole("button", { name: "关闭面板" }).click();
  await expect(rightPanel).toHaveAttribute("data-open", "false");

  const fitted = await currentZoom(page);
  expect(fitted).toBeLessThan(100);
});
