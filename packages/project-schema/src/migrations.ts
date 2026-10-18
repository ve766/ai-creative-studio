import { z } from "zod";
import type { Project } from "./project";
import { ProjectSchema, SCHEMA_VERSION } from "./project";

export class ProjectMigrationError extends Error {
  readonly code: string;

  constructor(message: string, code = "MIGRATION_ERROR") {
    super(message);
    this.name = "ProjectMigrationError";
    this.code = code;
  }
}

export type MigrationStep = (raw: Record<string, unknown>) => Record<string, unknown>;

const VersionProbe = z.object({
  schemaVersion: z.number().int().positive()
});

export const MIGRATIONS: Record<number, MigrationStep> = {};

export function detectSchemaVersion(raw: unknown): number | null {
  const probe = VersionProbe.safeParse(raw);
  return probe.success ? probe.data.schemaVersion : null;
}

export function applyMigrationChain(
  raw: Record<string, unknown>,
  fromVersion: number,
  toVersion: number,
  registry: Record<number, MigrationStep> = MIGRATIONS
): Record<string, unknown> {
  let version = fromVersion;
  let current = raw;
  while (version < toVersion) {
    const step = registry[version];
    if (!step) {
      throw new ProjectMigrationError(
        `缺少从版本 ${version} 升级到 ${version + 1} 的迁移步骤`,
        "MISSING_MIGRATION"
      );
    }
    current = step(current);
    version += 1;
  }
  return current;
}

export function migrateProject(raw: unknown): Project {
  const detected = detectSchemaVersion(raw);
  if (detected === null) {
    throw new ProjectMigrationError("项目数据缺少合法的 schemaVersion 字段", "MISSING_VERSION");
  }
  if (detected > SCHEMA_VERSION) {
    throw new ProjectMigrationError(
      `项目 schemaVersion ${detected} 高于当前支持的版本 ${SCHEMA_VERSION}，请升级应用后再打开`,
      "VERSION_TOO_NEW"
    );
  }

  const current = applyMigrationChain(raw as Record<string, unknown>, detected, SCHEMA_VERSION);

  const parsed = ProjectSchema.safeParse(current);
  if (!parsed.success) {
    throw new ProjectMigrationError(
      `项目数据校验失败：${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
      "VALIDATION_FAILED"
    );
  }
  return parsed.data;
}

export type MigrateResult =
  | { ok: true; project: Project }
  | { ok: false; error: ProjectMigrationError };

export function tryMigrateProject(raw: unknown): MigrateResult {
  try {
    return { ok: true, project: migrateProject(raw) };
  } catch (error) {
    if (error instanceof ProjectMigrationError) {
      return { ok: false, error };
    }
    return {
      ok: false,
      error: new ProjectMigrationError(
        error instanceof Error ? error.message : "未知的迁移错误"
      )
    };
  }
}
