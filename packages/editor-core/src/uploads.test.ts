import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  fitInside,
  validateImageDimensions,
  validateImageFile
} from "./uploads";

describe("upload validation", () => {
  it("accepts a valid png", () => {
    expect(validateImageFile({ name: "a.png", type: "image/png", size: 1024 }).ok).toBe(true);
  });

  it("rejects empty, oversized and unsupported files", () => {
    const empty = validateImageFile({ name: "a.png", type: "image/png", size: 0 });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe("EMPTY_FILE");

    const big = validateImageFile({ name: "a.png", type: "image/png", size: MAX_UPLOAD_BYTES + 1 });
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.code).toBe("TOO_LARGE");

    const gif = validateImageFile({ name: "a.gif", type: "image/gif", size: 10 });
    expect(gif.ok).toBe(false);
    if (!gif.ok) expect(gif.code).toBe("UNSUPPORTED_TYPE");
  });

  it("rejects mismatched extensions", () => {
    const result = validateImageFile({ name: "a.txt", type: "image/png", size: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_EXTENSION");
  });

  it("validates dimensions", () => {
    expect(validateImageDimensions({ width: 1000, height: 1000 }).ok).toBe(true);
    expect(validateImageDimensions({ width: 0, height: 10 }).ok).toBe(false);
    expect(validateImageDimensions({ width: 20000, height: 10 }).ok).toBe(false);
  });

  it("fits an image inside a box preserving aspect ratio", () => {
    const result = fitInside({ width: 400, height: 200 }, { width: 100, height: 100 });
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
  });
});
