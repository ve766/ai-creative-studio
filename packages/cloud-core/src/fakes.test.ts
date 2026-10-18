import { describe, expect, it } from "vitest";
import { createProject, ProjectSchema } from "@acs/project-schema";
import type { Project } from "@acs/project-schema";
import {
  createFakeAuthProvider,
  createFakeObjectStorage,
  createMemoryProjectStore,
  toProjectSummary
} from "./fakes";

function design(ownerId: string | null, name = "云项目"): Project {
  return ProjectSchema.parse(
    createProject({
      name,
      templateId: "mug-standard",
      templateVersion: 1,
      canvas: { width: 1600, height: 680, backgroundColor: "#ffffff", dpi: 300, unit: "px" },
      ownerId,
      layers: []
    })
  );
}

describe("createMemoryProjectStore", () => {
  it("creates a record owned by the caller and lists it", async () => {
    const store = createMemoryProjectStore({ now: () => "2026-10-18T00:00:00.000Z" });
    const created = await store.create("user_a", {
      name: "云项目",
      templateId: "mug-standard",
      templateVersion: 1,
      design: design(null)
    });
    expect(created.ownerId).toBe("user_a");
    expect(created.design.ownerId).toBe("user_a");
    expect(created.id).toBe(created.design.id);
    expect(created.layerCount).toBe(0);

    const list = await store.list("user_a");
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(created.id);
  });

  it("hides other users' projects behind NOT_FOUND", async () => {
    const store = createMemoryProjectStore();
    const created = await store.create("user_a", {
      name: "私密项目",
      templateId: "mug-standard",
      templateVersion: 1,
      design: design(null)
    });
    await expect(store.get("user_b", created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(store.remove("user_b", created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      store.save("user_b", { ...created, name: "篡改" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await store.list("user_b")).toEqual([]);
    await expect(store.get("user_a", created.id)).resolves.toMatchObject({ name: "私密项目" });
  });

  it("refuses to create a project on behalf of another user", async () => {
    const store = createMemoryProjectStore();
    await expect(
      store.create("user_a", {
        name: "冒名项目",
        templateId: "mug-standard",
        templateVersion: 1,
        design: design("user_b")
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a design that does not satisfy the project schema", async () => {
    const store = createMemoryProjectStore();
    await expect(
      store.create("user_a", {
        name: "坏项目",
        templateId: "mug-standard",
        templateVersion: 1,
        design: { ...design(null), schemaVersion: 0 }
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("enforces optimistic concurrency on save", async () => {
    let clock = 1_000;
    const store = createMemoryProjectStore({
      now: () => new Date(clock).toISOString()
    });
    const created = await store.create("user_a", {
      name: "并发项目",
      templateId: "mug-standard",
      templateVersion: 1,
      design: design(null)
    });
    clock += 1_000;
    const saved = await store.save("user_a", created, created.updatedAt);
    expect(saved.updatedAt).not.toBe(created.updatedAt);

    clock += 1_000;
    await expect(store.save("user_a", created, created.updatedAt)).rejects.toMatchObject({
      code: "CONFLICT"
    });
    await expect(store.save("user_a", saved)).resolves.toMatchObject({ id: created.id });
  });

  it("duplicates under a new id and a copy name", async () => {
    const store = createMemoryProjectStore();
    const created = await store.create("user_a", {
      name: "原始项目",
      templateId: "mug-standard",
      templateVersion: 1,
      design: design(null)
    });
    const copy = await store.duplicate("user_a", created.id);
    expect(copy.id).not.toBe(created.id);
    expect(copy.design.id).toBe(copy.id);
    expect(copy.name).toBe("原始项目 副本");
    expect(await store.list("user_a")).toHaveLength(2);
    expect(store.__records()).toHaveLength(2);
  });

  it("sorts by updatedAt descending", async () => {
    let clock = 1_000;
    const store = createMemoryProjectStore({ now: () => new Date(clock).toISOString() });
    const first = await store.create("user_a", {
      name: "第一",
      templateId: "mug-standard",
      templateVersion: 1,
      design: design(null)
    });
    clock += 5_000;
    const second = await store.create("user_a", {
      name: "第二",
      templateId: "mug-standard",
      templateVersion: 1,
      design: design(null)
    });
    const list = await store.list("user_a");
    expect(list.map((item) => item.id)).toEqual([second.id, first.id]);
  });

  it("summarises a record without leaking the design payload", () => {
    const record = {
      id: "prj_1",
      ownerId: "user_a",
      name: "N",
      mode: "2d" as const,
      templateId: "mug-standard",
      templateVersion: 1,
      schemaVersion: 1,
      layerCount: 0,
      createdAt: "2026-10-18T00:00:00.000Z",
      updatedAt: "2026-10-18T00:00:00.000Z",
      design: design("user_a"),
      deletedAt: null
    };
    const summary = toProjectSummary(record);
    expect(Object.keys(summary)).not.toContain("design");
    expect(summary.layerCount).toBe(0);
  });
});

describe("createFakeObjectStorage", () => {
  it("issues a presigned upload and completes it exactly once", async () => {
    const storage = createFakeObjectStorage({
      now: () => "2026-10-18T00:00:00.000Z"
    });
    const upload = await storage.createUploadUrl("user_a", {
      kind: "image",
      filename: "图案 1.png",
      mimeType: "image/png",
      byteSize: 2048
    });
    expect(upload.assetId.startsWith("as_")).toBe(true);
    expect(upload.uploadUrl).toContain("uploads/user_a/");
    expect(upload.headers["content-type"]).toBe("image/png");
    expect(storage.__pending()).toEqual([upload.assetId]);

    const asset = await storage.completeUpload("user_a", {
      assetId: upload.assetId,
      width: 512,
      height: 512
    });
    expect(asset.byteSize).toBe(2048);
    expect(asset.width).toBe(512);
    expect(storage.__pending()).toEqual([]);

    const again = await storage.completeUpload("user_a", { assetId: upload.assetId });
    expect(again.id).toBe(asset.id);
    expect(storage.__assets()).toHaveLength(1);
  });

  it("refuses another user's upload", async () => {
    const storage = createFakeObjectStorage();
    const upload = await storage.createUploadUrl("user_a", {
      kind: "image",
      filename: "a.png",
      mimeType: "image/png",
      byteSize: 10
    });
    await expect(
      storage.completeUpload("user_b", { assetId: upload.assetId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deletes only its own assets", async () => {
    const storage = createFakeObjectStorage();
    const upload = await storage.createUploadUrl("user_a", {
      kind: "image",
      filename: "a.png",
      mimeType: "image/png",
      byteSize: 10
    });
    const asset = await storage.completeUpload("user_a", { assetId: upload.assetId });
    await expect(storage.remove("user_b", asset.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await storage.remove("user_a", asset.id);
    expect(storage.__assets()).toHaveLength(0);
  });

  it("rejects an invalid upload request", async () => {
    const storage = createFakeObjectStorage();
    await expect(
      storage.createUploadUrl("user_a", {
        kind: "image",
        filename: "a.png",
        mimeType: "image/png",
        byteSize: 0
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});

describe("createFakeAuthProvider", () => {
  it("resolves a known token", async () => {
    const auth = createFakeAuthProvider();
    await expect(auth.getUserFromToken("test-token")).resolves.toMatchObject({
      id: "user_test"
    });
  });

  it("rejects empty and unknown tokens", async () => {
    const auth = createFakeAuthProvider({ tokens: { a: { id: "u1", email: null, displayName: null } } });
    await expect(auth.getUserFromToken("")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(auth.getUserFromToken("b")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(auth.getUserFromToken("a")).resolves.toMatchObject({ id: "u1" });
  });
});
