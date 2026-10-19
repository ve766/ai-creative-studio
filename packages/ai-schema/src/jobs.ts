import { z } from "zod";
import { ApiErrorCodeSchema } from "@acs/cloud-schema";
import { AiCapabilitySchema, AI_REQUEST_SCHEMA_VERSION, AI_RESULT_SCHEMA_VERSION } from "./capabilities";

export const AI_TASK_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
  "timed-out"
] as const;

export const AI_TERMINAL_STATUSES = ["succeeded", "failed", "canceled", "timed-out"] as const;

export const AiTaskStatusSchema = z.enum(AI_TASK_STATUSES);
export const AiTerminalStatusSchema = z.enum(AI_TERMINAL_STATUSES);

export type AiTaskStatus = z.infer<typeof AiTaskStatusSchema>;
export type AiTerminalStatus = z.infer<typeof AiTerminalStatusSchema>;

export function isTerminalStatus(status: AiTaskStatus): status is AiTerminalStatus {
  return (AI_TERMINAL_STATUSES as readonly string[]).includes(status);
}

export const AI_PROVIDER_MODES = ["live", "mock"] as const;
export const AiProviderModeSchema = z.enum(AI_PROVIDER_MODES);
export type AiProviderMode = z.infer<typeof AiProviderModeSchema>;

export const AI_RESULT_KINDS = ["inline-data-url", "storage-key", "remote-url"] as const;
export const AiResultKindSchema = z.enum(AI_RESULT_KINDS);

export const AiResultAssetSchema = z
  .object({
    kind: AiResultKindSchema,
    reference: z.string().min(1).max(4_000_000),
    mimeType: z.string().min(1).max(120),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    byteSize: z.number().int().positive().nullable(),
    checksum: z.string().min(1).max(128).nullable(),
    simulated: z.boolean()
  })
  .refine((asset) => asset.kind !== "inline-data-url" || asset.reference.startsWith("data:"), {
    message: "inline-data-url 必须是 data: 开头的内联数据",
    path: ["reference"]
  })
  .refine((asset) => asset.kind !== "storage-key" || !/^https?:\/\//u.test(asset.reference), {
    message: "storage-key 不能是外部 URL",
    path: ["reference"]
  })
  .refine((asset) => asset.kind !== "remote-url" || /^https:\/\//u.test(asset.reference), {
    message: "remote-url 必须是 https 地址",
    path: ["reference"]
  });

export type AiResultAsset = z.infer<typeof AiResultAssetSchema>;

export const AiEstimatedCostSchema = z.object({
  kind: z.literal("estimated"),
  currency: z.literal("USD"),
  minorUnits: z.number().int().min(0),
  basis: z.string().min(1).max(200)
});

export const AiActualCostSchema = z.object({
  kind: z.literal("actual"),
  currency: z.literal("USD"),
  minorUnits: z.number().int().min(0),
  source: z.string().min(1).max(200)
});

export type AiEstimatedCost = z.infer<typeof AiEstimatedCostSchema>;
export type AiActualCost = z.infer<typeof AiActualCostSchema>;

export const AI_USAGE_UNITS = ["image", "megapixel", "call", "second"] as const;

export const AiUsageSchema = z.object({
  unit: z.enum(AI_USAGE_UNITS),
  amount: z.number().min(0),
  simulated: z.boolean(),
  estimatedCost: AiEstimatedCostSchema.nullable(),
  actualCost: AiActualCostSchema.nullable(),
  refunded: z.boolean(),
  refundReason: z.string().min(1).max(200).nullable()
});

export type AiUsage = z.infer<typeof AiUsageSchema>;

export const AiJobErrorSchema = z.object({
  code: ApiErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean()
});

export type AiJobError = z.infer<typeof AiJobErrorSchema>;

const IsoTimestampSchema = z.string().min(1);

export const AiJobRecordSchema = z.object({
  taskId: z.string().min(1),
  ownerId: z.string().min(1),
  projectId: z.string().min(1).nullable(),
  capability: AiCapabilitySchema,
  providerId: z.string().min(1),
  mode: AiProviderModeSchema,
  simulated: z.boolean(),
  status: AiTaskStatusSchema,
  attempts: z.number().int().min(0),
  idempotencyKey: z.string().min(1).max(200).nullable(),
  requestSchemaVersion: z.number().int().positive(),
  resultSchemaVersion: z.number().int().positive(),
  createdAt: IsoTimestampSchema,
  startedAt: IsoTimestampSchema.nullable(),
  finishedAt: IsoTimestampSchema.nullable(),
  result: AiResultAssetSchema.nullable(),
  model: z.string().min(1).max(200).nullable(),
  usage: AiUsageSchema.nullable(),
  error: AiJobErrorSchema.nullable(),
  cancellationRequested: z.boolean()
});

export type AiJobRecord = z.infer<typeof AiJobRecordSchema>;

export const AiJobSnapshotSchema = AiJobRecordSchema.pick({
  taskId: true,
  projectId: true,
  capability: true,
  providerId: true,
  mode: true,
  simulated: true,
  status: true,
  attempts: true,
  requestSchemaVersion: true,
  resultSchemaVersion: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
  result: true,
  model: true,
  usage: true,
  error: true,
  cancellationRequested: true
});

export type AiJobSnapshot = z.infer<typeof AiJobSnapshotSchema>;

export function toJobSnapshot(record: AiJobRecord): AiJobSnapshot {
  return AiJobSnapshotSchema.parse(record);
}

export const AiJobRequestSchema = z
  .object({
    capability: AiCapabilitySchema,
    input: z.record(z.string(), z.unknown()),
    idempotencyKey: z.string().trim().min(1).max(200).optional(),
    projectId: z.string().trim().min(1).max(200).nullable().optional(),
    requestSchemaVersion: z.number().int().positive().optional()
  })
  .strict();

export type AiJobRequest = z.infer<typeof AiJobRequestSchema>;

export const AI_JOB_SCHEMA_VERSIONS = {
  request: AI_REQUEST_SCHEMA_VERSION,
  result: AI_RESULT_SCHEMA_VERSION
} as const;
