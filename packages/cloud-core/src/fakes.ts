import { createId } from "@acs/project-schema";
import { ProjectSchema } from "@acs/project-schema";
import type { z } from "zod";
import {
  CloudAssetRecordSchema,
  CloudProjectRecordSchema,
  CloudProjectSummarySchema,
  CompleteUploadRequestSchema,
  UploadUrlRequestSchema
} from "@acs/cloud-schema";
import type {
  CloudAssetRecord,
  CloudProjectRecord,
  CloudProjectSummary,
  UploadUrlRequest,
  UploadUrlResponse
} from "@acs/cloud-schema";
import type { Project } from "@acs/project-schema";
import { ProviderError } from "./errors";
import type { AuthenticatedUser, AuthProvider, CreateProjectRecordInput, ObjectStorageProvider, ProjectStore } from "./ports";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ProviderError("VALIDATION_FAILED", `${label}校验失败`, {
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    });
  }
  return parsed.data;
}

export function toProjectSummary(record: CloudProjectRecord): CloudProjectSummary {
  return parseOrThrow(CloudProjectSummarySchema, {
    id: record.id,
    ownerId: record.ownerId,
    name: record.name,
    mode: record.mode,
    templateId: record.templateId,
    templateVersion: record.templateVersion,
    schemaVersion: record.schemaVersion,
    layerCount: record.design.layers.length,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  }, "项目摘要");
}

export interface MemoryProjectStoreOptions {
  now?: () => string;
  seed?: CloudProjectRecord[];
}

export interface MemoryProjectStore extends ProjectStore {
  __records(): CloudProjectRecord[];
}

export function createMemoryProjectStore(
  options: MemoryProjectStoreOptions = {}
): MemoryProjectStore {
  const now = options.now ?? (() => new Date().toISOString());
  const records = new Map<string, CloudProjectRecord>();
  for (const seed of options.seed ?? []) {
    const parsed = parseOrThrow(CloudProjectRecordSchema, seed, "项目记录");
    records.set(parsed.id, clone(parsed));
  }

  const requireOwned = (ownerId: string, projectId: string): CloudProjectRecord => {
    const record = records.get(projectId);
    if (!record || record.ownerId !== ownerId || record.deletedAt !== null) {
      throw new ProviderError("NOT_FOUND", "项目不存在");
    }
    return record;
  };

  const buildRecord = (
    ownerId: string,
    projectId: string,
    design: Project,
    timestamp: string
  ): CloudProjectRecord => {
    const owned: Project = { ...design, id: projectId, ownerId };
    return parseOrThrow(
      CloudProjectRecordSchema,
      {
        id: projectId,
        ownerId,
        name: owned.name,
        mode: owned.mode,
        templateId: owned.templateId,
        templateVersion: owned.templateVersion,
        schemaVersion: owned.schemaVersion,
        layerCount: owned.layers.length,
        createdAt: owned.createdAt,
        updatedAt: timestamp,
        design: owned,
        deletedAt: null
      },
      "项目记录"
    );
  };

  return {
    id: "memory-project-store",
    mode: "mock",

    async list(ownerId) {
      return [...records.values()]
        .filter((record) => record.ownerId === ownerId && record.deletedAt === null)
        .sort((a, b) => {
          if (a.updatedAt === b.updatedAt) return a.id.localeCompare(b.id);
          return b.updatedAt.localeCompare(a.updatedAt);
        })
        .map((record) => toProjectSummary(clone(record)));
    },

    async get(ownerId, projectId) {
      return clone(requireOwned(ownerId, projectId));
    },

    async create(ownerId, input: CreateProjectRecordInput) {
      const design = parseOrThrow(ProjectSchema, input.design, "项目设计");
      if (design.ownerId !== null && design.ownerId !== ownerId) {
        throw new ProviderError("FORBIDDEN", "不能以其他用户身份创建项目");
      }
      const projectId = createId("prj");
      const timestamp = now();
      const record = buildRecord(
        ownerId,
        projectId,
        { ...design, name: input.name, templateId: input.templateId, templateVersion: input.templateVersion },
        timestamp
      );
      records.set(projectId, record);
      return clone(record);
    },

    async save(ownerId, record, expectedUpdatedAt) {
      const existing = requireOwned(ownerId, record.id);
      if (expectedUpdatedAt && existing.updatedAt !== expectedUpdatedAt) {
        throw new ProviderError("CONFLICT", "项目已被其他会话修改，请重新加载后再保存");
      }
      const updated = buildRecord(ownerId, record.id, record.design, now());
      records.set(record.id, updated);
      return clone(updated);
    },

    async remove(ownerId, projectId) {
      requireOwned(ownerId, projectId);
      records.delete(projectId);
    },

    async duplicate(ownerId, projectId) {
      const source = requireOwned(ownerId, projectId);
      const timestamp = now();
      const projectIdNew = createId("prj");
      const design: Project = {
        ...clone(source.design),
        id: projectIdNew,
        ownerId,
        name: `${source.name} 副本`,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const record = buildRecord(ownerId, projectIdNew, design, timestamp);
      records.set(projectIdNew, record);
      return clone(record);
    },

    __records() {
      return [...records.values()].map((record) => clone(record));
    }
  };
}

export interface FakeObjectStorageOptions {
  now?: () => string;
  baseUrl?: string;
  uploadTtlSeconds?: number;
}

export interface FakeObjectStorage extends ObjectStorageProvider {
  __assets(): CloudAssetRecord[];
  __pending(): string[];
}

function sanitizeFilename(filename: string): string {
  const cleaned = filename.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 120) : "file";
}

export function createFakeObjectStorage(
  options: FakeObjectStorageOptions = {}
): FakeObjectStorage {
  const now = options.now ?? (() => new Date().toISOString());
  const baseUrl = options.baseUrl ?? "https://fake-storage.invalid";
  const ttl = options.uploadTtlSeconds ?? 900;
  const pending = new Map<string, { ownerId: string; request: UploadUrlRequest; storageKey: string }>();
  const assets = new Map<string, CloudAssetRecord>();

  return {
    id: "fake-object-storage",
    mode: "mock",

    async createUploadUrl(ownerId, request) {
      const parsed = parseOrThrow(UploadUrlRequestSchema, request, "上传请求");
      const assetId = createId("as");
      const storageKey = `uploads/${ownerId}/${assetId}/${sanitizeFilename(parsed.filename)}`;
      pending.set(assetId, { ownerId, request: parsed, storageKey });
      const expiresAt = new Date(Date.parse(now()) + ttl * 1000).toISOString();
      const response: UploadUrlResponse = {
        assetId,
        uploadUrl: `${baseUrl}/${storageKey}?signature=fake-${assetId}`,
        method: "PUT",
        headers: { "content-type": parsed.mimeType },
        expiresAt
      };
      return response;
    },

    async completeUpload(ownerId, request) {
      const parsed = parseOrThrow(CompleteUploadRequestSchema, request, "上传完成请求");
      const existing = assets.get(parsed.assetId);
      if (existing) {
        if (existing.ownerId !== ownerId) throw new ProviderError("NOT_FOUND", "资源不存在");
        return clone(existing);
      }
      const upload = pending.get(parsed.assetId);
      if (!upload || upload.ownerId !== ownerId) {
        throw new ProviderError("NOT_FOUND", "上传记录不存在或已过期，请重新上传");
      }
      pending.delete(parsed.assetId);
      const record = parseOrThrow(CloudAssetRecordSchema, {
        id: parsed.assetId,
        ownerId,
        projectId: null,
        kind: upload.request.kind,
        storageKey: upload.storageKey,
        mimeType: upload.request.mimeType,
        byteSize: upload.request.byteSize,
        width: parsed.width ?? null,
        height: parsed.height ?? null,
        createdAt: now()
      }, "资源记录");
      assets.set(record.id, record);
      return clone(record);
    },

    async remove(ownerId, assetId) {
      const record = assets.get(assetId);
      if (!record || record.ownerId !== ownerId) {
        throw new ProviderError("NOT_FOUND", "资源不存在");
      }
      assets.delete(assetId);
    },

    __assets() {
      return [...assets.values()].map((record) => clone(record));
    },

    __pending() {
      return [...pending.keys()];
    }
  };
}

export interface FakeAuthOptions {
  tokens?: Record<string, AuthenticatedUser>;
}

export function createFakeAuthProvider(options: FakeAuthOptions = {}): AuthProvider {
  const tokens = new Map<string, AuthenticatedUser>(
    Object.entries(
      options.tokens ?? {
        "test-token": { id: "user_test", email: null, displayName: "测试用户" }
      }
    )
  );

  return {
    id: "fake-auth",
    mode: "mock",

    async getUserFromToken(token) {
      const trimmed = token.trim();
      if (trimmed.length === 0) throw new ProviderError("UNAUTHENTICATED", "缺少登录凭证");
      const user = tokens.get(trimmed);
      if (!user) throw new ProviderError("UNAUTHENTICATED", "登录状态无效或已过期");
      return clone(user);
    }
  };
}
