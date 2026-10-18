import { FeaturePlan } from "@/components/FeaturePlan";

export default function AiPage() {
  return (
    <FeaturePlan
      title="AI 图案生成与处理"
      phase="阶段 3"
      summary="通过统一的 ImageGenerationProvider / BackgroundRemovalProvider 接口接入托管 AI 服务，用于文生图案、透明背景图案与背景移除。"
      statusText="尚未配置任何 AI 服务密钥。当前页面不会生成任何图案，也不会用示例图片冒充 AI 结果。请在服务端环境变量中配置 Provider 后再启用。"
      requirements={[
        "在托管平台的服务端环境变量中配置 API 密钥，密钥不得进入浏览器或公开仓库",
        "确定提供商的数据留存政策，未经用户授权不上传其设计",
        "实现额度检查、限流、超时与失败返还，且由服务端校验",
        "明确区分「已配置并调用成功」「未配置」「开发环境模拟」三种状态"
      ]}
      planned={[
        "文本生成图案与透明背景图案",
        "图片背景移除与透明边缘检查",
        "图案扩展与局部修改（视 Provider 能力）",
        "分辨率检查、分类与标签",
        "任务状态跟踪（例如 queued / processing / succeeded / failed）与用量记录"
      ]}
    />
  );
}
