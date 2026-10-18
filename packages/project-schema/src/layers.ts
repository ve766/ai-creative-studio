import { z } from "zod";

const baseLayerFields = {
  id: z.string().min(1),
  name: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number(),
  opacity: z.number().min(0).max(1),
  visible: z.boolean(),
  locked: z.boolean()
};

export const CropSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive()
});

export const ImageLayerSchema = z.object({
  ...baseLayerFields,
  type: z.literal("image"),
  assetId: z.string().nullable(),
  src: z.string().min(1),
  naturalWidth: z.number().positive(),
  naturalHeight: z.number().positive(),
  crop: CropSchema.nullable()
});

export const TextLayerSchema = z.object({
  ...baseLayerFields,
  type: z.literal("text"),
  text: z.string(),
  fontFamily: z.string().min(1),
  fontSize: z.number().positive(),
  fontWeight: z.enum(["normal", "bold"]),
  fontStyle: z.enum(["normal", "italic"]),
  fill: z.string().min(1),
  align: z.enum(["left", "center", "right"])
});

export const LayerSchema = z.discriminatedUnion("type", [
  ImageLayerSchema,
  TextLayerSchema
]);

export type Crop = z.infer<typeof CropSchema>;
export type ImageLayer = z.infer<typeof ImageLayerSchema>;
export type TextLayer = z.infer<typeof TextLayerSchema>;
export type Layer = z.infer<typeof LayerSchema>;
export type LayerPatch = Partial<Omit<ImageLayer, "type" | "id">> &
  Partial<Omit<TextLayer, "type" | "id">>;
