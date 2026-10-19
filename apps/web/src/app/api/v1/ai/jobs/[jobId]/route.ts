import { NextResponse } from "next/server";
import { apiSuccess } from "@acs/cloud-schema";
import { ProviderError } from "@acs/cloud-core";
import { getAiRuntime } from "@/lib/ai/runtime";
import { failureResponse, newRequestId, ownerIdFrom } from "@/lib/ai/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const requestId = newRequestId();
  try {
    const { jobId } = await context.params;
    const runtime = getAiRuntime();
    const snapshot = runtime.getJob(jobId, ownerIdFrom(request));
    if (!snapshot) throw new ProviderError("NOT_FOUND", "任务不存在或不属于当前调用方");
    return NextResponse.json(apiSuccess({ job: snapshot }, requestId), {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "x-acs-simulated": snapshot.simulated ? "true" : "false"
      }
    });
  } catch (error) {
    return failureResponse(error, requestId);
  }
}
