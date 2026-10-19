import { AI_STATUS_VERIFICATION_TTL_MS, type AiCapability, type AiVerificationSummary } from "@acs/ai-schema";
import type { ApiErrorCode } from "@acs/cloud-schema";

export interface AiVerificationEvidence {
  providerId: string;
  capability: AiCapability;
  at: string;
  latencyMs: number;
  model: string | null;
  detail: string;
}

export interface AiVerificationFailure {
  providerId: string;
  code: ApiErrorCode;
  at: string;
  message: string;
}

interface ProviderVerification {
  verifiedAt: string | null;
  evidence: string | null;
  lastFailureAt: string | null;
  lastFailureCode: ApiErrorCode | null;
}

export interface AiVerificationStore {
  recordLiveSuccess(evidence: AiVerificationEvidence): void;
  recordSimulatedSuccess(input: { providerId: string; capability: AiCapability; at: string }): void;
  recordFailure(failure: AiVerificationFailure): void;
  get(providerId: string): ProviderVerification;
  simulatedEvidence(): readonly { providerId: string; capability: AiCapability; at: string }[];
  toSummary(providerId: string, options?: { now?: string; maxAgeMs?: number }): AiVerificationSummary;
}

const EMPTY: ProviderVerification = {
  verifiedAt: null,
  evidence: null,
  lastFailureAt: null,
  lastFailureCode: null
};

export function createAiVerificationStore(): AiVerificationStore {
  const live = new Map<string, ProviderVerification>();
  const simulated: { providerId: string; capability: AiCapability; at: string }[] = [];

  const current = (providerId: string): ProviderVerification => live.get(providerId) ?? EMPTY;

  return {
    recordLiveSuccess(evidence) {
      live.set(evidence.providerId, {
        verifiedAt: evidence.at,
        evidence: `${evidence.capability} 真实调用成功（${evidence.latencyMs}ms${evidence.model ? `，模型 ${evidence.model}` : ""}）：${evidence.detail}`,
        lastFailureAt: current(evidence.providerId).lastFailureAt,
        lastFailureCode: current(evidence.providerId).lastFailureCode
      });
    },

    recordSimulatedSuccess(input) {
      simulated.push(input);
    },

    recordFailure(failure) {
      const previous = current(failure.providerId);
      live.set(failure.providerId, {
        verifiedAt: previous.verifiedAt,
        evidence: previous.evidence,
        lastFailureAt: failure.at,
        lastFailureCode: failure.code
      });
    },

    get(providerId) {
      return { ...current(providerId) };
    },

    simulatedEvidence() {
      return [...simulated];
    },

    toSummary(providerId, options = {}) {
      const record = current(providerId);
      const maxAgeMs = options.maxAgeMs ?? AI_STATUS_VERIFICATION_TTL_MS;
      const now = options.now ?? new Date().toISOString();
      const expired =
        record.verifiedAt !== null &&
        Date.parse(now) - Date.parse(record.verifiedAt) > maxAgeMs;
      return {
        verifiedAt: expired ? null : record.verifiedAt,
        evidence: expired ? null : record.evidence,
        lastFailureAt: record.lastFailureAt,
        lastFailureCode: record.lastFailureCode
      };
    }
  };
}

export function wasVerificationSupersededByFailure(summary: AiVerificationSummary): boolean {
  if (summary.verifiedAt === null || summary.lastFailureAt === null) return false;
  return Date.parse(summary.lastFailureAt) > Date.parse(summary.verifiedAt);
}
