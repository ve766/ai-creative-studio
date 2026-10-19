import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ProjectList } from "@/components/ProjectList";
import { TemplateGallery } from "@/components/TemplateGallery";
import { APP_VERSION } from "@/lib/app-config";

const FEATURES = [
  {
    title: "智能模板贴图",
    description: "在马克杯、T 恤、帆布袋等标准产品模板上拖动、缩放、旋转和裁切图案。",
    href: "/templates",
    status: "已实现"
  },
  {
    title: "AI 图案生成",
    description: "统一 AI Provider 接口，支持文生图、背景移除与图案处理。密钥未配置时明确提示。",
    href: "/ai",
    status: "未配置"
  },
  {
    title: "真实场景贴图",
    description: "上传产品实拍照片，识别可贴图区域并按透视与光照融合图案。",
    href: "/scene",
    status: "未配置"
  },
  {
    title: "3D 产品设计",
    description: "在 Three.js 3D 模型上编辑贴图，多角度预览并导出产品效果图。",
    href: "/studio-3d",
    status: "未配置"
  }
];

export default function HomePage() {
  return (
    <AppShell>
      <div className="container">
        <section className="hero">
          <span className="eyebrow">AI Creative Studio · 文创设计工作台</span>
          <h1>
            把设计准确放到
            <br />
            真实文创产品上
          </h1>
          <p className="hero-lead">
            上传图片或添加文字，在标准产品模板上完成排版、预览与导出。项目数据以统一 JSON
            结构保存，可随时重新打开继续编辑。
          </p>
          <div className="row" style={{ justifyContent: "center", marginTop: 18 }}>
            <span className="badge badge-info">v{APP_VERSION} · 云端优先架构</span>
          </div>
          <div className="hero-actions">
            <Link href="/templates" className="btn btn-primary">
              选择产品模板开始设计
            </Link>
            <Link href="/projects" className="btn">
              我的项目
            </Link>
          </div>
        </section>

        <div className="notice notice-warning" style={{ marginBottom: 28 }}>
          当前版本已完成 2D 模板贴图编辑器、项目保存/恢复与 PNG 导出。AI 图案、场景贴图、3D
          设计与订阅支付尚未接入真实服务，相关页面会明确显示「未配置」，不会用示例图冒充 AI 结果。
        </div>

        <section style={{ marginBottom: 40 }}>
          <div className="page-head">
            <div>
              <h2>核心能力</h2>
              <p className="muted">每一项都标注了真实状态，不夸大未完成的功能。</p>
            </div>
          </div>
          <div className="feature-grid">
            {FEATURES.map((feature) => (
              <Link key={feature.href} href={feature.href} className="card">
                <div className="card-body stack" style={{ gap: 6 }}>
                  <div className="row-between">
                    <h3 style={{ fontSize: 15 }}>{feature.title}</h3>
                    <span
                      className={`badge ${feature.status === "已实现" ? "badge-success" : "badge-warning"}`}
                    >
                      {feature.status}
                    </span>
                  </div>
                  <p className="muted" style={{ fontSize: 13 }}>
                    {feature.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 40 }}>
          <div className="page-head">
            <div>
              <h2>产品模板</h2>
              <p className="muted">首批 10 个示例模板，规格未经印刷厂验证。</p>
            </div>
            <Link href="/templates" className="btn btn-sm">
              查看全部
            </Link>
          </div>
          <TemplateGallery showFilter={false} limit={5} />
        </section>

        <section style={{ marginBottom: 40 }}>
          <div className="page-head">
            <div>
              <h2>最近项目</h2>
              <p className="muted">项目保存在当前浏览器本地存储，可导出 JSON 备份。</p>
            </div>
            <Link href="/projects" className="btn btn-sm">
              管理项目
            </Link>
          </div>
          <ProjectList limit={3} />
        </section>
      </div>
    </AppShell>
  );
}
