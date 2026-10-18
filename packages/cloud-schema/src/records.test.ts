import { describe, expect, it } from "vitest";
import { ProjectSchema, createProject } from "@acs/project-schema";
import {
  CloudProjectRecordSchema,
  CloudProjectSummarySchema,
  CompleteUploadRequestSchema,
  UploadUrlRequestSchema,
  UploadUrlResponseSchema
} from "./records";

function sampleProject() {
  const project = createProject({
    name: "测试项目",
    templateId: "mug-standard",
    templateVersion: 1,
    canvas: { width: 1600, height: 680, backgroundColor: "#ffffff", dpi: 300, unit: "px" },
    ownerId: "user_1"
  });
  return ProjectSchema.parse(project);
}

function sampleRecord() {
  const design = sampleProject();
  return {
    id: design.id,
    ownerId: design.ownerId,
    name: design.name,
    mode: design.mode,
    templateId: design.templateId,
    templateVersion: design.templateVersion,
    schemaVersion: design.schemaVersion,
    layerCount: design.layers.length,
    createdAt: design.createdAt,
    updatedAt: design.updatedAt,
    design,
    deletedAt: null
  };
}

describe("cloud records", () => {
  it("accepts a consistent project record", () => {
    const parsed = CloudProjectRecordSchema.safeParse(sampleRecord());
    expect(parsed.success).toBe(true);
  });

  it("rejects a record whose design belongs to another project", () => {
    const record = sampleRecord();
    const parsed = CloudProjectRecordSchema.safeParse({
      ...record,
      design: { ...record.design, id: "prj_other" }
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a record whose owner differs from the design owner", () => {
    const record = sampleRecord();
    const parsed = CloudProjectRecordSchema.safeParse({
      ...record,
      design: { ...record.design, ownerId: "user_2" }
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a stale layer count", () => {
    const record = sampleRecord();
    const parsed = CloudProjectRecordSchema.safeParse({ ...record, layerCount: 99 });
    expect(parsed.success).toBe(false);
  });

  it("rejects a summary with a non-positive template version", () => {
    const record = sampleRecord();
    const parsed = CloudProjectSummarySchema.safeParse({ ...record, templateVersion: 0 });
    expect(parsed.success).toBe(false);
  });

  it("validates upload requests and refuses unknown asset kinds", () => {
    const request = { kind: "image", filename: "a.png", mimeType: "image/png", byteSize: 1024 };
    expect(UploadUrlRequestSchema.safeParse(request).success).toBe(true);
    expect(UploadUrlRequestSchema.safeParse({ ...request, kind: "video" }).success).toBe(false);
    expect(UploadUrlRequestSchema.safeParse({ ...request, byteSize: 0 }).success).toBe(false);
  });

  it("validates the presigned upload response", () => {
    const response = {
      assetId: "as_1",
      uploadUrl: "https://storage.example.com/put/as_1?sig=abc",
      method: "PUT",
      headers: { "content-type": "image/png" },
      expiresAt: "2026-10-18T12:00:00.000Z"
    };
    expect(UploadUrlResponseSchema.safeParse(response).success).toBe(true);
    expect(UploadUrlResponseSchema.safeParse({ ...response, uploadUrl: "not-a-url" }).success).toBe(
      false
    );
    expect(UploadUrlResponseSchema.safeParse({ ...response, method: "POST" }).success).toBe(false);
  });

  it("validates the complete-upload payload", () => {
    expect(CompleteUploadRequestSchema.safeParse({ assetId: "as_1" }).success).toBe(true);
    expect(
      CompleteUploadRequestSchema.safeParse({ assetId: "as_1", checksum: "sha256:abc", width: 8 }).success
    ).toBe(true);
    expect(CompleteUploadRequestSchema.safeParse({}).success).toBe(false);
  });
});
