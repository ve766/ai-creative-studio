import {
  IMPLEMENTED_CAPABILITIES,
  PLANNED_CAPABILITIES,
  AiServiceStatusSchema,
  type AiCapability,
  type AiRequestedMode,
  type AiServiceStatus
} from "@acs/ai-schema";
import type { AiProviderRegistry } from "./ports";
import { wasVerificationSupersededByFailure, type AiVerificationStore } from "./verification";

export interface AiStatusInput {
  requestedMode: AiRequestedMode;
  registry: AiProviderRegistry;
  verification: AiVerificationStore;
  allowMock: boolean;
  missing: readonly string[];
  problems?: readonly string[];
  checkedAt?: string;
  now?: string;
}

function liveProviderIds(registry: AiProviderRegistry): string[] {
  return registry
    .descriptors()
    .filter((descriptor) => descriptor.mode === "live")
    .map((descriptor) => descriptor.id);
}

function configuredLiveProviderIds(registry: AiProviderRegistry): string[] {
  return registry
    .descriptors()
    .filter((descriptor) => descriptor.mode === "live" && descriptor.configuration.mode === "configured")
    .map((descriptor) => descriptor.id);
}

function simulatedCapabilities(registry: AiProviderRegistry, allowMock: boolean): AiCapability[] {
  if (!allowMock) return [];
  const capabilities = new Set<AiCapability>();
  for (const descriptor of registry.descriptors()) {
    if (descriptor.mode !== "mock") continue;
    for (const capability of descriptor.capabilities) {
      if (IMPLEMENTED_CAPABILITIES.includes(capability)) capabilities.add(capability);
    }
  }
  return [...capabilities];
}

export function describeAiServiceStatus(input: AiStatusInput): AiServiceStatus {
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const problems = [...(input.problems ?? [])];
  const simulated = simulatedCapabilities(input.registry, input.allowMock);

  const base = {
    requestedMode: input.requestedMode,
    implementedCapabilities: [...IMPLEMENTED_CAPABILITIES],
    plannedCapabilities: [...PLANNED_CAPABILITIES],
    simulatedCapabilities: simulated,
    checkedAt
  };

  if (input.requestedMode === "off") {
    return AiServiceStatusSchema.parse({
      ...base,
      state: "not-configured",
      providerId: null,
      simulatedCapabilities: [],
      missing: [...input.missing],
      problems: [...problems, "AI 功能未启用（未设置 AI_MODE）"],
      verification: { verifiedAt: null, evidence: null, lastFailureAt: null, lastFailureCode: null }
    });
  }

  if (input.requestedMode === "mock") {
    if (!input.allowMock) {
      return AiServiceStatusSchema.parse({
        ...base,
        state: "not-configured",
        providerId: null,
        simulatedCapabilities: [],
        missing: [...input.missing],
        problems: [...problems, "当前环境禁止模拟 Provider，AI 功能不可用"],
        verification: { verifiedAt: null, evidence: null, lastFailureAt: null, lastFailureCode: null }
      });
    }
    return AiServiceStatusSchema.parse({
      ...base,
      state: "simulated",
      providerId: simulated.length > 0 ? "mock" : null,
      missing: [],
      problems: [...problems, "开发模拟模式：输出带有明显模拟标记，不是真实 AI 结果"],
      verification: { verifiedAt: null, evidence: null, lastFailureAt: null, lastFailureCode: null }
    });
  }

  const configured = configuredLiveProviderIds(input.registry);
  if (configured.length === 0) {
    const declared = liveProviderIds(input.registry);
    return AiServiceStatusSchema.parse({
      ...base,
      state: "not-configured",
      providerId: null,
      simulatedCapabilities: [],
      missing: [...input.missing],
      problems: [
        ...problems,
        declared.length > 0
          ? `已声明真实 Provider（${declared.join("、")}）但凭据不完整，缺少：${input.missing.join("、")}`
          : "未注册任何真实 AI Provider"
      ],
      verification: { verifiedAt: null, evidence: null, lastFailureAt: null, lastFailureCode: null }
    });
  }

  const providerId = configured[0] ?? null;
  if (providerId === null) {
    return AiServiceStatusSchema.parse({
      ...base,
      state: "not-configured",
      providerId: null,
      simulatedCapabilities: [],
      missing: [...input.missing],
      problems: [...problems, "未注册任何真实 AI Provider"],
      verification: { verifiedAt: null, evidence: null, lastFailureAt: null, lastFailureCode: null }
    });
  }

  const verification = input.verification.toSummary(providerId, { now: input.now ?? checkedAt });
  if (wasVerificationSupersededByFailure(verification)) {
    return AiServiceStatusSchema.parse({
      ...base,
      state: "unavailable",
      providerId,
      simulatedCapabilities: [],
      missing: [],
      problems: [
        ...problems,
        `最近一次真实调用失败（${verification.lastFailureCode ?? "UNKNOWN"}），服务暂时不可用`
      ],
      verification
    });
  }

  if (verification.verifiedAt === null) {
    return AiServiceStatusSchema.parse({
      ...base,
      state: "unverified",
      providerId,
      simulatedCapabilities: [],
      missing: [],
      problems: [...problems, `已配置 ${providerId}，但尚无成功的真实调用记录，不能视为已验证`],
      verification
    });
  }

  return AiServiceStatusSchema.parse({
    ...base,
    state: "verified",
    providerId,
    simulatedCapabilities: [],
    missing: [],
    problems: [...problems],
    verification
  });
}
