import type { AiCapability, AiProviderMode, AiRequest, AiResultAsset, AiUsage } from "@acs/ai-schema";
import type { ProviderConfig } from "@acs/cloud-core";

export interface AiProgress {
  stage: string;
  percent: number;
}

export interface AiRunContext {
  taskId: string;
  ownerId: string;
  projectId: string | null;
  attempt: number;
  signal: AbortSignal;
  onProgress?: (progress: AiProgress) => void;
}

export interface AiProviderOutcome {
  asset: AiResultAsset;
  model: string | null;
  usage: AiUsage;
}

export interface AiProvider {
  readonly id: string;
  readonly mode: AiProviderMode;
  readonly capabilities: readonly AiCapability[];
  describeConfiguration(): ProviderConfig;
  run(request: AiRequest, context: AiRunContext): Promise<AiProviderOutcome>;
}

export interface AiProviderDescriptor {
  id: string;
  mode: AiProviderMode;
  capabilities: readonly AiCapability[];
  configuration: ProviderConfig;
}

export interface AiProviderRegistry {
  list(): AiProviderDescriptor[];
  descriptors(): AiProviderDescriptor[];
  find(capability: AiCapability): AiProvider | null;
  resolve(capability: AiCapability): AiProvider;
  implFor(capability: AiCapability): AiProviderMode | null;
}

export function describeProvider(provider: AiProvider): AiProviderDescriptor {
  return {
    id: provider.id,
    mode: provider.mode,
    capabilities: [...provider.capabilities],
    configuration: provider.describeConfiguration()
  };
}
