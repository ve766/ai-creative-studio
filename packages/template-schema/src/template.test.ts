import { describe, expect, it } from "vitest";
import { TemplateSchema, TemplateCategorySchema, TEMPLATE_SCHEMA_VERSION } from "./index";

const validTemplate = {
  id: "demo",
  schemaVersion: TEMPLATE_SCHEMA_VERSION,
  version: 1,
  category: "mug" as const,
  name: "示例",
  description: "",
  previewImage: "/templates/demo.svg",
  verified: false,
  example: true,
  canvas: { width: 1000, height: 500, backgroundColor: "#fff", dpi: 300, unit: "px" as const },
  editableArea: { x: 0, y: 0, width: 1000, height: 500 },
  safeArea: null,
  bleed: null,
  overlays: [],
  model3d: null,
  outputSpec: { widthMm: 200, heightMm: 100, dpi: 300, format: "png" as const, verified: false }
};

describe("template schema", () => {
  it("accepts a well formed template", () => {
    expect(TemplateSchema.safeParse(validTemplate).success).toBe(true);
  });

  it("rejects unknown categories", () => {
    const result = TemplateSchema.safeParse({ ...validTemplate, category: "spaceship" });
    expect(result.success).toBe(false);
  });

  it("rejects non positive canvas sizes", () => {
    const result = TemplateSchema.safeParse({
      ...validTemplate,
      canvas: { ...validTemplate.canvas, width: 0 }
    });
    expect(result.success).toBe(false);
  });

  it("exposes the required category set", () => {
    const categories = TemplateCategorySchema.options;
    expect(categories).toContain("tshirt");
    expect(categories).toContain("sticker");
    expect(new Set(categories).size).toBe(categories.length);
  });
});
