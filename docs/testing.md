# 测试说明与结果

## 1. 命令

```bash
pnpm test                 # 全部单元测试（所有包）
pnpm typecheck            # 全部包 TypeScript 检查
pnpm lint                 # ESLint
pnpm build                # 生产构建

# 单包
pnpm --filter @acs/editor-core test
pnpm --filter @acs/web test
```

## 2. 技术选型

- 测试框架：Vitest（`node` 环境）
- 测试文件与实现同目录，命名 `*.test.ts`
- 测试不访问外部网络，不依赖真实付费服务

> 说明：Vitest 配置文件名使用 `vitest.config.mts`，以避免 Vite 的 native config loader 在 CommonJS 下解析 ESM 语法的告警。

## 3. 当前覆盖（v0.1.0）

| 测试文件 | 用例数 | 覆盖内容 |
| --- | --- | --- |
| `packages/project-schema/src/project.test.ts` | 8 | 工厂函数、Schema 校验、摘要、版本检测、迁移（缺失版本 / 版本过新 / 正常往返） |
| `packages/template-schema/src/template.test.ts` | 4 | 模板 Schema 合法性、未知类别拒绝、非法尺寸拒绝、类别集合 |
| `packages/template-library/src/templates.test.ts` | 6 | 模板数量与类别覆盖、ID 唯一与结构校验、示例模板标记、按类别/ID 查询、输出规格转换、按模板创建项目 |
| `packages/editor-core/src/history.test.ts` | 5 | 撤销/重做、新提交清空重做栈、相同状态忽略、历史上限 |
| `packages/editor-core/src/operations.test.ts` | 14 | 添加/删除/更新图层、非法补丁拒绝、复制、上移下移置顶置底、显式重排、显示与锁定、透明度钳制、居中、适应、边界钳制、重命名 |
| `packages/editor-core/src/uploads.test.ts` | 5 | 空文件/超限/不支持类型/扩展名不匹配拒绝、尺寸校验、等比缩放 |
| `packages/editor-core/src/print.test.ts` | 6 | mm↔px 换算、所需像素、低分辨率判定、安全区判定、空设计报告、报告含分辨率发现 |
| `apps/web/src/lib/project-repo.test.ts` | 8 | 创建/读取、损坏数据兜底、保存、排序、复制删除、导入导出、非法导入拒绝、配额错误包装 |
| `apps/web/src/lib/editor-store.test.ts` | 8 | 加载、添加图层与脏标记、撤销重做、删除后选中态、缩放钳制、适应视口居中、选择器、错误上报 |

合计：**64 个用例，5 个测试文件组**。

## 4. 实际执行结果

```
pnpm test       ->  64 passed / 0 failed
pnpm typecheck  ->  5 个项目全部通过
pnpm lint       ->  0 errors / 0 warnings
pnpm build      ->  成功，10 条路由
```

构建产物路由：

```
/  /_not-found  /account  /ai  /editor/[projectId]  /pricing
/projects  /scene  /studio-3d  /templates
```

运行时冒烟（`pnpm start` 后发起 HTTP 请求）：

| 路径 | 结果 |
| --- | --- |
| `/` | 200 |
| `/templates` | 200 |
| `/projects` | 200 |
| `/ai` | 200 |
| `/pricing` | 200 |
| `/account` | 200 |
| `/templates/mug-standard.svg` | 200 |

## 5. 尚未执行的测试（不得视为通过）

| 项目 | 状态 | 原因 |
| --- | --- | --- |
| 浏览器 E2E（Playwright） | 未编写 | 阶段 1 未引入；下一步补 |
| 移动端真机测试 | 未执行 | 无设备环境 |
| 多浏览器兼容测试 | 未执行 | 无环境 |
| 可访问性自动化检查 | 未执行 | 未引入 axe 等工具 |
| AI / 权限 / 支付测试 | 未执行 | 功能尚未实现（应使用可注入的假 Provider） |
| 性能基准（大画布、多图层） | 未执行 | 未建立基准 |

## 6. 关键不可回归行为清单

以下行为必须始终有测试覆盖，任何改动都不得破坏：

- 撤销/重做栈的正确性（含新提交清空重做）
- 图层顺序变化（上移/下移/置顶/置底/显式重排）
- 项目保存与恢复（含损坏数据的兜底）
- Schema 版本迁移（缺失版本、版本过新、正常往返）
- 模板 ID 唯一与项目锁定模板版本
- 上传校验（类型、大小、扩展名、尺寸）
- 印刷换算与低分辨率预检

## 7. 本地存储与测试隔离

`ProjectRepository` 接受任意 `StorageLike`，测试使用 `createMemoryStorage()`，不触碰真实 `localStorage`。

## 8. 下一步测试计划

1. 引入 Playwright，覆盖：上传图片 → 拖动 → 撤销 → 保存 → 重开 → 导出 PNG
2. 引入组件测试（jsdom + Testing Library）覆盖属性面板与图层面板交互
3. 阶段 2 起为每个 Provider 编写假实现测试
4. 建立导出尺寸一致性测试（容差断言）
