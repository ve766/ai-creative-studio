export interface PreparedImage {
  dataUrl: string;
  width: number;
  height: number;
  mimeType: string;
  downscaled: boolean;
  originalWidth: number;
  originalHeight: number;
}

export class ImageProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageProcessingError";
  }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new ImageProcessingError("读取图片失败"));
    };
    reader.onerror = () => reject(new ImageProcessingError("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new ImageProcessingError("图片解码失败，可能已损坏"));
    image.src = src;
  });
}

export async function prepareImageFile(file: File, maxDimension: number): Promise<PreparedImage> {
  const dataUrl = await readFileAsDataUrl(file);
  const element = await loadImageElement(dataUrl);
  const originalWidth = element.naturalWidth;
  const originalHeight = element.naturalHeight;

  if (originalWidth <= maxDimension && originalHeight <= maxDimension) {
    return {
      dataUrl,
      width: originalWidth,
      height: originalHeight,
      mimeType: file.type,
      downscaled: false,
      originalWidth,
      originalHeight
    };
  }

  const scale = Math.min(maxDimension / originalWidth, maxDimension / originalHeight);
  const width = Math.max(1, Math.round(originalWidth * scale));
  const height = Math.max(1, Math.round(originalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new ImageProcessingError("当前浏览器不支持图片缩放");
  context.drawImage(element, 0, 0, width, height);

  const preserveAlpha = file.type === "image/png" || file.type === "image/webp";
  const encoded = preserveAlpha
    ? canvas.toDataURL("image/png")
    : canvas.toDataURL("image/jpeg", 0.92);

  return {
    dataUrl: encoded,
    width,
    height,
    mimeType: encoded.slice(5, encoded.indexOf(";")) || "image/png",
    downscaled: true,
    originalWidth,
    originalHeight
  };
}
