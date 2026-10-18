import type { CloudStatus } from "@acs/cloud-schema";
import { describeProviderConfig, type ProviderConfig, type ProviderMode } from "@acs/cloud-core";

export type EnvLike = Record<string, string | undefined>;

export type RequestedCloudMode = "local" | "mock" | "cloud";

export const CLOUD_ENV_VARS = {
  mode: "CLOUD_MODE",
  projectStore: "CLOUD_PROJECT_STORE",
  appEnv: "APP_ENV",
  databaseUrl: "DATABASE_URL",
  authUrl: "NEXT_PUBLIC_SUPABASE_URL",
  authAnonKey: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  authServiceRoleKey: "SUPABASE_SERVICE_ROLE_KEY",
  storageEndpoint: "S3_ENDPOINT",
  storageRegion: "S3_REGION",
  storageBucket: "S3_BUCKET",
  storageAccessKeyId: "S3_ACCESS_KEY_ID",
  storageSecretAccessKey: "S3_SECRET_ACCESS_KEY",
  aiImageProvider: "AI_IMAGE_PROVIDER",
  aiImageApiKey: "AI_IMAGE_API_KEY"
} as const;

const DATABASE_REQUIRED = [CLOUD_ENV_VARS.databaseUrl, CLOUD_ENV_VARS.projectStore] as const;
const STORAGE_REQUIRED = [
  CLOUD_ENV_VARS.storageEndpoint,
  CLOUD_ENV_VARS.storageBucket,
  CLOUD_ENV_VARS.storageAccessKeyId,
  CLOUD_ENV_VARS.storageSecretAccessKey
] as const;
const AI_REQUIRED = [CLOUD_ENV_VARS.aiImageProvider, CLOUD_ENV_VARS.aiImageApiKey] as const;

export function requestedMode(env: EnvLike): RequestedCloudMode {
  const raw = (env[CLOUD_ENV_VARS.mode] ?? "").trim().toLowerCase();
  if (raw === "") return "local";
  if (raw === "local" || raw === "mock" || raw === "cloud") return raw;
  return "local";
}

export function isProductionEnv(env: EnvLike): boolean {
  return (env[CLOUD_ENV_VARS.appEnv] ?? "").trim().toLowerCase() === "production";
}

function providerStatus(config: ProviderConfig): CloudStatus["database"] {
  return config.mode;
}

export interface CloudStatusDetails extends CloudStatus {
  missing: {
    database: string[];
    objectStorage: string[];
    ai: string[];
  };
}

export function describeCloudStatus(
  env: EnvLike,
  checkedAt: string = new Date().toISOString()
): CloudStatusDetails {
  const mode = requestedMode(env);
  const database = describeProviderConfig(DATABASE_REQUIRED, env, { mock: mode === "mock" });
  const objectStorage = describeProviderConfig(STORAGE_REQUIRED, env, { mock: mode === "mock" });
  const ai = describeProviderConfig(AI_REQUIRED, env, { mock: mode === "mock" });

  const problems: string[] = [];
  let storage: CloudStatus["storage"] = "local";

  if (mode === "mock") {
    if (isProductionEnv(env)) {
      problems.push(
        `${CLOUD_ENV_VARS.mode}=mock 禁止在 ${CLOUD_ENV_VARS.appEnv}=production 使用`
      );
    } else {
      storage = "mock";
      problems.push("当前为开发模拟模式：数据只存在于进程内存，刷新后丢失");
    }
  } else if (mode === "cloud") {
    if (database.mode === "configured") {
      storage = "cloud";
    } else {
      problems.push(
        `${CLOUD_ENV_VARS.mode}=cloud 但数据库配置不完整（缺少 ${database.missing.join("、")}），已回退为本地保存`
      );
    }
    if (objectStorage.mode !== "configured") {
      problems.push(`对象存储配置不完整（缺少 ${objectStorage.missing.join("、")}），暂不能上传云端资源`);
    }
    if (ai.mode !== "configured") {
      problems.push(`AI Provider 配置不完整（缺少 ${ai.missing.join("、")}），AI 功能保持未配置状态`);
    }
  }

  return {
    requestedMode: mode,
    storage,
    database: providerStatus(database),
    objectStorage: providerStatus(objectStorage),
    ai: providerStatus(ai),
    problems,
    checkedAt,
    missing: {
      database: database.missing,
      objectStorage: objectStorage.missing,
      ai: ai.missing
    }
  };
}

export function resolveCloudStatus(env: EnvLike): CloudStatus {
  const details = describeCloudStatus(env);
  return {
    requestedMode: details.requestedMode,
    storage: details.storage,
    database: details.database,
    objectStorage: details.objectStorage,
    ai: details.ai,
    problems: details.problems,
    checkedAt: details.checkedAt
  };
}

export function storageModeForUi(env: EnvLike): ProviderMode {
  const status = describeCloudStatus(env);
  if (status.storage === "mock") return "mock";
  if (status.storage === "cloud") return "configured";
  return "not-configured";
}
