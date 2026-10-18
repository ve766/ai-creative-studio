import {
  ProjectSchema,
  SCHEMA_VERSION,
  createId,
  detectSchemaVersion,
  nowIso,
  toProjectSummary,
  tryMigrateProject
} from "@acs/project-schema";
import type { Project, ProjectSummary } from "@acs/project-schema";
import { STORAGE_KEYS } from "./app-config";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class StorageQuotaError extends Error {
  constructor(message = "本地存储空间不足，请删除部分项目后再保存") {
    super(message);
    this.name = "StorageQuotaError";
  }
}

export type ProjectLoadFailureReason = "MISSING" | "INVALID" | "FUTURE_VERSION";

export type ProjectLoadResult =
  | { ok: true; project: Project; migrated: boolean }
  | { ok: false; reason: ProjectLoadFailureReason; message: string };

export interface UnreadableProject {
  id: string;
  reason: ProjectLoadFailureReason;
  message: string;
}

export class ProjectRepository {
  private readonly storage: StorageLike;

  constructor(storage: StorageLike) {
    this.storage = storage;
  }

  private readMap(): Record<string, unknown> {
    const raw = this.storage.getItem(STORAGE_KEYS.projects);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }

  private readOrder(): string[] {
    const raw = this.storage.getItem(STORAGE_KEYS.projectOrder);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  }

  private writeMap(map: Record<string, unknown>, order: string[]): void {
    try {
      this.storage.setItem(STORAGE_KEYS.projects, JSON.stringify(map));
      this.storage.setItem(STORAGE_KEYS.projectOrder, JSON.stringify(order));
    } catch (error) {
      throw new StorageQuotaError(
        error instanceof Error && /quota|exceeded/i.test(error.message)
          ? "本地存储空间不足，请删除部分项目或导出后清理"
          : "保存失败，本地存储不可用"
      );
    }
  }

  private parseStored(value: unknown): ProjectLoadResult {
    const detected = detectSchemaVersion(value);
    if (detected !== null && detected > SCHEMA_VERSION) {
      return {
        ok: false,
        reason: "FUTURE_VERSION",
        message: `该项目由更新版本的应用创建（schemaVersion ${detected}，当前支持 ${SCHEMA_VERSION}），请升级应用后再打开`
      };
    }
    const result = tryMigrateProject(value);
    if (result.ok) {
      return {
        ok: true,
        project: result.project,
        migrated: detected !== null && detected < SCHEMA_VERSION
      };
    }
    if (result.error.code === "VERSION_TOO_NEW") {
      return { ok: false, reason: "FUTURE_VERSION", message: result.error.message };
    }
    return { ok: false, reason: "INVALID", message: result.error.message };
  }

  load(id: string): ProjectLoadResult {
    const map = this.readMap();
    if (!Object.prototype.hasOwnProperty.call(map, id)) {
      return { ok: false, reason: "MISSING", message: "本地存储中没有该项目" };
    }
    return this.parseStored(map[id]);
  }

  list(): ProjectSummary[] {
    const map = this.readMap();
    const summaries: ProjectSummary[] = [];
    for (const value of Object.values(map)) {
      const result = this.parseStored(value);
      if (result.ok) summaries.push(toProjectSummary(result.project));
    }
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  listUnreadable(): UnreadableProject[] {
    const map = this.readMap();
    const broken: UnreadableProject[] = [];
    for (const [id, value] of Object.entries(map)) {
      const result = this.parseStored(value);
      if (!result.ok) broken.push({ id, reason: result.reason, message: result.message });
    }
    return broken;
  }

  get(id: string): Project | null {
    const result = this.load(id);
    return result.ok ? result.project : null;
  }

  create(project: Project): Project {
    const validated = ProjectSchema.parse(project);
    const map = this.readMap();
    map[validated.id] = validated;
    const order = this.readOrder();
    this.writeMap(map, [validated.id, ...order.filter((item) => item !== validated.id)]);
    return validated;
  }

  save(project: Project): Project {
    const validated = ProjectSchema.parse(project);
    const map = this.readMap();
    map[validated.id] = validated;
    const order = this.readOrder();
    if (!order.includes(validated.id)) order.unshift(validated.id);
    this.writeMap(map, order);
    return validated;
  }

  remove(id: string): void {
    const map = this.readMap();
    delete map[id];
    this.writeMap(
      map,
      this.readOrder().filter((item) => item !== id)
    );
  }

  duplicate(id: string): Project | null {
    const source = this.get(id);
    if (!source) return null;
    const timestamp = nowIso();
    const clone = ProjectSchema.parse({
      ...source,
      id: createId("prj"),
      name: `${source.name} 副本`,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    return this.create(clone);
  }

  exportJson(id: string): string | null {
    const project = this.get(id);
    if (!project) return null;
    return JSON.stringify(project, null, 2);
  }

  importJson(text: string): { ok: true; project: Project } | { ok: false; message: string } {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { ok: false, message: "文件不是合法的 JSON" };
    }
    const result = this.parseStored(raw);
    if (!result.ok) {
      return { ok: false, message: result.message };
    }
    const timestamp = nowIso();
    const project = { ...result.project, id: createId("prj"), updatedAt: timestamp };
    return { ok: true, project: this.create(project) };
  }

  usedBytes(): number {
    const map = this.storage.getItem(STORAGE_KEYS.projects) ?? "";
    return new TextEncoder().encode(map).length;
  }
}

export function createMemoryStorage(initial: Record<string, string> = {}): StorageLike {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    }
  };
}

let browserRepository: ProjectRepository | null = null;

export function getProjectRepository(): ProjectRepository {
  if (!browserRepository) {
    if (typeof window === "undefined") {
      browserRepository = new ProjectRepository(createMemoryStorage());
    } else {
      browserRepository = new ProjectRepository(window.localStorage);
    }
  }
  return browserRepository;
}
