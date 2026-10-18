import { z } from "zod";

export const API_PREFIX = "/api/v1";

export const API_ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "CONFLICT",
  "RATE_LIMITED",
  "QUOTA_EXCEEDED",
  "NOT_CONFIGURED",
  "UPSTREAM_ERROR",
  "TIMEOUT",
  "INTERNAL"
] as const;

export const ApiErrorCodeSchema = z.enum(API_ERROR_CODES);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  QUOTA_EXCEEDED: 402,
  NOT_CONFIGURED: 503,
  UPSTREAM_ERROR: 502,
  TIMEOUT: 504,
  INTERNAL: 500
};

const RETRYABLE: ApiErrorCode[] = [
  "RATE_LIMITED",
  "UPSTREAM_ERROR",
  "TIMEOUT",
  "INTERNAL"
];

export function statusForErrorCode(code: ApiErrorCode): number {
  return ERROR_STATUS[code];
}

export function isRetryableErrorCode(code: ApiErrorCode): boolean {
  return RETRYABLE.includes(code);
}

export const ErrorDetailSchema = z.object({
  path: z.string(),
  message: z.string()
});

export const ApiErrorBodySchema = z.object({
  code: ApiErrorCodeSchema,
  message: z.string().min(1),
  details: z.array(ErrorDetailSchema).optional(),
  retryAfterSeconds: z.number().int().positive().optional()
});

export const ApiFailureSchema = z.object({
  error: ApiErrorBodySchema,
  requestId: z.string().min(1)
});

export const ApiSuccessSchema = z.object({
  data: z.unknown(),
  requestId: z.string().min(1)
});

export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;
export type ApiFailure = z.infer<typeof ApiFailureSchema>;
export type ApiSuccess = z.infer<typeof ApiSuccessSchema>;

export function apiSuccess<T>(data: T, requestId: string): { data: T; requestId: string } {
  return { data, requestId };
}

export function apiFailure(
  code: ApiErrorCode,
  message: string,
  options: { requestId: string; details?: ErrorDetail[]; retryAfterSeconds?: number }
): ApiFailure {
  const error: ApiErrorBody = { code, message };
  if (options.details) error.details = options.details;
  if (options.retryAfterSeconds) error.retryAfterSeconds = options.retryAfterSeconds;
  return { error, requestId: options.requestId };
}

export type ParsedFailure =
  | { ok: true; failure: ApiFailure }
  | { ok: false; message: string };

export function parseFailure(body: unknown): ParsedFailure {
  const parsed = ApiFailureSchema.safeParse(body);
  if (!parsed.success) return { ok: false, message: "响应不是统一的错误结构" };
  return { ok: true, failure: parsed.data };
}

export type ParsedSuccess<T> =
  | { ok: true; data: T; requestId: string }
  | { ok: false; message: string };

export function parseSuccess<T>(body: unknown, schema: z.ZodType<T>): ParsedSuccess<T> {
  const envelope = ApiSuccessSchema.safeParse(body);
  if (!envelope.success) return { ok: false, message: "响应缺少 data / requestId 字段" };
  const parsed = schema.safeParse(envelope.data.data);
  if (!parsed.success) return { ok: false, message: "响应 data 不符合约定的数据结构" };
  return { ok: true, data: parsed.data, requestId: envelope.data.requestId };
}
