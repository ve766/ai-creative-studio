import {
  IMPLEMENTED_CAPABILITIES,
  type AiCapability,
  type AiRequest,
  type AiResultAsset,
  type AiUsage
} from "@acs/ai-schema";
import { ProviderError, realSleep, type Sleeper, type ProviderConfig } from "@acs/cloud-core";
import type { AiProvider, AiProviderOutcome, AiRunContext } from "./ports";

export const MOCK_MODEL_ID = "mock-placeholder-v1";

export type MockFailureCode = "UPSTREAM_ERROR" | "RATE_LIMITED" | "TIMEOUT" | "INTERNAL";

export interface MockAiProviderOptions {
  id?: string;
  capabilities?: readonly AiCapability[];
  latencyMs?: number;
  sleep?: Sleeper;
  failWith?: { code: MockFailureCode; message?: string; times?: number };
  blockedTerms?: readonly string[];
}

export interface MockAiProvider extends AiProvider {
  __calls(): number;
  __lastRequest(): AiRequest | null;
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function simulatedSvg(request: AiRequest, digest: string): string {
  const size = "size" in request ? request.size : { width: 512, height: 512 };
  const label = "模拟输出 / SIMULATED - 非真实 AI 生成";
  const prompt = "prompt" in request ? request.prompt.slice(0, 60) : request.capability;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 512 512">`,
    '<defs><pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">',
    '<path d="M32 0H0V32" fill="none" stroke="#d8dde6" stroke-width="1"/></pattern></defs>',
    '<rect width="512" height="512" fill="#f4f6fa"/>',
    '<rect width="512" height="512" fill="url(#grid)"/>',
    '<rect x="24" y="24" width="464" height="464" fill="none" stroke="#e0b23c" stroke-width="4" stroke-dasharray="12 8"/>',
    '<text x="256" y="236" text-anchor="middle" font-family="sans-serif" font-size="26" fill="#8a6d1f">模拟输出</text>',
    `<text x="256" y="272" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#8a6d1f">${label}</text>`,
    `<text x="256" y="312" text-anchor="middle" font-family="sans-serif" font-size="15" fill="#6b7280">${request.capability}</text>`,
    `<text x="256" y="340" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#9aa3af">digest ${digest}</text>`,
    `<text x="256" y="366" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#9aa3af">${prompt}</text>`,
    "</svg>"
  ].join("");
}

async function wait(ms: number, signal: AbortSignal, sleep: Sleeper): Promise<void> {
  if (signal.aborted) throw new ProviderError("CANCELED", "任务已取消");
  if (ms <= 0) return;
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      reject(new ProviderError("CANCELED", "任务已取消"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    await Promise.race([sleep(ms), aborted]);
  } catch (error) {
    if (signal.aborted) throw new ProviderError("CANCELED", "任务已取消");
    throw error;
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

export function createMockAiProvider(options: MockAiProviderOptions = {}): MockAiProvider {
  const id = options.id ?? "mock";
  const capabilities = options.capabilities ?? IMPLEMENTED_CAPABILITIES;
  const latencyMs = options.latencyMs ?? 0;
  const sleep = options.sleep ?? realSleep;
  const blockedTerms = options.blockedTerms ?? [];
  const failures = new Map<MockFailureCode, number>();
  if (options.failWith) failures.set(options.failWith.code, options.failWith.times ?? Number.POSITIVE_INFINITY);
  let calls = 0;
  let lastRequest: AiRequest | null = null;

  const report = (context: AiRunContext, stage: string, percent: number) => {
    context.onProgress?.({ stage, percent });
  };

  return {
    id,
    mode: "mock",
    capabilities,

    describeConfiguration(): ProviderConfig {
      return { mode: "mock", missing: [] };
    },

    async run(request: AiRequest, context: AiRunContext): Promise<AiProviderOutcome> {
      calls += 1;
      lastRequest = request;
      if (!capabilities.includes(request.capability)) {
        throw new ProviderError("NOT_SUPPORTED", `模拟 Provider 未声明能力 ${request.capability}`);
      }
      const haystack = JSON.stringify(request);
      const blocked = blockedTerms.find((term) => term.length > 0 && haystack.includes(term));
      if (blocked) {
        throw new ProviderError("CONTENT_REJECTED", "输入内容不符合内容安全策略");
      }
      for (const [code, remaining] of failures) {
        if (remaining > 0) {
          failures.set(code, remaining - 1);
          throw new ProviderError(code, options.failWith?.message ?? `模拟故障：${code}`);
        }
      }

      report(context, "mock-run", 0);
      await wait(latencyMs, context.signal, sleep);
      if (context.signal.aborted) throw new ProviderError("CANCELED", "任务已取消");

      const digest = fnv1a(`${id}:${JSON.stringify(request)}`);
      const svg = simulatedSvg(request, digest);
      report(context, "mock-render", 50);
      await wait(latencyMs, context.signal, sleep);
      report(context, "mock-done", 100);

      const size = "size" in request ? request.size : null;
      const reference = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      const asset: AiResultAsset = {
        kind: "inline-data-url",
        reference,
        mimeType: "image/svg+xml",
        width: size ? size.width : null,
        height: size ? size.height : null,
        byteSize: reference.length,
        checksum: `mock-fnv1a-${digest}`,
        simulated: true
      };
      const usage: AiUsage = {
        unit: "image",
        amount: 1,
        simulated: true,
        estimatedCost: {
          kind: "estimated",
          currency: "USD",
          minorUnits: 0,
          basis: "模拟 Provider：不产生费用，无供应商账单"
        },
        actualCost: null,
        refunded: false,
        refundReason: null
      };
      return { asset, model: MOCK_MODEL_ID, usage };
    },

    __calls() {
      return calls;
    },

    __lastRequest() {
      return lastRequest;
    }
  };
}
