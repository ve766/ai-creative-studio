import type { AiJobRequest, AiJobSnapshot, AiServiceStatus } from "@acs/ai-schema";
import {
  createAiJobService,
  createAiProviderRegistry,
  createAiUsageLedger,
  createAiVerificationStore,
  describeAiServiceStatus,
  toSnapshot,
  createMockAiProvider,
  type AiJobService,
  type AiProvider,
  type AiProviderRegistry,
  type AiUsageLedger,
  type AiVerificationStore
} from "@acs/ai-core";
import { describeAiConfiguration, type AiConfiguration, type EnvLike } from "./config";

export interface AiRuntime {
  configuration: AiConfiguration;
  registry: AiProviderRegistry;
  ledger: AiUsageLedger;
  verification: AiVerificationStore;
  service: AiJobService;
  status(checkedAt?: string): AiServiceStatus;
  submit(request: AiJobRequest, ownerId: string): Promise<AiJobSnapshot>;
  getJob(taskId: string, ownerId: string): AiJobSnapshot | null;
}

function providersFor(): AiProvider[] {
  return [createMockAiProvider({ id: "mock" })];
}

export function createAiRuntime(env: EnvLike): AiRuntime {
  const configuration = describeAiConfiguration(env);
  const registry = createAiProviderRegistry({
    allowMock: configuration.allowMock,
    providers: providersFor()
  });
  const ledger = createAiUsageLedger({ limit: 200 });
  const verification = createAiVerificationStore();
  const service = createAiJobService({
    registry,
    ledger,
    verification,
    allowMock: configuration.allowMock
  });

  return {
    configuration,
    registry,
    ledger,
    verification,
    service,

    status(checkedAt) {
      return describeAiServiceStatus({
        requestedMode: configuration.requestedMode,
        registry,
        verification,
        allowMock: configuration.allowMock,
        missing: configuration.missing,
        problems: configuration.problems,
        checkedAt
      });
    },

    async submit(request, ownerId) {
      const record = await service.submit(request, { ownerId });
      return toSnapshot(record);
    },

    getJob(taskId, ownerId) {
      const record = service.get(taskId);
      if (!record || record.ownerId !== ownerId) return null;
      return toSnapshot(record);
    }
  };
}

interface AiRuntimeCache {
  key: string;
  runtime: AiRuntime;
}

const globalForAi = globalThis as typeof globalThis & { __acsAiRuntime?: AiRuntimeCache };

export function getAiRuntime(env: EnvLike = process.env): AiRuntime {
  const key = `${env.AI_MODE ?? ""}|${env.APP_ENV ?? ""}`;
  const cached = globalForAi.__acsAiRuntime;
  if (cached && cached.key === key) return cached.runtime;
  const runtime = createAiRuntime(env);
  globalForAi.__acsAiRuntime = { key, runtime };
  return runtime;
}
