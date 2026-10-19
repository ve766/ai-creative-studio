import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as getStatus } from "@/app/api/v1/ai/status/route";
import { POST as postJob } from "@/app/api/v1/ai/jobs/route";
import { GET as getJob } from "@/app/api/v1/ai/jobs/[jobId]/route";
import { AI_ENV_VARS } from "./config";
import { AI_OWNER_HEADER, DEFAULT_ANONYMOUS_OWNER } from "./http";

const MANAGED_ENV_VARS = [
  AI_ENV_VARS.mode,
  AI_ENV_VARS.appEnv,
  AI_ENV_VARS.imageProvider,
  AI_ENV_VARS.imageApiKey,
  AI_ENV_VARS.sceneApiKey
] as const;

const original: Record<string, string | undefined> = {};

function resetRuntimeCache() {
  (globalThis as unknown as { __acsAiRuntime?: unknown }).__acsAiRuntime = undefined;
}

function applyEnv(env: Record<string, string>) {
  for (const name of MANAGED_ENV_VARS) delete process.env[name];
  for (const [name, value] of Object.entries(env)) process.env[name] = value;
  resetRuntimeCache();
}

function generateBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    capability: "image.generate",
    input: { prompt: "青花瓷纹样", size: { width: 512, height: 512 } },
    ...overrides
  });
}

function jobRequest(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/v1/ai/jobs", {
    method: "POST",
    headers: { "content-type": "application/json", [AI_OWNER_HEADER]: "user_1", ...headers },
    body
  });
}

beforeEach(() => {
  for (const name of MANAGED_ENV_VARS) original[name] = process.env[name];
  resetRuntimeCache();
});

afterEach(() => {
  for (const name of MANAGED_ENV_VARS) {
    const value = original[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  resetRuntimeCache();
});

describe("GET /api/v1/ai/status", () => {
  it("reports not-configured with cache disabled and a request id", async () => {
    applyEnv({});
    const response = getStatus();
    const body = (await response.json()) as { data: Record<string, unknown>; requestId: string };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.requestId).toMatch(/^req_/u);
    expect(body.data.state).toBe("not-configured");
    expect(body.data.providerId).toBeNull();
    expect(body.data.verifiedAt).toBeUndefined();
    expect((body.data.verification as { verifiedAt: string | null }).verifiedAt).toBeNull();
  });

  it("reports simulated mode in development mock mode", async () => {
    applyEnv({ [AI_ENV_VARS.mode]: "mock", [AI_ENV_VARS.appEnv]: "dev" });
    const body = (await getStatus().json()) as { data: { state: string; simulatedCapabilities: string[] } };
    expect(body.data.state).toBe("simulated");
    expect(body.data.simulatedCapabilities).toContain("image.generate");
  });

  it("refuses to report simulated mode in production", async () => {
    applyEnv({ [AI_ENV_VARS.mode]: "mock", [AI_ENV_VARS.appEnv]: "production" });
    const body = (await getStatus().json()) as { data: { state: string; simulatedCapabilities: string[] } };
    expect(body.data.state).toBe("not-configured");
    expect(body.data.simulatedCapabilities).toEqual([]);
  });

  it("never turns configured credentials into a verified status", async () => {
    applyEnv({
      [AI_ENV_VARS.mode]: "live",
      [AI_ENV_VARS.imageProvider]: "vendor-image",
      [AI_ENV_VARS.imageApiKey]: "sk-test-secret-value"
    });
    const response = getStatus();
    const text = await response.text();
    const body = JSON.parse(text) as { data: { state: string; missing: string[] } };

    expect(body.data.state).not.toBe("verified");
    expect(text).not.toContain("sk-test-secret-value");
    expect(text).not.toContain("vendor-image");
    expect(body.data.missing).not.toContain(AI_ENV_VARS.imageApiKey);
    expect(body.data.missing).toContain(AI_ENV_VARS.sceneApiKey);
  });
});

describe("POST /api/v1/ai/jobs", () => {
  it("rejects requests when AI is not enabled", async () => {
    applyEnv({});
    const response = await postJob(jobRequest(generateBody()));
    const body = (await response.json()) as { error: { code: string } };
    expect(response.status).toBe(503);
    expect(body.error.code).toBe("NOT_CONFIGURED");
  });

  it("refuses the mock provider in production", async () => {
    applyEnv({ [AI_ENV_VARS.mode]: "mock", [AI_ENV_VARS.appEnv]: "production" });
    const response = await postJob(jobRequest(generateBody()));
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("FORBIDDEN");
  });

  it("reports NOT_CONFIGURED for live mode because no adapter exists", async () => {
    applyEnv({
      [AI_ENV_VARS.mode]: "live",
      [AI_ENV_VARS.imageProvider]: "vendor-image",
      [AI_ENV_VARS.imageApiKey]: "sk-test-secret-value"
    });
    const response = await postJob(jobRequest(generateBody()));
    const text = await response.text();
    expect(response.status).toBe(503);
    expect(text).toContain("NOT_CONFIGURED");
    expect(text).not.toContain("sk-test-secret-value");
  });

  it("runs the simulated pipeline and marks the response as simulated", async () => {
    applyEnv({ [AI_ENV_VARS.mode]: "mock", [AI_ENV_VARS.appEnv]: "dev" });
    const response = await postJob(jobRequest(generateBody()));
    const body = (await response.json()) as {
      data: { job: Record<string, unknown>; simulated: boolean; notice: string | null };
      requestId: string;
    };

    expect(response.status).toBe(201);
    expect(response.headers.get("x-acs-simulated")).toBe("true");
    expect(body.data.simulated).toBe(true);
    expect(body.data.notice).toContain("不是真实 AI 输出");
    expect(body.data.job.status).toBe("succeeded");
    expect(body.data.job.providerId).toBe("mock");
    expect(body.data.job.simulated).toBe(true);
    expect(Object.keys(body.data.job)).not.toContain("ownerId");
    expect((body.data.job.result as { reference: string }).reference.startsWith("data:image/svg+xml")).toBe(true);
  });

  it("deduplicates repeated idempotency keys", async () => {
    applyEnv({ [AI_ENV_VARS.mode]: "mock", [AI_ENV_VARS.appEnv]: "dev" });
    const first = (await (await postJob(jobRequest(generateBody(), { "idempotency-key": "idem-http-1" }))).json()) as {
      data: { job: { taskId: string } };
    };
    const second = (await (await postJob(jobRequest(generateBody(), { "idempotency-key": "idem-http-1" }))).json()) as {
      data: { job: { taskId: string } };
    };
    expect(second.data.job.taskId).toBe(first.data.job.taskId);
  });

  it("rejects invalid payloads with details and creates no job", async () => {
    applyEnv({ [AI_ENV_VARS.mode]: "mock", [AI_ENV_VARS.appEnv]: "dev" });
    const bad = await postJob(
      jobRequest(generateBody({ input: { prompt: "ok", size: { width: 512, height: 512 }, vendor_field: true } }))
    );
    const badBody = (await bad.json()) as { error: { code: string; details: unknown[] } };
    expect(bad.status).toBe(422);
    expect(badBody.error.code).toBe("VALIDATION_FAILED");
    expect(badBody.error.details.length).toBeGreaterThan(0);

    const notJson = await postJob(jobRequest("{"));
    expect(notJson.status).toBe(422);

    const unknownJob = await getJob(new Request("http://localhost:3000/api/v1/ai/jobs/job_missing"), {
      params: Promise.resolve({ jobId: "job_missing" })
    });
    expect(unknownJob.status).toBe(404);
  });
});

describe("GET /api/v1/ai/jobs/{jobId}", () => {
  it("returns the job to its owner only", async () => {
    applyEnv({ [AI_ENV_VARS.mode]: "mock", [AI_ENV_VARS.appEnv]: "dev" });
    const created = (await (await postJob(jobRequest(generateBody()))).json()) as {
      data: { job: { taskId: string } };
    };
    const taskId = created.data.job.taskId;

    const mine = await getJob(
      new Request(`http://localhost:3000/api/v1/ai/jobs/${taskId}`, {
        headers: { [AI_OWNER_HEADER]: "user_1" }
      }),
      { params: Promise.resolve({ jobId: taskId }) }
    );
    expect(mine.status).toBe(200);

    const anon = await getJob(
      new Request(`http://localhost:3000/api/v1/ai/jobs/${taskId}`, {
        headers: { [AI_OWNER_HEADER]: "user_2" }
      }),
      { params: Promise.resolve({ jobId: taskId }) }
    );
    expect(anon.status).toBe(404);
    expect(DEFAULT_ANONYMOUS_OWNER).not.toBe("user_1");
  });
});
