import { z } from "zod";

export const AI_CAPABILITIES = [
  "image.generate",
  "image.edit",
  "image.remove-background",
  "image.seamless-tile",
  "image.product-scene",
  "mesh.generate"
] as const;

export const AiCapabilitySchema = z.enum(AI_CAPABILITIES);
export type AiCapability = z.infer<typeof AiCapabilitySchema>;

export const AI_CAPABILITY_LABELS: Record<AiCapability, string> = {
  "image.generate": "文本生成图案",
  "image.edit": "局部修改图案",
  "image.remove-background": "智能抠图",
  "image.seamless-tile": "无缝平铺纹理",
  "image.product-scene": "产品场景贴图",
  "mesh.generate": "3D 模型生成"
};

export const IMPLEMENTED_CAPABILITIES: readonly AiCapability[] = [
  "image.generate",
  "image.edit",
  "image.remove-background",
  "image.seamless-tile",
  "image.product-scene"
];

export const PLANNED_CAPABILITIES: readonly AiCapability[] = ["mesh.generate"];

export function isImplementedCapability(capability: AiCapability): boolean {
  return IMPLEMENTED_CAPABILITIES.includes(capability);
}

export const AI_REQUEST_SCHEMA_VERSION = 1;
export const AI_RESULT_SCHEMA_VERSION = 1;

export const MAX_PROMPT_LENGTH = 1000;
export const MIN_IMAGE_EDGE = 64;
export const MAX_IMAGE_EDGE = 4096;
export const MAX_IMAGE_PIXELS = 16_000_000;

export const ImageSizeSchema = z
  .object({
    width: z.number().int().min(MIN_IMAGE_EDGE).max(MAX_IMAGE_EDGE),
    height: z.number().int().min(MIN_IMAGE_EDGE).max(MAX_IMAGE_EDGE)
  })
  .refine((size) => size.width * size.height <= MAX_IMAGE_PIXELS, {
    message: "图像像素数超出上限",
    path: ["width"]
  });

const PromptSchema = z.string().trim().min(1).max(MAX_PROMPT_LENGTH);
const AssetIdSchema = z.string().trim().min(1).max(200);

export const SCENE_PRESETS = ["studio-white", "wooden-desk", "fabric-flat-lay", "outdoor-daylight"] as const;
export const ScenePresetSchema = z.enum(SCENE_PRESETS);

export const AI_TILE_MODES = ["wrap", "mirror"] as const;
export const AiTileModeSchema = z.enum(AI_TILE_MODES);

export const AiRequestSchema = z.discriminatedUnion("capability", [
  z
    .object({
      capability: z.literal("image.generate"),
      prompt: PromptSchema,
      size: ImageSizeSchema,
      transparent: z.boolean().default(false),
      seed: z.number().int().min(0).max(2_147_483_647).optional()
    })
    .strict(),
  z
    .object({
      capability: z.literal("image.edit"),
      sourceAssetId: AssetIdSchema,
      prompt: PromptSchema,
      maskAssetId: AssetIdSchema.optional(),
      size: ImageSizeSchema
    })
    .strict(),
  z
    .object({
      capability: z.literal("image.remove-background"),
      sourceAssetId: AssetIdSchema,
      edgeFeatherPx: z.number().int().min(0).max(40).default(0)
    })
    .strict(),
  z
    .object({
      capability: z.literal("image.seamless-tile"),
      prompt: PromptSchema,
      size: ImageSizeSchema,
      tileMode: AiTileModeSchema.default("wrap"),
      seed: z.number().int().min(0).max(2_147_483_647).optional()
    })
    .strict(),
  z
    .object({
      capability: z.literal("image.product-scene"),
      sourceAssetId: AssetIdSchema,
      scenePreset: ScenePresetSchema,
      size: ImageSizeSchema,
      shadowStrength: z.number().min(0).max(1).default(0.35)
    })
    .strict(),
  z
    .object({
      capability: z.literal("mesh.generate"),
      sourceAssetId: AssetIdSchema,
      targetPolygons: z.number().int().min(1_000).max(500_000).default(50_000)
    })
    .strict()
]);

export type AiRequest = z.infer<typeof AiRequestSchema>;

export function describeAiRequest(request: AiRequest): string {
  switch (request.capability) {
    case "image.generate":
      return `文本生成图案：${request.prompt}`;
    case "image.edit":
      return `局部修改：${request.sourceAssetId}`;
    case "image.remove-background":
      return `智能抠图：${request.sourceAssetId}`;
    case "image.seamless-tile":
      return `无缝纹理：${request.prompt}`;
    case "image.product-scene":
      return `场景贴图：${request.scenePreset}`;
    case "mesh.generate":
      return `3D 模型生成：${request.sourceAssetId}`;
    default: {
      const exhaustive: never = request;
      return exhaustive;
    }
  }
}
