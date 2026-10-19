import { NextResponse } from "next/server";
import { apiFailure, ERROR_STATUS, type ApiErrorCode } from "@acs/cloud-schema";
import { isProviderError, ProviderError } from "@acs/cloud-core";
import { maskSecretsInText } from "./config";

export const AI_OWNER_HEADER = "x-acs-client-id";
export const DEFAULT_ANONYMOUS_OWNER = "local-anonymous";

export function newRequestId(): string {
  return `req_${crypto.randomUUID()}`;
}

export function ownerIdFrom(request: Request): string {
  const raw = request.headers.get(AI_OWNER_HEADER)?.trim();
  if (!raw) return DEFAULT_ANONYMOUS_OWNER;
  return raw.slice(0, 120).replace(/[^A-Za-z0-9._:-]+/gu, "_");
}

export function failureResponse(error: unknown, requestId: string): NextResponse {
  const providerError = isProviderError(error)
    ? error
    : new ProviderError("INTERNAL", error instanceof Error ? error.message : "未知错误");
  const body = apiFailure(providerError.code, maskSecretsInText(providerError.message), {
    requestId,
    ...(providerError.details ? { details: providerError.details } : {}),
    ...(providerError.retryAfterSeconds ? { retryAfterSeconds: providerError.retryAfterSeconds } : {})
  });
  return NextResponse.json(body, {
    status: ERROR_STATUS[providerError.code],
    headers: { "cache-control": "no-store" }
  });
}

export function codeOf(error: unknown): ApiErrorCode {
  return isProviderError(error) ? error.code : "INTERNAL";
}
