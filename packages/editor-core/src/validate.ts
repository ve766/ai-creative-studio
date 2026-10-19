import { invalidParam } from "./errors";

export function requireFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw invalidParam(`${label} 必须是有限数字，收到 ${String(value)}`);
  }
  return value;
}

export function requirePositiveInt(value: number, label: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw invalidParam(`${label} 必须是正整数，收到 ${String(value)}`);
  }
  return value;
}

export function requireFiniteInRange(
  value: number,
  min: number,
  max: number,
  label: string
): number {
  requireFinite(value, label);
  if (value < min || value > max) {
    throw invalidParam(`${label} 必须在 ${min}-${max} 之间，收到 ${String(value)}`);
  }
  return value;
}

export function requireIntegerInRange(
  value: number,
  min: number,
  max: number,
  label: string
): number {
  if (!Number.isInteger(value)) {
    throw invalidParam(`${label} 必须是整数，收到 ${String(value)}`);
  }
  return requireFiniteInRange(value, min, max, label);
}
