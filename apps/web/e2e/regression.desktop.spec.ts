import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  createProjectFromTemplate,
  must,
  setNumberField,
  storedLayer,
  storedProject,
  uploadPattern,
  waitForStoredLayer
} from "./helpers";

const TEXTAREA = ".panel-section:has-text(\"图层属性\") textarea";
const BANNER = ".editor-root > .notice";

async function addText(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: "添加文字" }).click();
}

test("撤销/重做：连续输入只回退一步，且可以重做", async ({ page }) => {
  await createProjectFromTemplate(page, "标准马克杯");
  await addText(page);
  await expect(page.locator(".layer-row")).toHaveCount(1);

  const original = must(await waitForStoredLayer(page), "文字图层未持久化");
  const originalText = must(original.text, "文字图层缺少文本");

  const textarea = page.locator(TEXTAREA);
  await textarea.fill("文案");
  await textarea.pressSequentially("AB");
  await textarea.blur();

  await expect.poll(async () => (await storedLayer(page))?.text).toBe("文案AB");

  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await storedLayer(page))?.text).toBe(originalText);

  await page.keyboard.press("Control+Shift+z");
  await expect.poll(async () => (await storedLayer(page))?.text).toBe("文案AB");

  await page.keyboard.press("Control+y");
  await expect.poll(async () => (await storedLayer(page))?.text).toBe("文案AB");
});

test("图层顺序与可见性：下移改变叠放顺序，隐藏后不参与导出", async ({ page }) => {
  await createProjectFromTemplate(page, "标准马克杯");
  await addText(page);
  await uploadPattern(page);
  await expect(page.locator(".layer-row")).toHaveCount(2);
  await expect.poll(async () => (await storedProject(page))?.layers.length ?? 0).toBe(2);

  const initial = must(await storedProject(page), "图层未持久化");
  expect(initial.layers[0]?.type).toBe("text");
  expect(initial.layers[1]?.type).toBe("image");
  const textId = must(
    initial.layers.find((layer) => layer.type === "text")?.id,
    "未找到文字图层"
  );

  await page.locator(".layer-row").nth(0).click();
  await page.getByRole("button", { name: "下移", exact: true }).click();
  await expect
    .poll(async () => (await storedProject(page))?.layers[0]?.type ?? null)
    .toBe("image");

  await page.locator(".layer-row").nth(0).locator('button.icon-btn[title="隐藏"]').click();

  await expect
    .poll(async () => {
      const project = must(await storedProject(page), "项目未持久化");
      const text = project.layers.find((layer) => layer.type === "text");
      return text ? text.visible : true;
    })
    .toBe(false);

  const project = must(await storedProject(page), "项目未持久化");
  const textLayer = must(
    project.layers.find((layer) => layer.id === textId),
    "未找到文字图层"
  );
  expect(textLayer.type).toBe("text");
  expect(textLayer.visible).toBe(false);
  expect(project.layers[0]?.type).toBe("image");
});

test("项目 JSON：导出后可重新导入，几何数据保持一致", async ({ page }) => {
  await createProjectFromTemplate(page, "标准马克杯");
  await uploadPattern(page);
  await setNumberField(page, "宽", 600);
  await expect.poll(async () => (await storedLayer(page))?.width).toBe(600);

  const editorUrl = page.url();
  const download = (
    await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "导出项目 JSON" }).click()
    ])
  )[0];
  const jsonPath = must(await download.path(), "未获得 JSON 下载文件");
  const raw = await readFile(jsonPath, "utf8");
  const exported = JSON.parse(raw) as {
    schemaVersion: number;
    name: string;
    layers: Array<{ type: string; width: number; visible: boolean }>;
  };
  expect(exported.schemaVersion).toBe(1);
  expect(exported.layers).toHaveLength(1);
  expect(exported.layers[0]?.width).toBe(600);

  await page.goto("/projects");
  const cardsBefore = await page.locator("article.card").count();
  await page.locator('input[accept="application/json"]').setInputFiles({
    name: "roundtrip.json",
    mimeType: "application/json",
    buffer: Buffer.from(raw, "utf8")
  });

  await expect(page.locator(".notice-info")).toContainText("已导入项目");
  await expect(page.locator("article.card")).toHaveCount(cardsBefore + 1);

  const stored = await page.evaluate(() => {
    const raw2 = window.localStorage.getItem("acs.projects.v1");
    if (!raw2) return null;
    const map = JSON.parse(raw2) as Record<
      string,
      { id: string; layers: Array<{ width: number; type: string }> }
    >;
    return Object.values(map).map((project) => ({
      id: project.id,
      layer: project.layers[0] ?? null
    }));
  });
  const roundTripped = must(stored, "本地未持久化项目");
  expect(roundTripped).toHaveLength(cardsBefore + 1);
  expect(roundTripped.filter((item) => item.layer?.width === 600)).toHaveLength(2);
  expect(roundTripped.map((item) => item.id)).toContain(editorUrl.split("/").pop() ?? "");
});

test("非法输入被拒绝：损坏图片与非项目 JSON 都不产生图层", async ({ page }) => {
  await createProjectFromTemplate(page, "标准马克杯");
  const editorUrl = page.url();
  await expect(page.locator(".layer-row")).toHaveCount(0);

  await page.locator('input[accept="application/json"]').setInputFiles({
    name: "not-a-project.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"hello":"world"}', "utf8")
  });
  await expect(page.locator(BANNER)).toBeVisible();
  expect(page.url()).toBe(editorUrl);

  await page.setInputFiles('input[accept="image/png,image/jpeg,image/webp"]', {
    name: "broken.png",
    mimeType: "image/png",
    buffer: Buffer.from("this is definitely not a png file", "utf8")
  });
  await expect(page.locator(BANNER)).toContainText("解码失败");
  await expect(page.locator(".layer-row")).toHaveCount(0);
});
