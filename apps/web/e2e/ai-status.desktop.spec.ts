import { expect, test } from "@playwright/test";

// A second production server is started with AI_MODE=mock (see playwright.config.ts)
// so the simulated pipeline is exercised over real HTTP.
const MOCK_BASE = `http://127.0.0.1:${process.env.PW_MOCK_PORT ?? 3200}`;

const GENERATE_BODY = {
  capability: "image.generate",
  input: { prompt: "青花瓷纹样", size: { width: 512, height: 512 } }
};

test("AI 状态卡片如实显示未配置，且不展示任何模拟输出", async ({ page }) => {
  await page.goto("/ai");

  const card = page.locator('section[aria-label="AI 服务状态"]');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-state", "not-configured");
  await expect(card).toContainText("未配置");
  await expect(card).toContainText("尚无真实调用验证记录");
  await expect(card).not.toContainText("模拟输出");
  await expect(card).not.toContainText("已验证");

  await expect(page.locator("section[aria-label='AI 服务状态'] .badge")).not.toContainText("真实服务已验证");
});

test("状态接口在未配置时不会谎报已验证，也不泄露密钥", async ({ request }) => {
  const response = await request.get("/api/v1/ai/status");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");

  const body = (await response.json()) as {
    data: {
      state: string;
      providerId: string | null;
      simulatedCapabilities: string[];
      verification: { verifiedAt: string | null };
    };
    requestId: string;
  };

  expect(body.data.state).toBe("not-configured");
  expect(body.data.providerId).toBeNull();
  expect(body.data.simulatedCapabilities).toEqual([]);
  expect(body.data.verification.verifiedAt).toBeNull();
  expect(body.requestId).toMatch(/^req_/);
  expect(JSON.stringify(body)).not.toContain("sk-");
});

test("AI 未启用时拒绝创建任务", async ({ request }) => {
  const response = await request.post("/api/v1/ai/jobs", { data: GENERATE_BODY });
  expect(response.status()).toBe(503);
  const body = (await response.json()) as { error: { code: string } };
  expect(body.error.code).toBe("NOT_CONFIGURED");
});

test("非法请求参数被拒绝并返回 422", async ({ request }) => {
  const response = await request.post(`${MOCK_BASE}/api/v1/ai/jobs`, {
    data: { ...GENERATE_BODY, input: { ...GENERATE_BODY.input, vendor_field: "x" } }
  });
  expect(response.status()).toBe(422);
  const body = (await response.json()) as { error: { code: string; details: unknown[] } };
  expect(body.error.code).toBe("VALIDATION_FAILED");
  expect(body.error.details.length).toBeGreaterThan(0);
});

test("AI_MODE=mock 时模拟流程可用，结果明确标记为模拟", async ({ request }) => {
  const status = await request.get(`${MOCK_BASE}/api/v1/ai/status`);
  const statusBody = (await status.json()) as { data: { state: string; simulatedCapabilities: string[] } };
  expect(statusBody.data.state).toBe("simulated");
  expect(statusBody.data.simulatedCapabilities).toContain("image.generate");

  const created = await request.post(`${MOCK_BASE}/api/v1/ai/jobs`, { data: GENERATE_BODY });
  expect(created.status()).toBe(201);
  expect(created.headers()["x-acs-simulated"]).toBe("true");

  const body = (await created.json()) as {
    data: {
      simulated: boolean;
      notice: string | null;
      job: {
        taskId: string;
        status: string;
        mode: string;
        simulated: boolean;
        model: string | null;
        usage: { simulated: boolean; actualCost: unknown; estimatedCost: { minorUnits: number } } | null;
        result: { kind: string; reference: string; simulated: boolean } | null;
      };
    };
  };

  expect(body.data.simulated).toBe(true);
  expect(body.data.notice).toContain("不是真实 AI 输出");
  const job = body.data.job;
  expect(job.status).toBe("succeeded");
  expect(job.mode).toBe("mock");
  expect(job.simulated).toBe(true);
  expect(job.model).toBe("mock-placeholder-v1");
  expect(job.result?.simulated).toBe(true);
  expect(job.result?.kind).toBe("inline-data-url");
  expect(job.result?.reference.startsWith("data:image/svg+xml")).toBe(true);
  expect(job.usage?.simulated).toBe(true);
  expect(job.usage?.actualCost).toBeNull();
  expect(job.usage?.estimatedCost.minorUnits).toBe(0);

  const fetched = await request.get(`${MOCK_BASE}/api/v1/ai/jobs/${job.taskId}`);
  expect(fetched.status()).toBe(200);
  const fetchedBody = (await fetched.json()) as { data: { job: { taskId: string } } };
  expect(fetchedBody.data.job.taskId).toBe(job.taskId);
});

test("相同幂等键不会重复执行模拟任务", async ({ request }) => {
  const headers = { "idempotency-key": "e2e-idem-1" };
  const first = await request.post(`${MOCK_BASE}/api/v1/ai/jobs`, { data: GENERATE_BODY, headers });
  const second = await request.post(`${MOCK_BASE}/api/v1/ai/jobs`, { data: GENERATE_BODY, headers });
  const firstBody = (await first.json()) as { data: { job: { taskId: string } } };
  const secondBody = (await second.json()) as { data: { job: { taskId: string } } };

  expect(secondBody.data.job.taskId).toBe(firstBody.data.job.taskId);
});

test("其他调用方无法读取他人的模拟任务", async ({ request }) => {
  const created = await request.post(`${MOCK_BASE}/api/v1/ai/jobs`, {
    data: GENERATE_BODY,
    headers: { "x-acs-client-id": "e2e-owner-a" }
  });
  const createdBody = (await created.json()) as { data: { job: { taskId: string } } };

  const stolen = await request.get(`${MOCK_BASE}/api/v1/ai/jobs/${createdBody.data.job.taskId}`, {
    headers: { "x-acs-client-id": "e2e-owner-b" }
  });
  expect(stolen.status()).toBe(404);
});
