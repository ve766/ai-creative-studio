import type { ApiErrorCode, ErrorDetail } from "@acs/cloud-schema";
import { isRetryableErrorCode } from "@acs/cloud-schema";

export interface ProviderErrorOptions {
  details?: ErrorDetail[];
  retryable?: boolean;
  retryAfterSeconds?: number;
  cause?: unknown;
}

export class ProviderError extends Error {
  readonly code: ApiErrorCode;
  readonly details: ErrorDetail[] | undefined;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | undefined;

  constructor(code: ApiErrorCode, message: string, options: ProviderErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ProviderError";
    this.code = code;
    this.details = options.details;
    this.retryable = options.retryable ?? isRetryableErrorCode(code);
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export function isProviderError(value: unknown): value is ProviderError {
  return value instanceof ProviderError;
}

export function toProviderError(value: unknown, fallback: ApiErrorCode = "INTERNAL"): ProviderError {
  if (isProviderError(value)) return value;
  const message = value instanceof Error ? value.message : "未知错误";
  return new ProviderError(fallback, message, { cause: value });
}
