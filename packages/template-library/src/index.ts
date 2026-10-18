import type { Project, PrintSpec } from "@acs/project-schema";
import { createProject } from "@acs/project-schema";
import type { ProductTemplate, TemplateCategory } from "@acs/template-schema";
import { TemplateSchema } from "@acs/template-schema";
import { TEMPLATES } from "./templates";

export { TEMPLATES } from "./templates";
export { defineTemplate } from "./define";
export type { TemplateDraft } from "./define";

export const TEMPLATES_BY_ID: ReadonlyMap<string, ProductTemplate> = new Map(
  TEMPLATES.map((template) => [template.id, template])
);

export interface TemplateFilter {
  category?: TemplateCategory;
}

export function listTemplates(filter: TemplateFilter = {}): ProductTemplate[] {
  return TEMPLATES.filter((template) =>
    filter.category ? template.category === filter.category : true
  );
}

export function getTemplate(id: string): ProductTemplate | null {
  return TEMPLATES_BY_ID.get(id) ?? null;
}

export interface TemplateValidationIssue {
  id: string;
  message: string;
}

export function validateTemplates(): TemplateValidationIssue[] {
  const issues: TemplateValidationIssue[] = [];
  const seen = new Set<string>();
  for (const template of TEMPLATES) {
    const parsed = TemplateSchema.safeParse(template);
    if (!parsed.success) {
      issues.push({
        id: template.id,
        message: parsed.error.issues.map((issue) => issue.message).join("; ")
      });
    }
    if (seen.has(template.id)) {
      issues.push({ id: template.id, message: "模板 ID 重复" });
    }
    seen.add(template.id);
    if (template.editableArea.x + template.editableArea.width > template.canvas.width) {
      issues.push({ id: template.id, message: "可编辑区域超出画布宽度" });
    }
    if (template.editableArea.y + template.editableArea.height > template.canvas.height) {
      issues.push({ id: template.id, message: "可编辑区域超出画布高度" });
    }
  }
  return issues;
}

export function toPrintSpec(template: ProductTemplate): PrintSpec | null {
  const spec = template.outputSpec;
  if (!spec) return null;
  const bleedPx = template.bleed ? template.bleed.left : 0;
  const safePx = template.safeArea ? template.safeArea.left : 0;
  const mmPerPx = spec.widthMm / template.canvas.width;
  return {
    targetWidthMm: spec.widthMm,
    targetHeightMm: spec.heightMm,
    dpi: spec.dpi,
    bleedMm: Number((bleedPx * mmPerPx).toFixed(2)),
    safeMarginMm: Number((safePx * mmPerPx).toFixed(2)),
    format: spec.format
  };
}

export function createProjectFromTemplate(
  template: ProductTemplate,
  name?: string,
  ownerId?: string | null
): Project {
  return createProject({
    name: name ?? `${template.name} 设计`,
    templateId: template.id,
    templateVersion: template.version,
    canvas: template.canvas,
    print: toPrintSpec(template),
    ownerId: ownerId ?? null
  });
}
