import { createId } from "@acs/project-schema";
import {
  AI_JOB_SCHEMA_VERSIONS,
  AiJobRecordSchema,
  AiRequestSchema,
  isImplementedCapability,
  isTerminalStatus,
  toJobSnapshot,
  type AiCapability,
  type AiJobRecord,
  type AiJobRequest,
  type AiJobSnapshot,
  type AiRequest,
  type AiTaskStatus,
  type AiUsage
} from "@acs/ai-schema";
import {
  ProviderError,
  RateLimiter,
  callProvider,
  toProviderError,
  type RetryPolicy,
  type Sleeper
} from "@acs/cloud-core";
import type { ApiErrorCode } from "@acs/cloud-schema";
import { combineSignals } from "./signals";
import type { AiProvider, AiProviderRegistry } from "./ports";
import type { AiUsageLedger } from "./ledger";
import type { AiVerificationStore } from "./verification";

export const DEFAULT_AI_TIMEOUT_MS = 60_000;
export const DEFAULT_AI_RETRY: RetryPolicy = { maxAttempts: 2, baseDelayMs: 200, maxDelayMs: 1_000 };
export const DEFAULT_MAX_CONCURRENT_PER_OWNER = 2;

export interface AiJobSubmitContext {
  ownerId: string;
  projectId?: string | null;
}

export interface AiJobServiceOptions {
  registry: AiProviderRegistry;
  ledger: AiUsageLedger;
  verification: AiVerificationStore;
  allowMock: boolean;
  now?: () => string;
  sleep?: Sleeper;
  timeoutMs?: number;
  retry?: Partial<RetryPolicy>;
  rateLimiter?: RateLimiter;
  maxConcurrentPerOwner?: number;
  historyLimit?: number;
}

export interface AiJobService {
  submit(request: AiJobRequest, context: AiJobSubmitContext): Promise<AiJobRecord>;
  get(taskId: string): AiJobRecord | null;
  cancel(taskId: string, ownerId: string): boolean;
  list(): readonly AiJobRecord[];
  provides(capability: AiCapability): boolean;
}

interface RunningJob {
  controller: AbortController;
  record: AiJobRecord;
}

function parseRequest(request: AiJobRequest): AiRequest {
  if (
    request.requestSchemaVersion !== undefined &&
    request.requestSchemaVersion !== AI_JOB_SCHEMA_VERSIONS.request
  ) {
    throw new ProviderError(
      "VALIDATION_FAILED",
      `请求 schema 版本不受支持（收到 ${request.requestSchemaVersion}，当前 ${AI_JOB_SCHEMA_VERSIONS.request}）`
    );
  }
  const parsed = AiRequestSchema.safeParse({ ...request.input, capability: request.capability });
  if (!parsed.success) {
    throw new ProviderError("VALIDATION_FAILED", "AI 请求参数校验失败", {
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    });
  }
  return parsed.data;
}

function statusForError(code: ApiErrorCode): AiTaskStatus {
  if (code === "CANCELED") return "canceled";
  if (code === "TIMEOUT") return "timed-out";
  return "failed";
}

function refundReasonFor(status: AiTaskStatus): string {
  if (status === "canceled") return "任务在完成前被取消，未产生费用";
  if (status === "timed-out") return "任务超时未完成，未产生费用";
  return "任务失败，未产生费用";
}

export function createAiJobService(options: AiJobServiceOptions): AiJobService {
  const now = options.now ?? (() => new Date().toISOString());
  const timeoutMs = options.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS;
  const retry: RetryPolicy = { ...DEFAULT_AI_RETRY, ...options.retry };
  const maxConcurrent = options.maxConcurrentPerOwner ?? DEFAULT_MAX_CONCURRENT_PER_OWNER;
  const historyLimit = options.historyLimit ?? 500;
  const rateLimiter = options.rateLimiter ?? new RateLimiter({ capacity: 10, refillPerSecond: 10 / 60 });
  const jobs = new Map<string, AiJobRecord>();
  const byIdempotencyKey = new Map<string, string>();
  const running = new Map<string, RunningJob>();
  const inFlightPerOwner = new Map<string, number>();

  const clone = (record: AiJobRecord): AiJobRecord =>
    AiJobRecordSchema.parse(JSON.parse(JSON.stringify(record)));

  const track = (record: AiJobRecord) => {
    jobs.set(record.taskId, record);
    if (jobs.size > historyLimit) {
      const oldest = [...jobs.values()].find((candidate) => isTerminalStatus(candidate.status));
      if (oldest) jobs.delete(oldest.taskId);
    }
  };

  const bumpInFlight = (ownerId: string, delta: number) => {
    const next = (inFlightPerOwner.get(ownerId) ?? 0) + delta;
    if (next <= 0) inFlightPerOwner.delete(ownerId);
    else inFlightPerOwner.set(ownerId, next);
  };

  const recordUsage = (record: AiJobRecord, usage: AiUsage, errorCode: ApiErrorCode | null) => {
    if (!isTerminalStatus(record.status)) return;
    const status = record.status;
    options.ledger.recordOnce({
      taskId: record.taskId,
      ownerId: record.ownerId,
      projectId: record.projectId,
      providerId: record.providerId,
      capability: record.capability,
      mode: record.mode,
      status,
      attempts: record.attempts,
      usage,
      errorCode,
      at: record.finishedAt ?? now()
    });
    if (status !== "succeeded") options.ledger.refund(record.taskId, refundReasonFor(status));
  };

  const recordVerification = (
    record: AiJobRecord,
    provider: AiProvider,
    latencyMs: number,
    detail: string
  ) => {
    if (provider.mode === "live") {
      options.verification.recordLiveSuccess({
        providerId: provider.id,
        capability: record.capability,
        at: record.finishedAt ?? now(),
        latencyMs: Math.max(0, latencyMs),
        model: record.model,
        detail
      });
      return;
    }
    options.verification.recordSimulatedSuccess({
      providerId: provider.id,
      capability: record.capability,
      at: record.finishedAt ?? now()
    });
  };

  const execute = async (record: AiJobRecord, request: AiRequest, provider: AiProvider) => {
    const controller = new AbortController();
    running.set(record.taskId, { controller, record });
    const startedAtMs = Date.now();
    record.status = "running";
    record.startedAt = now();

    try {
      const outcome = await callProvider(
        (timeoutSignal, attempt) => {
          record.attempts = attempt;
          return provider.run(request, {
            taskId: record.taskId,
            ownerId: record.ownerId,
            projectId: record.projectId,
            attempt,
            signal: combineSignals([controller.signal, timeoutSignal])
          });
        },
        { timeoutMs, retry, sleep: options.sleep }
      );
      record.status = "succeeded";
      record.result = outcome.asset;
      record.model = outcome.model;
      record.usage = outcome.usage;
      record.error = null;
      record.finishedAt = now();
      recordVerification(record, provider, Date.now() - startedAtMs, summarizeSuccess(record));
      recordUsage(record, outcome.usage, null);
    } catch (error) {
      const providerError = toProviderError(error, "INTERNAL");
      record.status =
        record.cancellationRequested && providerError.code !== "CONTENT_REJECTED"
          ? "canceled"
          : statusForError(providerError.code);
      record.error = {
        code: record.status === "canceled" ? "CANCELED" : providerError.code,
        message: providerError.message,
        retryable: providerError.retryable
      };
      record.finishedAt = now();
      if (provider.mode === "live" && record.status !== "canceled") {
        options.verification.recordFailure({
          providerId: provider.id,
          code: providerError.code,
          at: record.finishedAt,
          message: providerError.message
        });
      }
      recordUsage(
        record,
        {
          unit: "image",
          amount: 0,
          simulated: provider.mode === "mock",
          estimatedCost: null,
          actualCost: null,
          refunded: true,
          refundReason: refundReasonFor(record.status)
        },
        record.error.code
      );
    } finally {
      running.delete(record.taskId);
      bumpInFlight(record.ownerId, -1);
      track(record);
    }
  };

  return {
    async submit(request, context) {
      const ownerId = context.ownerId;
      if (request.idempotencyKey) {
        const existingId = byIdempotencyKey.get(`${ownerId}:${request.idempotencyKey}`);
        if (existingId) {
          const existing = jobs.get(existingId);
          if (existing) return clone(existing);
        }
      }

      if (!rateLimiter.tryAcquire(ownerId)) {
        throw new ProviderError("RATE_LIMITED", "AI 请求过于频繁，请稍后再试", {
          retryAfterSeconds: 60
        });
      }
      if ((inFlightPerOwner.get(ownerId) ?? 0) >= maxConcurrent) {
        throw new ProviderError("RATE_LIMITED", "同一账号同时进行的 AI 任务过多，请等待完成");
      }

      if (!isImplementedCapability(request.capability)) {
        throw new ProviderError("NOT_SUPPORTED", `能力 ${request.capability} 尚未接入`);
      }
      const parsedRequest = parseRequest(request);
      const provider = options.registry.resolve(request.capability);
      if (provider.mode === "mock" && !options.allowMock) {
        throw new ProviderError("FORBIDDEN", "当前环境禁止使用模拟 AI Provider");
      }

      const timestamp = now();
      const record: AiJobRecord = {
        taskId: createId("job"),
        ownerId,
        projectId: context.projectId ?? null,
        capability: request.capability,
        providerId: provider.id,
        mode: provider.mode,
        simulated: provider.mode === "mock",
        status: "queued",
        attempts: 0,
        idempotencyKey: request.idempotencyKey ?? null,
        requestSchemaVersion: AI_JOB_SCHEMA_VERSIONS.request,
        resultSchemaVersion: AI_JOB_SCHEMA_VERSIONS.result,
        createdAt: timestamp,
        startedAt: null,
        finishedAt: null,
        result: null,
        model: null,
        usage: null,
        error: null,
        cancellationRequested: false
      };
      track(record);
      bumpInFlight(ownerId, 1);
      if (request.idempotencyKey) {
        byIdempotencyKey.set(`${ownerId}:${request.idempotencyKey}`, record.taskId);
      }

      await execute(record, parsedRequest, provider);
      const finished = jobs.get(record.taskId);
      return clone(finished ?? record);
    },

    get(taskId) {
      const record = jobs.get(taskId);
      return record ? clone(record) : null;
    },

    cancel(taskId, ownerId) {
      const record = jobs.get(taskId);
      if (!record || record.ownerId !== ownerId) return false;
      if (isTerminalStatus(record.status)) return false;
      record.cancellationRequested = true;
      const active = running.get(taskId);
      active?.controller.abort();
      return true;
    },

    list() {
      return [...jobs.values()].map(clone);
    },

    provides(capability) {
      return options.registry.find(capability) !== null;
    }
  };
}

function summarizeSuccess(record: AiJobRecord): string {
  const dimensions =
    record.result && record.result.width && record.result.height
      ? `${record.result.width}x${record.result.height}`
      : "无尺寸";
  return `${record.capability} 在 ${record.attempts} 次尝试内成功，输出 ${dimensions}（模拟：${record.simulated ? "是" : "否"}）`;
}

export function toSnapshot(record: AiJobRecord): AiJobSnapshot {
  return toJobSnapshot(record);
}
