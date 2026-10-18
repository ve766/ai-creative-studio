import { z } from "zod";
import { CanvasSchema } from "@acs/project-schema";

export const TEMPLATE_SCHEMA_VERSION = 1;

export const TemplateCategorySchema = z.enum([
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
]);

export const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive()
});

export const InsetSchema = z.object({
  top: z.number().min(0),
  right: z.number().min(0),
  bottom: z.number().min(0),
  left: z.number().min(0)
});

export const OutputSpecSchema = z.object({
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  dpi: z.number().positive(),
  format: z.enum(["png", "pdf", "svg"]),
  verified: z.boolean()
});

export const OverlaySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["occlusion", "texture", "light"]),
  src: z.string().min(1),
  opacity: z.number().min(0).max(1),
  blendMode: z.enum(["normal", "multiply", "screen", "overlay", "soft-light"])
});

export const Model3DConfigSchema = z.object({
  src: z.string().min(1),
  version: z.number().int().positive(),
  materialName: z.string().nullable(),
  uvArea: RectSchema.nullable()
});

export const TemplateSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  version: z.number().int().positive(),
  category: TemplateCategorySchema,
  name: z.string().min(1),
  description: z.string(),
  previewImage: z.string().min(1),
  verified: z.boolean(),
  example: z.boolean(),
  canvas: CanvasSchema,
  editableArea: RectSchema,
  safeArea: InsetSchema.nullable(),
  bleed: InsetSchema.nullable(),
  overlays: z.array(OverlaySchema),
  model3d: Model3DConfigSchema.nullable(),
  outputSpec: OutputSpecSchema.nullable()
});

export type TemplateCategory = z.infer<typeof TemplateCategorySchema>;
export type Rect = z.infer<typeof RectSchema>;
export type Inset = z.infer<typeof InsetSchema>;
export type OutputSpec = z.infer<typeof OutputSpecSchema>;
export type Overlay = z.infer<typeof OverlaySchema>;
export type Model3DConfig = z.infer<typeof Model3DConfigSchema>;
export type ProductTemplate = z.infer<typeof TemplateSchema>;
