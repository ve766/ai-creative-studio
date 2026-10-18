import { z } from "zod";
import { ProjectSchema } from "@acs/project-schema";

export const CloudProjectModeSchema = z.enum(["2d", "scene", "3d"]);

export const CloudProjectSummarySchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  name: z.string().min(1).max(120),
  mode: CloudProjectModeSchema,
  templateId: z.string().min(1),
  templateVersion: z.number().int().positive(),
  schemaVersion: z.number().int().positive(),
  layerCount: z.number().int().min(0),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const CloudProjectRecordSchema = CloudProjectSummarySchema.extend({
  design: ProjectSchema,
  deletedAt: z.string().nullable()
}).refine((record) => record.design.id === record.id, {
  message: "design.id 必须与记录 id 一致",
  path: ["design", "id"]
}).refine((record) => record.design.ownerId === record.ownerId, {
  message: "design.ownerId 必须与记录 ownerId 一致",
  path: ["design", "ownerId"]
}).refine((record) => record.layerCount === record.design.layers.length, {
  message: "layerCount 必须等于 design.layers 数量",
  path: ["layerCount"]
});

export const CloudAssetKindSchema = z.enum(["image", "model", "export", "thumbnail"]);

export const CloudAssetRecordSchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  projectId: z.string().min(1).nullable(),
  kind: CloudAssetKindSchema,
  storageKey: z.string().min(1),
  mimeType: z.string().min(1),
  byteSize: z.number().int().positive(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  createdAt: z.string().min(1)
});

export const UploadUrlRequestSchema = z.object({
  kind: CloudAssetKindSchema,
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  byteSize: z.number().int().positive()
});

export const UploadUrlResponseSchema = z.object({
  assetId: z.string().min(1),
  uploadUrl: z.string().url(),
  method: z.literal("PUT"),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.string().min(1)
});

export const CompleteUploadRequestSchema = z.object({
  assetId: z.string().min(1),
  checksum: z.string().min(1).max(128).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional()
});

export type CloudProjectMode = z.infer<typeof CloudProjectModeSchema>;
export type CloudProjectSummary = z.infer<typeof CloudProjectSummarySchema>;
export type CloudProjectRecord = z.infer<typeof CloudProjectRecordSchema>;
export type CloudAssetKind = z.infer<typeof CloudAssetKindSchema>;
export type CloudAssetRecord = z.infer<typeof CloudAssetRecordSchema>;
export type UploadUrlRequest = z.infer<typeof UploadUrlRequestSchema>;
export type UploadUrlResponse = z.infer<typeof UploadUrlResponseSchema>;
export type CompleteUploadRequest = z.infer<typeof CompleteUploadRequestSchema>;

export const CreateCloudProjectSchema = z.object({
  name: z.string().min(1).max(120),
  templateId: z.string().min(1),
  templateVersion: z.number().int().positive()
});

export type CreateCloudProjectInput = z.infer<typeof CreateCloudProjectSchema>;

export const CLOUD_STORAGE_MODES = ["local", "cloud", "mock"] as const;
export const PROVIDER_STATES = ["configured", "not-configured", "mock"] as const;

export const CloudStatusSchema = z.object({
  requestedMode: z.enum(CLOUD_STORAGE_MODES),
  storage: z.enum(CLOUD_STORAGE_MODES),
  database: z.enum(PROVIDER_STATES),
  objectStorage: z.enum(PROVIDER_STATES),
  ai: z.enum(PROVIDER_STATES),
  problems: z.array(z.string()),
  checkedAt: z.string().min(1)
});

export type CloudStatus = z.infer<typeof CloudStatusSchema>;
