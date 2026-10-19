import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";

export interface FeaturePlanProps {
  title: string;
  summary: string;
  phase: string;
  statusText: string;
  requirements: string[];
  planned: string[];
  aside?: ReactNode;
}

export function FeaturePlan({
  title,
  summary,
  phase,
  statusText,
  requirements,
  planned,
  aside
}: FeaturePlanProps) {
  return (
    <AppShell>
      <div className="container page">
        <div className="page-head">
          <div>
            <h1>{title}</h1>
            <p className="muted" style={{ maxWidth: 720 }}>
              {summary}
            </p>
          </div>
          <span className="badge badge-warning">计划中 · {phase}</span>
        </div>

        <div className="notice notice-warning" style={{ marginBottom: 20 }}>
          {statusText}
        </div>

        <div className="grid grid-cards">
          {aside}
          <section className="card">
            <div className="card-body stack">
              <h2 style={{ fontSize: 16 }}>接入前必须满足</h2>
              <ul style={{ margin: 0, paddingLeft: 18 }} className="muted">
                {requirements.map((item) => (
                  <li key={item} style={{ marginBottom: 6 }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </section>
          <section className="card">
            <div className="card-body stack">
              <h2 style={{ fontSize: 16 }}>计划实现的能力</h2>
              <ul style={{ margin: 0, paddingLeft: 18 }} className="muted">
                {planned.map((item) => (
                  <li key={item} style={{ marginBottom: 6 }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        <p className="faint" style={{ marginTop: 24, fontSize: 12.5 }}>
          本页面为真实的产品路线说明，不代表功能已经可用。系统只会在明确标注「模拟」的前提下展示模拟结果，
          绝不会把模拟输出当作真实 AI 结果。
        </p>
      </div>
    </AppShell>
  );
}
