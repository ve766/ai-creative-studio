import { describe, expect, it } from "vitest";
import {
  API_ERROR_CODES,
  ERROR_STATUS,
  apiFailure,
  apiSuccess,
  isRetryableErrorCode,
  parseFailure,
  parseSuccess,
  statusForErrorCode
} from "./api";
import { z } from "zod";

describe("API envelope", () => {
  it("builds a success envelope", () => {
    expect(apiSuccess({ hello: "world" }, "req_1")).toEqual({
      data: { hello: "world" },
      requestId: "req_1"
    });
  });

  it("builds a failure envelope with details", () => {
    const failure = apiFailure("VALIDATION_FAILED", "名称不能为空", {
      requestId: "req_2",
      details: [{ path: "name", message: "不能为空" }]
    });
    expect(failure.error.code).toBe("VALIDATION_FAILED");
    expect(failure.error.details).toHaveLength(1);
  });

  it("maps every error code to an HTTP status", () => {
    expect(statusForErrorCode("UNAUTHENTICATED")).toBe(401);
    expect(statusForErrorCode("FORBIDDEN")).toBe(403);
    expect(statusForErrorCode("NOT_FOUND")).toBe(404);
    expect(statusForErrorCode("CONFLICT")).toBe(409);
    expect(statusForErrorCode("VALIDATION_FAILED")).toBe(422);
    expect(statusForErrorCode("RATE_LIMITED")).toBe(429);
    expect(statusForErrorCode("QUOTA_EXCEEDED")).toBe(402);
    expect(statusForErrorCode("NOT_CONFIGURED")).toBe(503);
    expect(statusForErrorCode("NOT_SUPPORTED")).toBe(400);
    expect(statusForErrorCode("CONTENT_REJECTED")).toBe(422);
    expect(statusForErrorCode("CANCELED")).toBe(409);
    expect(statusForErrorCode("UPSTREAM_ERROR")).toBe(502);
    expect(statusForErrorCode("TIMEOUT")).toBe(504);
    expect(statusForErrorCode("INTERNAL")).toBe(500);
    expect(Object.keys(ERROR_STATUS)).toHaveLength(API_ERROR_CODES.length);
  });

  it("marks only transient failures as retryable", () => {
    expect(isRetryableErrorCode("TIMEOUT")).toBe(true);
    expect(isRetryableErrorCode("UPSTREAM_ERROR")).toBe(true);
    expect(isRetryableErrorCode("RATE_LIMITED")).toBe(true);
    expect(isRetryableErrorCode("NOT_CONFIGURED")).toBe(false);
    expect(isRetryableErrorCode("VALIDATION_FAILED")).toBe(false);
    expect(isRetryableErrorCode("FORBIDDEN")).toBe(false);
    expect(isRetryableErrorCode("NOT_SUPPORTED")).toBe(false);
    expect(isRetryableErrorCode("CONTENT_REJECTED")).toBe(false);
    expect(isRetryableErrorCode("CANCELED")).toBe(false);
  });

  it("parses a valid failure body and rejects foreign shapes", () => {
    const parsed = parseFailure({
      error: { code: "NOT_CONFIGURED", message: "数据库未配置" },
      requestId: "req_3"
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.failure.error.code).toBe("NOT_CONFIGURED");

    expect(parseFailure({ error: { code: "NOPE", message: "x" }, requestId: "r" }).ok).toBe(false);
    expect(parseFailure(null).ok).toBe(false);
  });

  it("parses success data against the caller schema", () => {
    const schema = z.object({ count: z.number() });
    const parsed = parseSuccess({ data: { count: 3 }, requestId: "req_4" }, schema);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data.count).toBe(3);

    expect(parseSuccess({ data: { count: "3" }, requestId: "r" }, schema).ok).toBe(false);
    expect(parseSuccess({ data: { count: 3 } }, schema).ok).toBe(false);
  });
});
