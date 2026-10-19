import { NextResponse } from "next/server";
import { AiServiceStatusSchema } from "@acs/ai-schema";
import { getAiRuntime } from "@/lib/ai/runtime";
import { newRequestId } from "@/lib/ai/http";

export const dynamic = "force-dynamic";

export function GET() {
  const requestId = newRequestId();
  const status = AiServiceStatusSchema.parse(getAiRuntime().status());
  return NextResponse.json(
    { data: status, requestId },
    { status: 200, headers: { "cache-control": "no-store" } }
  );
}
