import { describe, expect, it } from "vitest";
import {
  AI_ENV_VARS,
  LIVE_ADAPTER_REGISTERED,
  maskSecretsInText,
  describeAiConfiguration,
  isMockAllowed,
  requestedAiMode
} from "./config";
import { createAiRuntime } from "./runtime";

const FULL_CREDENTIALS = {
  [AI_ENV_VARS.imageProvider]: "vendor-image",
  [AI_ENV_VARS.imageApiKey]: "sk-test-secret-value",
  [AI_ENV_VARS.backgroundProvider]: "vendor-bg",
  [AI_ENV_VARS.backgroundApiKey]: "sk-test-secret-value",
  [AI_ENV_VARS.sceneProvider]: "vendor-scene",
  [AI_ENV_VARS.sceneApiKey]: "sk-test-secret-value"
};

describe("AI configuration", () => {
  it("defaults to off and names the missing variables without values", () => {
    const config = describeAiConfiguration({});
    expect(config.requestedMode).toBe("off");
    expect(config.allowMock).toBe(true);
    expect(config.missing).toEqual([AI_ENV_VARS.imageProvider, AI_ENV_VARS.imageApiKey]);
    expect(config.missing.join()).not.toContain("sk-");
  });

  it("treats unknown modes as off instead of guessing", () => {
    expect(requestedAiMode({ [AI_ENV_VARS.mode]: "prod-live" })).toBe("off");
    expect(requestedAiMode({ [AI_ENV_VARS.mode]: " MOCK " })).toBe("mock");
    expect(requestedAiMode({ [AI_ENV_VARS.mode]: "live" })).toBe("live");
  });

  it("allows mock outside production and refuses it in production", () => {
    expect(isMockAllowed({ [AI_ENV_VARS.appEnv]: "dev" })).toBe(true);
    expect(isMockAllowed({ [AI_ENV_VARS.appEnv]: "production" })).toBe(false);

    const dev = describeAiConfiguration({ [AI_ENV_VARS.mode]: "mock", [AI_ENV_VARS.appEnv]: "dev" });
    expect(dev.problems).toEqual([]);

    const production = describeAiConfiguration({
      [AI_ENV_VARS.mode]: "mock",
      [AI_ENV_VARS.appEnv]: "production"
    });
    expect(production.allowMock).toBe(false);
    expect(production.problems.join()).toContain("禁止");
  });

  it("does not claim a live adapter exists", () => {
    expect(LIVE_ADAPTER_REGISTERED).toBe(false);
    const config = describeAiConfiguration({ [AI_ENV_VARS.mode]: "live", ...FULL_CREDENTIALS });
    expect(config.problems.join()).toContain("适配器尚未实现");
  });

  it("lists which credential groups are present only by label", () => {
    const config = describeAiConfiguration({
      [AI_ENV_VARS.mode]: "live",
      [AI_ENV_VARS.imageProvider]: "vendor-image",
      [AI_ENV_VARS.imageApiKey]: "sk-test-secret-value"
    });
    expect(config.configuredGroups).toEqual(["图像生成 / 局部修改 / 无缝纹理"]);
    expect(config.problems.join()).toContain("凭据不会被使用");
    expect(JSON.stringify(config)).not.toContain("sk-test-secret-value");
  });

  it("reports every missing variable name for live mode", () => {
    const config = describeAiConfiguration({ [AI_ENV_VARS.mode]: "live" });
    expect(config.missing).toHaveLength(6);
    expect(config.missing).toContain(AI_ENV_VARS.sceneApiKey);
  });

  it("masks key material when surfacing error text", () => {
    expect(maskSecretsInText("请求失败 sk-abcdef123456 key 无效")).toBe("请求失败 sk-*** key 无效");
  });
});

describe("AI runtime status", () => {
  it("reports not-configured when AI is off", () => {
    const status = createAiRuntime({}).status();
    expect(status.state).toBe("not-configured");
    expect(status.providerId).toBeNull();
    expect(status.simulatedCapabilities).toEqual([]);
    expect(status.plannedCapabilities).toEqual(["mesh.generate"]);
  });

  it("reports simulated mode with declared simulated capabilities", () => {
    const status = createAiRuntime({ [AI_ENV_VARS.mode]: "mock", [AI_ENV_VARS.appEnv]: "dev" }).status();
    expect(status.state).toBe("simulated");
    expect(status.simulatedCapabilities).toContain("image.generate");
    expect(status.problems.join()).toContain("模拟");
  });

  it("refuses simulated mode in production", () => {
    const status = createAiRuntime({
      [AI_ENV_VARS.mode]: "mock",
      [AI_ENV_VARS.appEnv]: "production"
    }).status();
    expect(status.state).toBe("not-configured");
    expect(status.simulatedCapabilities).toEqual([]);
    expect(status.problems.join()).toContain("禁止模拟 Provider");
  });

  it("never reports verified, even with full credentials configured", () => {
    const status = createAiRuntime({ [AI_ENV_VARS.mode]: "live", ...FULL_CREDENTIALS }).status();
    expect(status.state).not.toBe("verified");
    expect(status.verification.verifiedAt).toBeNull();
    expect(status.state).toBe("not-configured");
    expect(status.problems.join()).toContain("未注册任何真实 AI Provider");
  });

  it("leaks no credential values through status, capabilities or problems", () => {
    const runtime = createAiRuntime({ [AI_ENV_VARS.mode]: "live", ...FULL_CREDENTIALS });
    const serialized = JSON.stringify(runtime.status());
    expect(serialized).not.toContain("sk-test-secret-value");
    expect(serialized).not.toContain("vendor-image");
    expect(serialized).not.toContain("vendor-bg");
    expect(serialized).toContain("适配器尚未实现");
  });
});
