export const APP_VERSION = "0.1.0";
export const APP_NAME = "AI 文创设计工坊";

export const STORAGE_KEYS = {
  projects: "acs.projects.v1",
  projectOrder: "acs.project-order.v1",
  editorPrefs: "acs.editor-prefs.v1"
} as const;

export const LIMITS = {
  maxStoredImageDimension: 2500,
  maxProjectJsonBytes: 4_500_000,
  autosaveDebounceMs: 800
} as const;
