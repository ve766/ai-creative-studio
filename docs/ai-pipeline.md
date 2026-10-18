# AI 管线设计

> 状态：设计完成，**尚未接入任何 Provider**（阶段 3 实施）。
> 当前 UI 明确显示「未配置」，不会用示例图片冒充 AI 结果。

## 1. 三种状态（必须严格区分）

| 状态 | 判定 | 表现 |
| --- | --- | --- |
| 已配置且调用成功 | 环境变量齐全 + 上游返回成功 | 返回真实结果，记录模型、参数、用量 |
| 未配置 | 缺少必需环境变量或未启用的开关 | 返回 `NOT_CONFIGURED`，UI 显示配置提示 |
| 开发环境模拟 | `APP_ENV=dev` 且显式开启模拟 | 结果带 `simulated: true` 标记，UI 显式提示「模拟结果」 |

**禁止**：把模拟结果展示为真实 AI 输出；把生成式结果宣称为具有精确像素保真度的印刷原图。

## 2. Provider 接口

```ts
interface ImageGenerationProvider {
  readonly id: string;
  isConfigured(): boolean;
  generatePattern(input: {
    prompt: string;
    size: { width: number; height: number };
    transparent?: boolean;
    seed?: number;
    signal?: AbortSignal;
  }): Promise<ProviderResult<{ assetRef: AssetRef; model: string; usage: UsageRecord }>>;
}

interface BackgroundRemovalProvider {
  readonly id: string;
  isConfigured(): boolean;
  removeBackground(input: {
    assetRef: AssetRef;
    signal?: AbortSignal;
  }): Promise<ProviderResult<{ assetRef: AssetRef; model: string; usage: UsageRecord }>>;
}

interface SceneMockupProvider {
  readonly id: string;
  isConfigured(): boolean;
  renderScene(input: SceneMockupInput): Promise<ProviderResult<{ assetRef: AssetRef; usage: UsageRecord }>>;
}
```

统一结果类型：

```ts
type ProviderResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ProviderErrorCode; message: string; retryable: boolean } };

type ProviderErrorCode =
  | 'NOT_CONFIGURED' | 'INVALID_INPUT' | 'RATE_LIMITED' | 'TIMEOUT'
  | 'UPSTREAM_ERROR' | 'QUOTA_EXCEEDED' | 'CONTENT_REJECTED' | 'UNKNOWN';
```

## 3. 每个 Provider 必须实现

1. 明确的输入输出类型
2. 统一错误格式（上面的 `ProviderResult`）
3. 超时（默认 60s，可配置）
4. 有限重试（最多 2 次，仅对可重试错误，指数退避）
5. 速率限制（按用户与全局）
6. 用量/费用记录（上游返回 usage 时记录，否则记录估算请求数与时长）
7. 配置检查（`isConfigured()`）
8. 可替换实现（业务代码只依赖接口）
9. 自动化测试（使用注入的假 Provider，不访问网络）

**禁止**：把某个供应商的专有数据格式传播到整个业务系统。更换供应商只需修改配置与适配器。

## 4. 任务流程

```
1. 客户端调用 POST /api/v1/ai/generate-pattern
2. 服务端：
   a. 校验身份与权限
   b. 校验输入（类型、扩展名、大小、实际内容、尺寸）
   c. 校验额度预算，写入幂等扣减流水（Idempotency-Key）
   d. 创建 ai_jobs 记录（status = queued）
   e. 入队到托管任务服务
   f. 返回 { jobId }
3. 任务执行：
   a. status = processing，更新 progress
   b. 调用 Provider（带超时与重试）
   c. 成功：保存结果资源，status = succeeded，写入用量
   d. 失败：status = failed，写入错误码与脱敏消息，按规则返还额度
4. 客户端轮询 GET /api/v1/jobs/{id} 获取状态与结果
```

## 5. 额度规则

- 扣减与返还必须**事务安全**且**幂等**：`credit_ledger.idempotency_key` 唯一约束
- 重复请求（相同幂等键）不得重复扣减
- 未开始执行即失败（例如 `NOT_CONFIGURED`）→ 不扣减
- 执行中失败 → 全额返还并记录 `ai.refund` 流水
- 部分成功（例如生成多张仅返回部分）→ 按实际消耗结算，规则需在开通前确定并文档化
- 所有额度变动必须可在流水中追踪

## 6. 限制与保护

| 项目 | 上限（初值，可配置） |
| --- | --- |
| 单文件大小 | 20 MB |
| 单边尺寸 | 12000 px |
| 总像素 | 4000 万 |
| 单用户每日 AI 调用 | 待定（配置项） |
| 全局每日调用 | 待定（配置项） |
| 单次请求超时 | 60 s |
| 重试次数 | 2 |

异常费用增长保护：每日/每月用量上限 + 告警 + 超限后拒绝新任务（而非静默继续计费）。

## 7. 安全与隐私

- 密钥只存在于服务端环境变量或密钥管理系统
- 前端通过经过身份验证的服务端接口发起请求，绝不直接携带密钥
- 接入前评估第三方模型的图片留存与数据使用政策
- 未经用户明确授权，不将用户设计上传到第三方服务
- 日志脱敏：不记录密钥、支付敏感数据、不必要的个人内容
- 对用户上传内容、版权声明与 AI 生成内容设置产品提示

## 8. 图案质量检查

- 分辨率检查：按目标 DPI 计算所需像素，低于阈值给出警告/错误
- 透明边缘检查：检测半透明光晕与硬边
- 裁切检查：图案是否被安全区裁切
- 分类与标签（可选，用于素材管理）

**注意**：这些检查与印刷预检（`docs/print-export.md`）共用同一套像素 / DPI 换算，不得出现两套不一致的标准。
