import { z } from "zod";
import { LayerSchema } from "./layers";

export const SCHEMA_VERSION = 1;

export const ProjectModeSchema = z.enum(["2d", "scene", "3d"]);

export const CanvasSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  backgroundColor: z.string().min(1),
  dpi: z.number().positive(),
  unit: z.enum(["px", "mm", "cm"])
});

export const PrintSpecSchema = z.object({
  targetWidthMm: z.number().positive(),
  targetHeightMm: z.number().positive(),
  dpi: z.number().positive(),
  bleedMm: z.number().min(0),
  safeMarginMm: z.number().min(0),
  format: z.enum(["png", "pdf", "svg"])
});

export const ProjectSchema = z.object({
  schemaVersion: z.number().int().positive(),
  id: z.string().min(1),
  name: z.string().min(1),
  ownerId: z.string().nullable(),
  mode: ProjectModeSchema,
  templateId: z.string().min(1),
  templateVersion: z.number().int().positive(),
  canvas: CanvasSchema,
  layers: z.array(LayerSchema),
  print: PrintSpecSchema.nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export type Canvas = z.infer<typeof CanvasSchema>;
export type PrintSpec = z.infer<typeof PrintSpecSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type ProjectMode = z.infer<typeof ProjectModeSchema>;

export interface ProjectSummary {
  id: string;
  name: string;
  templateId: string;
  templateVersion: number;
  updatedAt: string;
  layerCount: number;
}

export function toProjectSummary(project: Project): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    templateId: project.templateId,
    templateVersion: project.templateVersion,
    updatedAt: project.updatedAt,
    layerCount: project.layers.length
  };
}
