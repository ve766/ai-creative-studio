import { type AiCapability } from "@acs/ai-schema";
import { ProviderError } from "@acs/cloud-core";
import { describeProvider, type AiProvider, type AiProviderRegistry } from "./ports";

export interface AiProviderRegistryOptions {
  allowMock: boolean;
  providers: readonly AiProvider[];
}

export function createAiProviderRegistry(options: AiProviderRegistryOptions): AiProviderRegistry {
  const ids = new Set<string>();
  for (const provider of options.providers) {
    if (ids.has(provider.id)) throw new Error(`AI Provider id 重复：${provider.id}`);
    ids.add(provider.id);
  }

  const usable = options.providers.filter((provider) => options.allowMock || provider.mode !== "mock");
  const blockedMocks = options.providers.filter((provider) => provider.mode === "mock" && !options.allowMock);

  const find = (capability: AiCapability): AiProvider | null => {
    const candidates = usable.filter((provider) => provider.capabilities.includes(capability));
    if (candidates.length === 0) return null;
    const live = candidates.filter((provider) => provider.mode === "live");
    const pool = live.length > 0 ? live : candidates;
    return pool[0] ?? null;
  };

  return {
    list() {
      return usable.map(describeProvider);
    },

    descriptors() {
      return options.providers.map(describeProvider);
    },

    find,

    resolve(capability) {
      const provider = find(capability);
      if (provider) return provider;
      if (blockedMocks.some((mock) => mock.capabilities.includes(capability))) {
        throw new ProviderError("NOT_CONFIGURED", `能力 ${capability} 只有模拟实现，当前环境已禁用模拟 Provider`);
      }
      throw new ProviderError("NOT_SUPPORTED", `尚无 Provider 声明能力 ${capability}`);
    },

    implFor(capability) {
      const provider = find(capability);
      return provider ? provider.mode : null;
    }
  };
}
