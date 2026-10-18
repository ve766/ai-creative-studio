import { describe, expect, it } from "vitest";
import { createTextLayer } from "@acs/project-schema";
import { createProjectFromTemplate, getTemplate } from "@acs/template-library";
import {
  ProjectRepository,
  StorageQuotaError,
  createMemoryStorage,
  type StorageLike
} from "./project-repo";

function makeRepo() {
  const storage = createMemoryStorage();
  return { storage, repo: new ProjectRepository(storage) };
}

function sampleProject(name = "测试项目") {
  const template = getTemplate("mug-standard");
  if (!template) throw new Error("template missing");
  return createProjectFromTemplate(template, name);
}

describe("project repository", () => {
  it("creates and reads a project", () => {
    const { repo } = makeRepo();
    const project = sampleProject();
    repo.create(project);
    const loaded = repo.get(project.id);
    expect(loaded?.name).toBe("测试项目");
    expect(loaded?.templateId).toBe("mug-standard");
  });

  it("returns null for unknown ids and corrupted payloads", () => {
    const storage = createMemoryStorage({ "acs.projects.v1": JSON.stringify({ broken: { a: 1 } }) });
    const repo = new ProjectRepository(storage);
    expect(repo.get("broken")).toBeNull();
    expect(repo.list()).toEqual([]);
  });

  it("persists layer changes on save", () => {
    const { repo } = makeRepo();
    const project = sampleProject();
    repo.create(project);
    repo.save({ ...project, layers: [createTextLayer({ text: "你好", x: 10, y: 20 })] });
    expect(repo.get(project.id)?.layers).toHaveLength(1);
  });

  it("lists projects sorted by update time", () => {
    const { repo } = makeRepo();
    const first = sampleProject("A");
    const second = sampleProject("B");
    repo.create({ ...first, updatedAt: "2026-01-01T00:00:00.000Z" });
    repo.create({ ...second, updatedAt: "2026-05-01T00:00:00.000Z" });
    expect(repo.list().map((item) => item.name)).toEqual(["B", "A"]);
  });

  it("duplicates and deletes projects", () => {
    const { repo } = makeRepo();
    const project = sampleProject();
    repo.create(project);
    const clone = repo.duplicate(project.id);
    expect(clone?.id).not.toBe(project.id);
    expect(repo.list()).toHaveLength(2);
    repo.remove(project.id);
    expect(repo.get(project.id)).toBeNull();
    expect(repo.list()).toHaveLength(1);
  });

  it("exports and re-imports project JSON with a fresh id", () => {
    const { repo } = makeRepo();
    const project = sampleProject();
    repo.create(project);
    const json = repo.exportJson(project.id);
    expect(json).toBeTruthy();
    const result = repo.importJson(json as string);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.id).not.toBe(project.id);
      expect(repo.get(result.project.id)?.name).toBe(project.name);
    }
  });

  it("rejects invalid import payloads", () => {
    const { repo } = makeRepo();
    expect(repo.importJson("not json").ok).toBe(false);
    expect(repo.importJson(JSON.stringify({ hello: "world" })).ok).toBe(false);
  });

  it("wraps storage failures as a quota error", () => {
    const failing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => undefined
    };
    const repo = new ProjectRepository(failing);
    expect(() => repo.create(sampleProject())).toThrow(StorageQuotaError);
  });
});

describe("project repository migration awareness", () => {
  function storageWith(payload: unknown, key = "prj_legacy") {
    return createMemoryStorage({
      "acs.projects.v1": JSON.stringify({ [key]: payload }),
      "acs.project-order.v1": JSON.stringify([key])
    });
  }

  it("reports MISSING for unknown ids instead of pretending the data is broken", () => {
    const { repo } = makeRepo();
    const result = repo.load("nope");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("MISSING");
  });

  it("loads a current-version project without reporting a migration", () => {
    const { repo } = makeRepo();
    const project = sampleProject();
    repo.create(project);
    const result = repo.load(project.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.migrated).toBe(false);
      expect(result.project.id).toBe(project.id);
    }
  });

  it("refuses a future schemaVersion with a clear reason and keeps the raw data intact", () => {
    const project = sampleProject();
    const future = { ...project, schemaVersion: 99 };
    const storage = storageWith(future);
    const repo = new ProjectRepository(storage);

    const result = repo.load("prj_legacy");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("FUTURE_VERSION");

    expect(repo.get("prj_legacy")).toBeNull();
    expect(repo.list()).toEqual([]);

    const raw = JSON.parse(storage.getItem("acs.projects.v1") ?? "{}");
    expect(raw.prj_legacy.schemaVersion).toBe(99);
    expect(raw.prj_legacy.layers).toEqual(project.layers);
  });

  it("reports INVALID for payloads without a schemaVersion", () => {
    const repo = new ProjectRepository(storageWith({ name: "没有版本号" }));
    const result = repo.load("prj_legacy");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("INVALID");
  });

  it("lists unreadable records so the UI can warn instead of silently hiding them", () => {
    const project = sampleProject();
    const storage = createMemoryStorage({
      "acs.projects.v1": JSON.stringify({
        good: project,
        future: { ...project, id: "future", schemaVersion: 42 },
        broken: { name: "x" }
      })
    });
    const repo = new ProjectRepository(storage);
    expect(repo.list().map((item) => item.name)).toEqual([project.name]);
    const unreadable = repo.listUnreadable();
    expect(unreadable.map((item) => item.id).sort()).toEqual(["broken", "future"]);
    expect(unreadable.find((item) => item.id === "future")?.reason).toBe("FUTURE_VERSION");
    expect(unreadable.find((item) => item.id === "broken")?.reason).toBe("INVALID");
  });

  it("explains a future-version import instead of leaking raw schema errors", () => {
    const { repo } = makeRepo();
    const project = sampleProject();
    const result = repo.importJson(JSON.stringify({ ...project, schemaVersion: 7 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("schemaVersion 7");
      expect(result.message).toContain("请升级应用");
    }
  });

  it("explains a payload that is not a project file at all", () => {
    const { repo } = makeRepo();
    const result = repo.importJson(JSON.stringify({ hello: "world" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("schemaVersion");
  });
});
