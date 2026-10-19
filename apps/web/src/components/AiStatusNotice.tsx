import { AI_SERVICE_STATE_LABELS, AI_CAPABILITY_LABELS } from "@acs/ai-schema";
import { getAiRuntime } from "@/lib/ai/runtime";

const TONE: Record<string, string> = {
  "not-configured": "notice-info",
  simulated: "notice-warning",
  unverified: "notice-warning",
  verified: "notice-info",
  unavailable: "notice-danger"
};

export function AiStatusNotice() {
  const status = getAiRuntime().status();
  const tone = TONE[status.state] ?? "notice-info";
  const simulated = status.state === "simulated";

  return (
    <section className="card" aria-label="AI 服务状态" data-state={status.state}>
      <div className="card-body stack" style={{ gap: 10 }}>
        <div className="row-between wrap" style={{ gap: 8 }}>
          <h2 style={{ fontSize: 16 }}>AI 服务状态</h2>
          <span className="badge" data-state={status.state}>
            {AI_SERVICE_STATE_LABELS[status.state]}
          </span>
        </div>

        <div className="row wrap" style={{ gap: 14 }}>
          <span className="muted" style={{ fontSize: 12.5 }}>
            请求模式：{status.requestedMode}
          </span>
          <span className="muted" style={{ fontSize: 12.5 }}>
            Provider：{status.providerId ?? "无"}
          </span>
        </div>

        {simulated ? (
          <div className="notice notice-warning" style={{ margin: 0 }}>
            <strong style={{ fontSize: 13 }}>当前输出是模拟数据，不是真实 AI 生成结果。</strong>
            <div style={{ fontSize: 12.5, marginTop: 4 }}>
              模拟结果只用于开发与自动化测试，不具备印刷或商用价值，也不产生任何费用。
            </div>
          </div>
        ) : null}

        {status.problems.length > 0 ? (
          <div className={`notice ${tone}`} style={{ margin: 0 }}>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {status.problems.map((problem) => (
                <li key={problem} style={{ fontSize: 12.5 }}>
                  {problem}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {status.missing.length > 0 ? (
          <p className="faint" style={{ fontSize: 12 }}>
            缺少环境变量：{status.missing.join("、")}（仅显示变量名，不显示取值）
          </p>
        ) : null}

        <div className="stack" style={{ gap: 4 }}>
          <span className="muted" style={{ fontSize: 12.5 }}>
            可接入能力：{status.implementedCapabilities.map((capability) => AI_CAPABILITY_LABELS[capability]).join("、")}
          </span>
          <span className="muted" style={{ fontSize: 12.5 }}>
            尚未接入：{status.plannedCapabilities.map((capability) => AI_CAPABILITY_LABELS[capability]).join("、")}
          </span>
        </div>

        <p className="faint" style={{ fontSize: 11.5 }}>
          {status.verification.verifiedAt
            ? `真实验证记录：${status.verification.evidence ?? "无"}（${new Date(status.verification.verifiedAt).toLocaleString("zh-CN")}）`
            : "尚无真实调用验证记录：仅存在环境变量或 Provider 类不代表服务可用。"}
        </p>
        <p className="faint" style={{ fontSize: 11.5 }}>
          检查时间 {new Date(status.checkedAt).toLocaleString("zh-CN")} · 接口
          <code style={{ marginLeft: 6 }}>/api/v1/ai/status</code>
        </p>
      </div>
    </section>
  );
}
