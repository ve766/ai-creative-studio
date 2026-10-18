import { describe, expect, it } from "vitest";
import { createImageLayer, createProject, createTextLayer } from "./factory";
import { ProjectSchema, SCHEMA_VERSION, toProjectSummary } from "./project";
import { applyMigrationChain, detectSchemaVersion, migrateProject, tryMigrateProject } from "./migrations";

const canvas = {
  width: 1200,
  height: 900,
  backgroundColor: "#ffffff",
  dpi: 300,
  unit: "px" as const
};

describe("project factory", () => {
  it("creates a project that passes schema validation", () => {
    const project = createProject({
      name: "测试项目",
      templateId: "mug-standard",
      templateVersion: 1,
      canvas
    });
    expect(ProjectSchema.safeParse(project).success).toBe(true);
    expect(project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(project.layers).toHaveLength(0);
  });

  it("creates image and text layers with sensible defaults", () => {
    const image = createImageLayer({
      src: "data:image/png;base64,AAAA",
      x: 10,
      y: 20,
      width: 100,
      height: 80,
      naturalWidth: 400,
      naturalHeight: 320
    });
    expect(image.type).toBe("image");
    expect(image.opacity).toBe(1);
    expect(image.visible).toBe(true);
    expect(image.locked).toBe(false);

    const text = createTextLayer({ text: "你好", x: 0, y: 0 });
    expect(text.type).toBe("text");
    expect(text.fontSize).toBeGreaterThan(0);
    expect(text.fill).toMatch(/^#/);
  });

  it("summarizes a project for list views", () => {
    const project = createProject({
      name: "摘要",
      templateId: "mug-standard",
      templateVersion: 2,
      canvas,
      layers: [createTextLayer({ text: "a", x: 0, y: 0 })]
    });
    const summary = toProjectSummary(project);
    expect(summary.layerCount).toBe(1);
    expect(summary.templateVersion).toBe(2);
  });
});

describe("project schema validation", () => {
  it("rejects a project with an invalid opacity", () => {
    const project = createProject({
      name: "bad",
      templateId: "mug-standard",
      templateVersion: 1,
      canvas
    });
    const broken = {
      ...project,
      layers: [{ ...createTextLayer({ text: "x", x: 0, y: 0 }), opacity: 5 }]
    };
    expect(ProjectSchema.safeParse(broken).success).toBe(false);
  });
});

describe("project migration", () => {
  it("detects version numbers", () => {
    expect(detectSchemaVersion({ schemaVersion: 3 })).toBe(3);
    expect(detectSchemaVersion({ nope: true })).toBeNull();
  });

  it("migrates a valid current-version payload", () => {
    const project = createProject({
      name: "迁移",
      templateId: "mug-standard",
      templateVersion: 1,
      canvas
    });
    const roundTripped = migrateProject(JSON.parse(JSON.stringify(project)));
    expect(roundTripped.id).toBe(project.id);
  });

  it("fails loudly when schemaVersion is missing", () => {
    const result = tryMigrateProject({ name: "no version" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_VERSION");
  });

  it("refuses to open projects newer than the supported schema", () => {
    const result = tryMigrateProject({ schemaVersion: SCHEMA_VERSION + 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VERSION_TOO_NEW");
  });
});

describe("migration chain", () => {
  it("applies registered steps in order", () => {
    const registry = {
      1: (raw: Record<string, unknown>) => ({ ...raw, step1: true }),
      2: (raw: Record<string, unknown>) => ({ ...raw, step2: true })
    };
    const result = applyMigrationChain({ schemaVersion: 1 }, 1, 3, registry);
    expect(result).toEqual({ schemaVersion: 1, step1: true, step2: true });
  });

  it("is a no-op when source and target versions match", () => {
    const payload = { schemaVersion: 3, keep: "me" };
    expect(applyMigrationChain(payload, 3, 3, {})).toEqual(payload);
  });

  it("throws MISSING_MIGRATION when a step is absent", () => {
    let code = "";
    try {
      applyMigrationChain({ schemaVersion: 1 }, 1, 3, { 1: (raw) => raw });
    } catch (error) {
      code = error instanceof Error && "code" in error ? String((error as { code: string }).code) : "";
    }
    expect(code).toBe("MISSING_MIGRATION");
  });

  it("does not mutate the input payload", () => {
    const payload = { schemaVersion: 1, nested: { value: 1 } };
    applyMigrationChain(payload, 1, 2, { 1: (raw) => ({ ...raw, added: true }) });
    expect(payload).toEqual({ schemaVersion: 1, nested: { value: 1 } });
  });
});
