export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const ACCEPTED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 12000;
export const MAX_IMAGE_PIXELS = 40_000_000;

export interface ImageFileMeta {
  name: string;
  type: string;
  size: number;
}

export type UploadValidation =
  | { ok: true }
  | { ok: false; code: UploadErrorCode; message: string };

export type UploadErrorCode =
  | "EMPTY_FILE"
  | "TOO_LARGE"
  | "UNSUPPORTED_TYPE"
  | "INVALID_EXTENSION";

export function validateImageFile(meta: ImageFileMeta): UploadValidation {
  if (meta.size <= 0) {
    return { ok: false, code: "EMPTY_FILE", message: "文件为空，请重新选择图片" };
  }
  if (meta.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      code: "TOO_LARGE",
      message: `图片超过 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB 限制`
    };
  }
  const typeAccepted = (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(meta.type);
  if (!typeAccepted) {
    return {
      ok: false,
      code: "UNSUPPORTED_TYPE",
      message: "仅支持 PNG、JPEG、WebP 格式"
    };
  }
  const lowerName = meta.name.toLowerCase();
  const extAccepted = ACCEPTED_IMAGE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  if (!extAccepted) {
    return {
      ok: false,
      code: "INVALID_EXTENSION",
      message: "文件扩展名与图片格式不匹配"
    };
  }
  return { ok: true };
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export function validateImageDimensions(dimensions: ImageDimensions): UploadValidation {
  if (dimensions.width <= 0 || dimensions.height <= 0) {
    return { ok: false, code: "EMPTY_FILE", message: "无法识别图片尺寸" };
  }
  if (dimensions.width > MAX_IMAGE_DIMENSION || dimensions.height > MAX_IMAGE_DIMENSION) {
    return {
      ok: false,
      code: "TOO_LARGE",
      message: `图片单边不得超过 ${MAX_IMAGE_DIMENSION}px`
    };
  }
  if (dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) {
    return { ok: false, code: "TOO_LARGE", message: "图片总像素过大" };
  }
  return { ok: true };
}

export function fitInside(
  source: ImageDimensions,
  box: ImageDimensions
): { width: number; height: number; scale: number } {
  const scale = Math.min(box.width / source.width, box.height / source.height);
  return { width: source.width * scale, height: source.height * scale, scale };
}
