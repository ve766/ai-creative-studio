# ADR 0002：项目 JSON Schema 版本化与迁移

- 状态：已采纳
- 日期：2026-10-18

## 背景

项目数据需要长期可打开。若结构演进后旧项目无法读取或静默损坏，用户数据就会丢失。

## 决策

1. 项目根对象包含 `schemaVersion`（数值），当前为 `1`
2. `migrateProject(raw)` 流程：
   - 读取 `schemaVersion`；缺失 → `MISSING_VERSION`
   - 高于当前支持版本 → `VERSION_TOO_NEW`（明确拒绝，提示升级应用）
   - 低于当前版本 → 依次执行 `MIGRATIONS[v]`；缺少步骤 → `MISSING_MIGRATION`
   - 通过 `ProjectSchema` 最终校验；失败 → `VALIDATION_FAILED`
3. 提供 `tryMigrateProject` 返回判别联合结果，避免调用方处理异常
4. 模板同样版本化，且项目**锁定**创建时的 `templateVersion`

## 理由

- 显式失败优于静默损坏：任何无法安全升级的情况都必须报错而非丢弃字段
- 迁移链条可测试：已有测试覆盖缺失版本、版本过新、正常往返三个分支
- 模板版本锁定保证模板更新不会改变已有设计

## 后果

- 每次修改项目结构必须：递增 `SCHEMA_VERSION`、在 `MIGRATIONS` 添加上一步版本到下一步版本的函数、补充迁移测试
- 服务端（阶段 2 起）在写入前必须做同样的校验

## 备选方案

- 使用 JSON Schema（如 Ajv）而非 zod：需要额外维护两套定义，且难以携带迁移逻辑，已否决
- 不做版本化，直接兼容读取：无法保证长期可维护，已否决
