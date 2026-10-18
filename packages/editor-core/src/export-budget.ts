import { requiredPixelsForPrint } from "./print";

export const DEFAULT_MAX_PRINT_SCALE = 4;

export interface ExportBudgetLimits {
  maxPixels: number;
  maxDimension: number;
}

export const DEFAULT_EXPORT_LIMITS: ExportBudgetLimits = {
  maxPixels: 16_000_000,
  maxDimension: 8192
};

export type ExportMode = "preview" | "print";

export interface ExportPlanInput {
  canvasWidth: number;
  canvasHeight: number;
  mode: ExportMode;
  targetWidthMm?: number | null;
  targetDpi?: number | null;
  maxPrintScale?: number;
  limits?: Partial<ExportBudgetLimits>;
}

export interface ExportPlan {
  pixelRatio: number;
  outputWidth: number;
  outputHeight: number;
  outputPixels: number;
  requestedWidthPx: number;
  capped: boolean;
  effectiveDpi: number | null;
  warning: string | null;
}

export type ExportPlanResult =
  | { ok: true; plan: ExportPlan }
  | { ok: false; message: string };

export function planExport(input: ExportPlanInput): ExportPlanResult {
  const limits: ExportBudgetLimits = { ...DEFAULT_EXPORT_LIMITS, ...input.limits };
  const { canvasWidth, canvasHeight } = input;

  if (!Number.isFinite(canvasWidth) || !Number.isFinite(canvasHeight) || canvasWidth <= 0 || canvasHeight <= 0) {
    return { ok: false, message: "画布尺寸无效，无法导出" };
  }

  const maxScale = input.maxPrintScale ?? DEFAULT_MAX_PRINT_SCALE;
  const hasPrintTarget =
    input.mode === "print" &&
    typeof input.targetWidthMm === "number" &&
    input.targetWidthMm > 0 &&
    typeof input.targetDpi === "number" &&
    input.targetDpi > 0;

  const requestedWidthPx = hasPrintTarget
    ? requiredPixelsForPrint(input.targetWidthMm as number, input.targetDpi as number)
    : canvasWidth;

  const desiredRatio = hasPrintTarget
    ? Math.min(requestedWidthPx / canvasWidth, maxScale)
    : 1;

  const allowedWidthPx = Math.min(
    limits.maxDimension,
    Math.sqrt(limits.maxPixels * (canvasWidth / canvasHeight))
  );
  const allowedHeightPx = Math.min(
    limits.maxDimension,
    Math.sqrt(limits.maxPixels * (canvasHeight / canvasWidth))
  );
  const allowedRatio = Math.min(allowedWidthPx / canvasWidth, allowedHeightPx / canvasHeight);

  const pixelRatio = Math.min(desiredRatio, allowedRatio);

  if (pixelRatio < 1) {
    return {
      ok: false,
      message: `当前设备无法导出该画布：画布为 ${canvasWidth}×${canvasHeight}px，已超出浏览器画布像素上限（约 ${Math.round(
        limits.maxPixels / 1_000_000
      )} 百万像素、单边 ${limits.maxDimension}px），无法在不损失分辨率的前提下导出`
    };
  }

  const outputWidth = Math.max(1, Math.floor(canvasWidth * pixelRatio));
  const outputHeight = Math.max(1, Math.floor(canvasHeight * pixelRatio));
  const capped = pixelRatio < desiredRatio - 1e-9;

  const effectiveDpi =
    hasPrintTarget && input.targetWidthMm
      ? (outputWidth / input.targetWidthMm) * 25.4
      : null;

  let warning: string | null = null;
  if (capped) {
    const requestedWidth = Math.floor(canvasWidth * desiredRatio);
    const requestedHeight = Math.floor(canvasHeight * desiredRatio);
    warning = `受浏览器画布像素上限限制，输出已由 ${requestedWidth}×${requestedHeight}px 降到 ${outputWidth}×${outputHeight}px`;
    if (effectiveDpi !== null && input.targetDpi) {
      warning += `（相当于 ${Math.round(effectiveDpi)}dpi，低于目标 ${input.targetDpi}dpi），该文件不适合直接送印`;
    } else {
      warning += "，该文件不是原始分辨率";
    }
  }

  return {
    ok: true,
    plan: {
      pixelRatio,
      outputWidth,
      outputHeight,
      outputPixels: outputWidth * outputHeight,
      requestedWidthPx,
      capped,
      effectiveDpi,
      warning
    }
  };
}
