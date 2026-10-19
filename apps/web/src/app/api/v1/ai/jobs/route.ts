import { NextResponse } from "next/server";
import { AiJobRequestSchema } from "@acs/ai-schema";
import { apiSuccess } from "@acs/cloud-schema";
import { ProviderError } from "@acs/cloud-core";
import { getAiRuntime } from "@/lib/ai/runtime";
import { failureResponse, newRequestId, ownerIdFrom } from "@/lib/ai/http";

export const dynamic = "force-dynamic";

export const SIMULATED_NOTICE =
  "该结果由开发模拟 Provider 生成，不是真实 AI 输出，也不产生任何费用；当前接口尚未接入登录与额度校验，请勿用于正式出图。";

export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ProviderError("VALIDATION_FAILED", "请求体不是合法 JSON");
    }

    const headerKey = request.headers.get("idempotency-key")?.trim();
    const payload = { ...(body as Record<string, unknown>) };
    if (headerKey && payload.idempotencyKey === undefined) payload.idempotencyKey = headerKey;

    const parsed = AiJobRequestSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ProviderError("VALIDATION_FAILED", "AI 请求结构不合法", {
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      });
    }

    const runtime = getAiRuntime();
    if (!runtime.configuration.allowMock) {
      throw new ProviderError("FORBIDDEN", "当前环境禁止使用模拟 AI Provider");
    }
    if (runtime.configuration.requestedMode === "off") {
      throw new ProviderError("NOT_CONFIGURED", "AI 功能未启用（未设置 AI_MODE）");
    }
    if (runtime.configuration.requestedMode === "live") {
      throw new ProviderError("NOT_CONFIGURED", "真实 AI Provider 适配器尚未实现");
    }

    const snapshot = await runtime.submit(parsed.data, ownerIdFrom(request));
    return NextResponse.json(
      apiSuccess(
        {
          job: snapshot,
          simulated: snapshot.simulated,
          notice: snapshot.simulated ? SIMULATED_NOTICE : null
        },
        requestId
      ),
      {
        status: snapshot.status === "queued" || snapshot.status === "running" ? 202 : 201,
        headers: {
          "cache-control": "no-store",
          "x-acs-simulated": snapshot.simulated ? "true" : "false"
        }
      }
    );
  } catch (error) {
    return failureResponse(error, requestId);
  }
}
