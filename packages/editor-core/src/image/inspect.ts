import { MM_PER_INCH, requiredPixelsForPrint, type PreflightIssue } from "../print";
import { wrapRaster, type RasterImage } from "../raster";
import { normalizeOutputSpec, type NormalizedOutputSpec, type OutputSpec } from "./params";

const COMMON_RATIOS: readonly { label: string; value: number }[] = [
  { label: "1:1", value: 1 },
  { label: "5:4", value: 5 / 4 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:2", value: 3 / 2 },
  { label: "7:5", value: 7 / 5 },
  { label: "16:9", value: 16 / 9 },
  { label: "2:1", value: 2 },
  { label: "3:1", value: 3 },
  { label: "1:√2", value: Math.SQRT2 }
];

function greatestCommonDivisor(a: number, b: number): number {
  let left = Math.abs(Math.round(a));
  let right = Math.abs(Math.round(b));
  while (right > 0) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left === 0 ? 1 : left;
}

export function simplifyAspect(width: number, height: number): string {
  const divisor = greatestCommonDivisor(width, height);
  const left = Math.round(width / divisor);
  const right = Math.round(height / divisor);
  if (left <= 40 && right <= 40) {
    return `${left}:${right}`;
  }
  return `${(width / height).toFixed(3)}:1`;
}

export function describeAspect(width: number, height: number): string {
  const ratio = width / height;
  for (const common of COMMON_RATIOS) {
    const candidate = ratio >= 1 ? common.value : 1 / common.value;
    if (Math.abs(ratio - candidate) / candidate <= 0.01) {
      return common.label;
    }
  }
  return simplifyAspect(width, height);
}

export interface OutputInfo {
  widthPx: number;
  heightPx: number;
  megapixels: number;
  aspectRatio: number;
  aspectLabel: string;
  orientation: "landscape" | "portrait" | "square";
  targetWidthMm: number;
  targetHeightMm: number | null;
  targetDpi: number;
  effectiveDpi: number;
  requiredWidthPx: number;
  requiredHeightPx: number;
  meetsTargetDpi: boolean;
}

function measureOrientation(width: number, height: number): OutputInfo["orientation"] {
  if (width === height) return "square";
  return width > height ? "landscape" : "portrait";
}

export function inspectOutput(image: RasterImage, spec: OutputSpec): OutputInfo {
  wrapRaster(image);
  const normalized: NormalizedOutputSpec = normalizeOutputSpec(spec);
  const ratio = image.height / image.width;
  const targetHeightMm = normalized.heightMm ?? normalized.widthMm * ratio;
  return {
    widthPx: image.width,
    heightPx: image.height,
    megapixels: (image.width * image.height) / 1_000_000,
    aspectRatio: image.width / image.height,
    aspectLabel: describeAspect(image.width, image.height),
    orientation: measureOrientation(image.width, image.height),
    targetWidthMm: normalized.widthMm,
    targetHeightMm: normalized.heightMm,
    targetDpi: normalized.dpi,
    effectiveDpi: image.width / (normalized.widthMm / MM_PER_INCH),
    requiredWidthPx: requiredPixelsForPrint(normalized.widthMm, normalized.dpi),
    requiredHeightPx: requiredPixelsForPrint(targetHeightMm, normalized.dpi),
    meetsTargetDpi: image.width / (normalized.widthMm / MM_PER_INCH) >= normalized.dpi
  };
}

export interface InspectResult {
  info: OutputInfo;
  issues: PreflightIssue[];
}

export function buildOutputReport(image: RasterImage, spec: OutputSpec): InspectResult {
  const info = inspectOutput(image, spec);
  const normalized = normalizeOutputSpec(spec);
  const issues: PreflightIssue[] = [];

  if (!info.meetsTargetDpi) {
    const ratio = info.effectiveDpi / normalized.dpi;
    issues.push({
      level: ratio < 0.5 ? "error" : "warning",
      code: "LOW_EFFECTIVE_DPI",
      message: `当前图片在 ${info.targetWidthMm}mm 输出时的有效分辨率为 ${info.effectiveDpi.toFixed(0)}dpi，低于目标 ${normalized.dpi}dpi（需要 ${info.requiredWidthPx}px 宽）`
    });
  }

  if (info.effectiveDpi < normalized.minimumDpi) {
    issues.push({
      level: "error",
      code: "BELOW_MINIMUM_DPI",
      message: `有效分辨率 ${info.effectiveDpi.toFixed(0)}dpi 低于最低可接受值 ${normalized.minimumDpi}dpi`
    });
  }

  if (normalized.heightMm !== null) {
    const expectedRatio = normalized.widthMm / normalized.heightMm;
    const mismatch = Math.abs(expectedRatio - info.aspectRatio) / expectedRatio;
    if (mismatch > 0.02) {
      issues.push({
        level: "info",
        code: "ASPECT_MISMATCH",
        message: `图片比例 ${info.aspectLabel}（${info.aspectRatio.toFixed(3)}）与目标 ${normalized.widthMm}×${normalized.heightMm}mm 不一致，将出现留白或裁切`
      });
    }
  }

  return { info, issues };
}
