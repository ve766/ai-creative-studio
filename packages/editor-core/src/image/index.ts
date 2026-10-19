export {
  DEFAULT_ALPHA_THRESHOLD,
  DEFAULT_DENOISE_STRENGTH,
  DEFAULT_SHARPEN_AMOUNT,
  DEFAULT_TARGET_DPI,
  MAX_SHARPEN_RADIUS,
  assertCropRectInside,
  clampCropRect,
  normalizeAlphaThreshold,
  normalizeCropRect,
  normalizeDenoise,
  normalizeOpacity,
  normalizeOutputSpec,
  normalizeSharpen,
  planResize
} from "./params";
export type {
  AlphaThresholdParams,
  CropRect as ImageCropRect,
  CropRectInput,
  DenoiseParams,
  NormalizedOutputSpec,
  OpacityParams,
  OutputSpec,
  ResizeMode,
  ResizePlan,
  ResizeRequest,
  SharpenInput,
  SharpenParams
} from "./params";

export {
  analyzeTransparentEdges,
  cleanAlphaFringe,
  trimTransparentEdges
} from "./edges";
export type {
  FringeCleanResult,
  TransparentEdgeInput,
  TransparentEdgeParams,
  TransparentEdgeReport,
  TrimResult
} from "./edges";

export { applyAdjustments, applyOpacity, denoise, sharpen } from "./adjust";
export type { AdjustmentsInput } from "./adjust";

export { buildOutputReport, buildSizeReport, describeAspect, inspectDimensions, inspectOutput, simplifyAspect } from "./inspect";
export type { ImageSize, InspectResult, OutputInfo } from "./inspect";

export { cropImage, cropImageClamped, resizeImage } from "./ops";
export type { CropResult, ResizeResult } from "./ops";
