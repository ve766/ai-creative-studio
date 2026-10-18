import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CloudStatusNotice } from "@/components/CloudStatusNotice";
import { ProjectList } from "@/components/ProjectList";

export default function ProjectsPage() {
  return (
    <AppShell>
      <div className="container page">
        <div className="page-head">
          <div>
            <h1>我的项目</h1>
            <p className="muted">
              当前版本使用浏览器本地存储保存项目，可导出 JSON 作为备份或迁移到其他设备。
            </p>
          </div>
          <Link href="/templates" className="btn btn-primary">
            新建项目
          </Link>
        </div>
        <div className="stack" style={{ gap: 14 }}>
          <CloudStatusNotice />
          <ProjectList showImport />
        </div>
      </div>
    </AppShell>
  );
}
