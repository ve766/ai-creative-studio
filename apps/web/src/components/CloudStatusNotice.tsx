import { describeCloudStatus } from "@/lib/cloud/config";

const STATE_LABEL: Record<string, string> = {
  local: "浏览器本地保存",
  cloud: "云端保存（已连接）",
  mock: "开发模拟（仅测试）"
};

const PROVIDER_LABEL: Record<string, string> = {
  configured: "已配置",
  "not-configured": "未配置",
  mock: "模拟"
};

export function CloudStatusNotice() {
  const status = describeCloudStatus(process.env);
  const tone =
    status.storage === "cloud" ? "notice-info" : status.storage === "mock" ? "notice-warning" : "notice-info";

  return (
    <section className="card" aria-label="云端保存状态">
      <div className="card-body stack" style={{ gap: 10 }}>
        <div className="row-between wrap" style={{ gap: 8 }}>
          <h2 style={{ fontSize: 16 }}>存储与云端状态</h2>
          <span className="badge" data-state={status.storage}>
            {STATE_LABEL[status.storage] ?? status.storage}
          </span>
        </div>
        <div className="row wrap" style={{ gap: 14 }}>
          <span className="muted" style={{ fontSize: 12.5 }}>
            数据库：{PROVIDER_LABEL[status.database] ?? status.database}
          </span>
          <span className="muted" style={{ fontSize: 12.5 }}>
            对象存储：{PROVIDER_LABEL[status.objectStorage] ?? status.objectStorage}
          </span>
          <span className="muted" style={{ fontSize: 12.5 }}>
            AI：{PROVIDER_LABEL[status.ai] ?? status.ai}
          </span>
        </div>
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
        {status.storage === "local" ? (
          <p className="faint" style={{ fontSize: 12 }}>
            项目当前保存在本浏览器。配置云端后才会启用账号登录与多设备同步；在此之前不会显示任何「已上传云端」的成功状态。
          </p>
        ) : null}
        <p className="faint" style={{ fontSize: 11.5 }}>
          检查时间 {new Date(status.checkedAt).toLocaleString("zh-CN")} · 接口
          <code style={{ marginLeft: 6 }}>/api/v1/status</code>
        </p>
      </div>
    </section>
  );
}
