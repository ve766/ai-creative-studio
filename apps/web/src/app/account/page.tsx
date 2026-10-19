import Link from "next/link";
import { AiStatusNotice } from "@/components/AiStatusNotice";
import { AppShell } from "@/components/AppShell";
import { CloudStatusNotice } from "@/components/CloudStatusNotice";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  return (
    <AppShell>
      <div className="container page">
        <div className="page-head">
          <div>
            <h1>账号与数据</h1>
            <p className="muted">当前版本运行在「本地模式」，尚未接入托管认证与云数据库。</p>
          </div>
        </div>

        <div className="grid grid-cards">
          <CloudStatusNotice />
          <AiStatusNotice />

          <section className="card">
            <div className="card-body stack">
              <h2 style={{ fontSize: 16 }}>本地模式说明</h2>
              <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
                <li style={{ marginBottom: 6 }}>项目与图片保存在当前浏览器的本地存储中，不会上传到服务器。</li>
                <li style={{ marginBottom: 6 }}>清除浏览器数据或在其他设备打开时，项目不会自动同步。</li>
                <li style={{ marginBottom: 6 }}>通过「导出项目 JSON」可以备份或迁移到其他设备。</li>
                <li>上传图片会被压缩到最长边 2500px 以适配本地存储限制。</li>
              </ul>
            </div>
          </section>

          <section className="card">
            <div className="card-body stack">
              <h2 style={{ fontSize: 16 }}>后续计划</h2>
              <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
                <li style={{ marginBottom: 6 }}>接入托管身份认证与 PostgreSQL，启用 Row Level Security</li>
                <li style={{ marginBottom: 6 }}>图片与模型改为对象存储直传，数据库只保存元数据与权限</li>
                <li style={{ marginBottom: 6 }}>服务端校验所有权限、额度与订阅状态</li>
                <li>提供备份、导出与资源删除策略</li>
              </ul>
              <Link href="/projects" className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
                管理我的项目
              </Link>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
