import { NextResponse } from "next/server";
import { apiSuccess, CloudStatusSchema } from "@acs/cloud-schema";
import { resolveCloudStatus } from "@/lib/cloud/config";

export const dynamic = "force-dynamic";

export function GET() {
  const requestId = `req_${crypto.randomUUID()}`;
  const status = resolveCloudStatus(process.env);
  const payload = apiSuccess(CloudStatusSchema.parse(status), requestId);
  return NextResponse.json(payload, {
    status: 200,
    headers: { "cache-control": "no-store" }
  });
}
