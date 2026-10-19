import { z } from "zod";
import { AiCapabilitySchema } from "./capabilities";

export const AI_SERVICE_STATES = [
  "not-configured",
  "simulated",
  "unverified",
  "verified",
  "unavailable"
] as const;

export const AiServiceStateSchema = z.enum(AI_SERVICE_STATES);
export type AiServiceState = z.infer<typeof AiServiceStateSchema>;

export const AI_SERVICE_STATE_LABELS: Record<AiServiceState, string> = {
  "not-configured": "未配置",
  simulated: "开发模拟（结果非真实 AI）",
  unverified: "已配置但未验证",
  verified: "真实服务已验证",
  unavailable: "暂时不可用"
};

export const AI_REQUESTED_MODES = ["off", "mock", "live"] as const;
export const AiRequestedModeSchema = z.enum(AI_REQUESTED_MODES);
export type AiRequestedMode = z.infer<typeof AiRequestedModeSchema>;

export const AiVerificationSummarySchema = z.object({
  verifiedAt: z.string().min(1).nullable(),
  evidence: z.string().min(1).max(300).nullable(),
  lastFailureAt: z.string().min(1).nullable(),
  lastFailureCode: z.string().min(1).max(60).nullable()
});

export type AiVerificationSummary = z.infer<typeof AiVerificationSummarySchema>;

export const AiServiceStatusSchema = z
  .object({
    state: AiServiceStateSchema,
    requestedMode: AiRequestedModeSchema,
    providerId: z.string().min(1).nullable(),
    implementedCapabilities: z.array(AiCapabilitySchema),
    plannedCapabilities: z.array(AiCapabilitySchema),
    simulatedCapabilities: z.array(AiCapabilitySchema),
    verification: AiVerificationSummarySchema,
    missing: z.array(z.string().min(1)),
    problems: z.array(z.string()),
    checkedAt: z.string().min(1)
  })
  .refine((status) => status.state !== "verified" || status.verification.verifiedAt !== null, {
    message: "verified 状态必须带真实调用验证记录",
    path: ["verification", "verifiedAt"]
  })
  .refine((status) => status.state !== "verified" || status.requestedMode === "live", {
    message: "模拟模式不能报告为 verified",
    path: ["requestedMode"]
  })
  .refine((status) => status.state !== "simulated" || status.simulatedCapabilities.length > 0, {
    message: "simulated 状态必须声明被模拟的能力",
    path: ["simulatedCapabilities"]
  });

export type AiServiceStatus = z.infer<typeof AiServiceStatusSchema>;

export const AI_STATUS_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
