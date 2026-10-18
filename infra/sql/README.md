# infra/sql

PostgreSQL migrations for cloud project storage (Phase 4).

| 文件 | 内容 |
| --- | --- |
| `0001_init.sql` | 基线表结构：用户、订阅/额度/支付（形状）、模板、项目与版本、资源、三类任务、审计日志 |
| `0002_rls.sql` | 全部业务表启用 Row Level Security 与按 `owner_id = auth.uid()` 的策略 |

## 状态（真实）

- 迁移文件已编写，**尚未在真实数据库上执行**：交付环境没有 Docker，也没有 `psql`。
- 因此当前版本不会宣称「云端保存可用」；`CLOUD_MODE` 未设置时应用仍使用浏览器本地存储。
- 应用层通过 `GET /api/v1/status` 暴露真实配置状态，不伪造成功。

## 如何验证（需要本机或托管 Postgres）

```bash
# 1) 任选其一：本地 Docker Postgres，或托管 Postgres 的独立测试库
docker compose -f infra/docker/docker-compose.yml up -d

# 2) 建表
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/sql/0001_init.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/sql/0002_rls.sql

# 3) 确认 RLS 已启用（应列出 11 张表且 rowsecurity = true）
psql "$DATABASE_URL" -c "select relname, relrowsecurity from pg_class where relname in ('users','projects','project_versions','assets','subscriptions','credit_ledger','payments','render_jobs','ai_jobs','export_jobs','audit_logs') order by relname;"

# 4) 越权检查：以普通用户身份查询他人项目应返回 0 行
psql "$DATABASE_URL" -c "begin; set local role authenticated; select set_config('request.jwt.claim.sub', '<other-user-uuid>', true); select count(*) from projects; rollback;"
```

`0002_rls.sql` 里的 `auth.uid()` 来自 Supabase。若使用自建/其他托管 Postgres，请按文件头说明替换为
`current_setting('app.user_id', true)::uuid`，并由 API 在事务开始处设置该变量。

## 约定

- 只向前迁移；回滚通过人工确认的 `down` 脚本，不在应用内自动执行。
- `design` 字段由 `@acs/project-schema` 校验后再写入；数据库只做 `jsonb_typeof = 'object'` 兜底。
- 项目模板版本在创建时固定，不随模板升级自动变化。
- 金额一律使用最小货币单位整数（`amount_minor`），不使用浮点。
