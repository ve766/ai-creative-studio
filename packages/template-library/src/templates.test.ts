import { describe, expect, it } from "vitest";
import {
  createProjectFromTemplate,
  getTemplate,
  listTemplates,
  toPrintSpec,
  validateTemplates
} from "./index";
import { TEMPLATES } from "./templates";
import { ProjectSchema } from "@acs/project-schema";

describe("template library", () => {
  it("ships at least ten example templates covering the required categories", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(10);
    const categories = new Set(TEMPLATES.map((template) => template.category));
    for (const required of [
      "mug",
      "tote-bag",
      "tshirt",
      "phone-case",
      "notebook",
      "poster",
      "mousepad",
      "cushion",
      "bottle",
      "sticker"
    ]) {
      expect(categories.has(required as never)).toBe(true);
    }
  });

  it("keeps template ids unique and structurally valid", () => {
    expect(validateTemplates()).toEqual([]);
  });

  it("marks every starter template as an unverified example", () => {
    for (const template of TEMPLATES) {
      expect(template.verified).toBe(false);
      expect(template.example).toBe(true);
    }
  });

  it("filters by category and looks up by id", () => {
    expect(listTemplates({ category: "mug" })).toHaveLength(1);
    expect(getTemplate("mug-standard")?.category).toBe("mug");
    expect(getTemplate("does-not-exist")).toBeNull();
  });

  it("converts output specs into a print spec", () => {
    const template = getTemplate("mug-standard");
    expect(template).not.toBeNull();
    const spec = toPrintSpec(template!);
    expect(spec?.targetWidthMm).toBe(200);
    expect(spec?.dpi).toBe(300);
  });

  it("creates a valid project pinned to a template version", () => {
    const template = getTemplate("mug-standard")!;
    const project = createProjectFromTemplate(template, "我的杯子");
    expect(ProjectSchema.safeParse(project).success).toBe(true);
    expect(project.templateId).toBe("mug-standard");
    expect(project.templateVersion).toBe(template.version);
  });
});
