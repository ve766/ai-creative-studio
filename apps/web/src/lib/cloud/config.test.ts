import { describe, expect, it } from "vitest";
import {
  CLOUD_ENV_VARS,
  describeCloudStatus,
  isProductionEnv,
  requestedMode,
  resolveCloudStatus,
  storageModeForUi
} from "./config";

const CLOUD_READY = {
  [CLOUD_ENV_VARS.mode]: "cloud",
  [CLOUD_ENV_VARS.projectStore]: "postgres",
  [CLOUD_ENV_VARS.databaseUrl]: "postgres://user:pass@localhost:5432/acs",
  [CLOUD_ENV_VARS.storageEndpoint]: "https://storage.example.com",
  [CLOUD_ENV_VARS.storageBucket]: "acs-assets",
  [CLOUD_ENV_VARS.storageAccessKeyId]: "key",
  [CLOUD_ENV_VARS.storageSecretAccessKey]: "secret",
  [CLOUD_ENV_VARS.aiImageProvider]: "example",
  [CLOUD_ENV_VARS.aiImageApiKey]: "token"
};

describe("requestedMode", () => {
  it("defaults to local when unset or unknown", () => {
    expect(requestedMode({})).toBe("local");
    expect(requestedMode({ [CLOUD_ENV_VARS.mode]: "  " })).toBe("local");
    expect(requestedMode({ [CLOUD_ENV_VARS.mode]: "nonsense" })).toBe("local");
  });

  it("reads explicit modes case-insensitively", () => {
    expect(requestedMode({ [CLOUD_ENV_VARS.mode]: "CLOUD" })).toBe("cloud");
    expect(requestedMode({ [CLOUD_ENV_VARS.mode]: "Mock" })).toBe("mock");
    expect(requestedMode({ [CLOUD_ENV_VARS.mode]: "local" })).toBe("local");
  });
});

describe("describeCloudStatus", () => {
  it("reports local storage and unconfigured providers by default", () => {
    const status = describeCloudStatus({}, "2026-10-18T00:00:00.000Z");
    expect(status.storage).toBe("local");
    expect(status.database).toBe("not-configured");
    expect(status.objectStorage).toBe("not-configured");
    expect(status.ai).toBe("not-configured");
    expect(status.problems).toEqual([]);
    expect(status.missing.database).toContain(CLOUD_ENV_VARS.databaseUrl);
  });

  it("never reports cloud storage when database settings are missing", () => {
    const status = describeCloudStatus({ [CLOUD_ENV_VARS.mode]: "cloud" });
    expect(status.storage).toBe("local");
    expect(status.database).toBe("not-configured");
    expect(status.problems.join(" ")).toContain("已回退为本地保存");
  });

  it("reports cloud storage only when required settings exist", () => {
    const status = describeCloudStatus(CLOUD_READY);
    expect(status.storage).toBe("cloud");
    expect(status.database).toBe("configured");
    expect(status.objectStorage).toBe("configured");
    expect(status.ai).toBe("configured");
    expect(status.problems).toEqual([]);
  });

  it("keeps cloud storage but lists missing optional providers", () => {
    const env = { ...CLOUD_READY, [CLOUD_ENV_VARS.storageSecretAccessKey]: undefined };
    const status = describeCloudStatus(env);
    expect(status.storage).toBe("cloud");
    expect(status.objectStorage).toBe("not-configured");
    expect(status.problems.join(" ")).toContain("对象存储配置不完整");
  });

  it("treats blank values as missing", () => {
    const env = { ...CLOUD_READY, [CLOUD_ENV_VARS.databaseUrl]: "   " };
    expect(describeCloudStatus(env).storage).toBe("local");
  });

  it("allows mock only outside production", () => {
    const dev = describeCloudStatus({ [CLOUD_ENV_VARS.mode]: "mock" });
    expect(dev.storage).toBe("mock");
    expect(dev.problems.join(" ")).toContain("开发模拟模式");

    const prod = describeCloudStatus({
      [CLOUD_ENV_VARS.mode]: "mock",
      [CLOUD_ENV_VARS.appEnv]: "production"
    });
    expect(prod.storage).toBe("local");
    expect(prod.problems.join(" ")).toContain("禁止");
  });

  it("reports a stable checkedAt when provided", () => {
    expect(describeCloudStatus({}, "2026-01-01T00:00:00.000Z").checkedAt).toBe(
      "2026-01-01T00:00:00.000Z"
    );
  });
});

describe("helpers", () => {
  it("detects production env", () => {
    expect(isProductionEnv({ APP_ENV: "Production" })).toBe(true);
    expect(isProductionEnv({ APP_ENV: "dev" })).toBe(false);
    expect(isProductionEnv({})).toBe(false);
  });

  it("maps storage mode for UI without leaking secrets", () => {
    expect(storageModeForUi({})).toBe("not-configured");
    expect(storageModeForUi({ [CLOUD_ENV_VARS.mode]: "mock" })).toBe("mock");
    expect(storageModeForUi(CLOUD_READY)).toBe("configured");
  });

  it("resolveCloudStatus drops the internal missing list", () => {
    const status = resolveCloudStatus(CLOUD_READY);
    expect(Object.keys(status)).not.toContain("missing");
    expect(status.storage).toBe("cloud");
  });
});
