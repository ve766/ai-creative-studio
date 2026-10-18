import type { ProductTemplate } from "@acs/template-schema";
import { TEMPLATE_SCHEMA_VERSION } from "@acs/template-schema";

export type TemplateDraft = Omit<
  ProductTemplate,
  "schemaVersion" | "overlays" | "model3d" | "verified" | "example" | "safeArea" | "bleed" | "outputSpec"
> &
  Partial<
    Pick<
      ProductTemplate,
      "overlays" | "model3d" | "verified" | "example" | "safeArea" | "bleed" | "outputSpec"
    >
  >;

export function defineTemplate(draft: TemplateDraft): ProductTemplate {
  return {
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    overlays: [],
    model3d: null,
    verified: false,
    example: true,
    safeArea: null,
    bleed: null,
    outputSpec: null,
    ...draft
  };
}
