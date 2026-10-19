import type { AiCapability, AiProviderMode, AiTerminalStatus, AiUsage } from "@acs/ai-schema";
import type { ApiErrorCode } from "@acs/cloud-schema";

export interface AiUsageEntryInput {
  taskId: string;
  ownerId: string;
  projectId: string | null;
  providerId: string;
  capability: AiCapability;
  mode: AiProviderMode;
  status: AiTerminalStatus;
  attempts: number;
  usage: AiUsage;
  errorCode?: ApiErrorCode | null;
  at?: string;
}

export interface AiUsageEntry extends Required<Omit<AiUsageEntryInput, "errorCode" | "at">> {
  errorCode: ApiErrorCode | null;
  at: string;
}

export interface AiUsageSummary {
  tasks: number;
  succeeded: number;
  failed: number;
  canceled: number;
  timedOut: number;
  refunded: number;
  simulatedTasks: number;
  units: number;
  estimatedCostMinorUnits: number;
  actualCostMinorUnits: number;
  costsAreSimulatedOnly: boolean;
}

export interface AiUsageLedger {
  recordOnce(input: AiUsageEntryInput): { recorded: boolean; entry: AiUsageEntry };
  refund(taskId: string, reason: string): AiUsageEntry | null;
  has(taskId: string): boolean;
  get(taskId: string): AiUsageEntry | null;
  list(): readonly AiUsageEntry[];
  summarize(): AiUsageSummary;
  reset(): void;
}

export interface AiUsageLedgerOptions {
  limit?: number;
  now?: () => string;
}

export function createAiUsageLedger(options: AiUsageLedgerOptions = {}): AiUsageLedger {
  const limit = options.limit ?? 2_000;
  const now = options.now ?? (() => new Date().toISOString());
  const entries: AiUsageEntry[] = [];
  const index = new Map<string, AiUsageEntry>();

  return {
    recordOnce(input) {
      const existing = index.get(input.taskId);
      if (existing) return { recorded: false, entry: { ...existing } };
      const entry: AiUsageEntry = {
        taskId: input.taskId,
        ownerId: input.ownerId,
        projectId: input.projectId,
        providerId: input.providerId,
        capability: input.capability,
        mode: input.mode,
        status: input.status,
        attempts: input.attempts,
        usage: JSON.parse(JSON.stringify(input.usage)) as AiUsage,
        errorCode: input.errorCode ?? null,
        at: input.at ?? now()
      };
      entries.push(entry);
      index.set(entry.taskId, entry);
      if (entries.length > limit) {
        const removed = entries.shift();
        if (removed) index.delete(removed.taskId);
      }
      return { recorded: true, entry: { ...entry } };
    },

    refund(taskId, reason) {
      const entry = index.get(taskId);
      if (!entry) return null;
      entry.usage = { ...entry.usage, refunded: true, refundReason: reason };
      return { ...entry };
    },

    has(taskId) {
      return index.has(taskId);
    },

    get(taskId) {
      const entry = index.get(taskId);
      return entry ? { ...entry } : null;
    },

    list() {
      return entries.map((entry) => ({ ...entry }));
    },

    summarize() {
      return entries.reduce<AiUsageSummary>(
        (total, entry) => ({
          tasks: total.tasks + 1,
          succeeded: total.succeeded + (entry.status === "succeeded" ? 1 : 0),
          failed: total.failed + (entry.status === "failed" ? 1 : 0),
          canceled: total.canceled + (entry.status === "canceled" ? 1 : 0),
          timedOut: total.timedOut + (entry.status === "timed-out" ? 1 : 0),
          refunded: total.refunded + (entry.usage.refunded ? 1 : 0),
          simulatedTasks: total.simulatedTasks + (entry.usage.simulated ? 1 : 0),
          units: total.units + entry.usage.amount,
          estimatedCostMinorUnits:
            total.estimatedCostMinorUnits + (entry.usage.estimatedCost?.minorUnits ?? 0),
          actualCostMinorUnits: total.actualCostMinorUnits + (entry.usage.actualCost?.minorUnits ?? 0),
          costsAreSimulatedOnly: total.costsAreSimulatedOnly && entry.usage.simulated
        }),
        {
          tasks: 0,
          succeeded: 0,
          failed: 0,
          canceled: 0,
          timedOut: 0,
          refunded: 0,
          simulatedTasks: 0,
          units: 0,
          estimatedCostMinorUnits: 0,
          actualCostMinorUnits: 0,
          costsAreSimulatedOnly: true
        }
      );
    },

    reset() {
      entries.length = 0;
      index.clear();
    }
  };
}
