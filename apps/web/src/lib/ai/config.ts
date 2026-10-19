import type { AiRequestedMode } from "@acs/ai-schema";

export type EnvLike = Record<string, string | undefined>;

export const AI_ENV_VARS = {
  mode: "AI_MODE",
  appEnv: "APP_ENV",
  imageProvider: "AI_IMAGE_PROVIDER",
  imageApiKey: "AI_IMAGE_API_KEY",
  backgroundProvider: "AI_BG_REMOVAL_PROVIDER",
  backgroundApiKey: "AI_BG_REMOVAL_API_KEY",
  sceneProvider: "AI_SCENE_PROVIDER",
  sceneApiKey: "AI_SCENE_API_KEY"
} as const;

export interface AiCredentialGroup {
  label: string;
  required: readonly [string, string];
}

export const AI_CREDENTIAL_GROUPS: readonly AiCredentialGroup[] = [
  {
    label: "图像生成 / 局部修改 / 无缝纹理",
    required: [AI_ENV_VARS.imageProvider, AI_ENV_VARS.imageApiKey]
  },
  {
    label: "智能抠图",
    required: [AI_ENV_VARS.backgroundProvider, AI_ENV_VARS.backgroundApiKey]
  },
  {
    label: "场景贴图",
    required: [AI_ENV_VARS.sceneProvider, AI_ENV_VARS.sceneApiKey]
  }
];

export const LIVE_ADAPTER_REGISTERED = false;

export interface AiConfiguration {
  requestedMode: AiRequestedMode;
  allowMock: boolean;
  missing: string[];
  configuredGroups: string[];
  problems: string[];
}

function isSet(env: EnvLike, name: string): boolean {
  const value = env[name];
  return value !== undefined && value.trim().length > 0;
}

export function requestedAiMode(env: EnvLike): AiRequestedMode {
  const raw = (env[AI_ENV_VARS.mode] ?? "").trim().toLowerCase();
  if (raw === "mock" || raw === "live") return raw;
  return "off";
}

export function isProductionEnv(env: EnvLike): boolean {
  return (env[AI_ENV_VARS.appEnv] ?? "").trim().toLowerCase() === "production";
}

export function isMockAllowed(env: EnvLike): boolean {
  return !isProductionEnv(env);
}

export function describeAiConfiguration(env: EnvLike): AiConfiguration {
  const requestedMode = requestedAiMode(env);
  const allowMock = isMockAllowed(env);
  const configuredGroups: string[] = [];
  const missing: string[] = [];

  for (const group of AI_CREDENTIAL_GROUPS) {
    const complete = group.required.every((name) => isSet(env, name));
    if (complete) configuredGroups.push(group.label);
    else missing.push(...group.required.filter((name) => !isSet(env, name)));
  }

  const problems: string[] = [];
  if (requestedMode === "mock" && !allowMock) {
    problems.push(`${AI_ENV_VARS.mode}=mock 在当前 ${AI_ENV_VARS.appEnv} 下被禁止使用`);
  }
  if (requestedMode === "live") {
    if (!LIVE_ADAPTER_REGISTERED) {
      problems.push("真实 AI Provider 适配器尚未实现，本版本不会发起任何真实 AI 调用");
    }
    if (configuredGroups.length > 0) {
      problems.push(`检测到凭据：${configuredGroups.join("、")}，但当前没有可用适配器，凭据不会被使用`);
    }
  }

  return {
    requestedMode,
    allowMock,
    missing:
      requestedMode === "live"
        ? missing
        : AI_CREDENTIAL_GROUPS[0]?.required.filter((name) => !isSet(env, name)) ?? [],
    configuredGroups,
    problems
  };
}

export function maskSecretsInText(text: string): string {
  return text.replace(/(sk-[A-Za-z0-9_-]{6,})/gu, "sk-***");
}
