import { AiStatusNotice } from "@/components/AiStatusNotice";
import { FeaturePlan } from "@/components/FeaturePlan";

export const dynamic = "force-dynamic";

export default function AiPage() {
  return (
    <FeaturePlan
      title="AI 图案生成与处理"
      phase="阶段 5"
      summary="统一的 AI Provider 合约（能力声明、任务状态、结果引用、用量与成本区分）已经落地；当前只注册了开发模拟 Provider，真实供应商适配器尚未实现。"
      statusText="尚未接入任何真实 AI 服务。AI_MODE=mock 时可在服务端运行模拟流程用于开发与自动化测试，结果一律标记为「模拟」；生产环境会拒绝模拟 Provider。"
      requirements={[
        "在托管平台的服务端环境变量中配置 API 密钥，密钥不得进入浏览器或公开仓库",
        "确定提供商的数据留存政策，未经用户授权不上传其设计",
        "实现额度检查、限流、超时与失败返还，且由服务端校验",
        "真实调用成功后才能把状态标记为「已验证」，仅配置密钥不算验证"
      ]}
      planned={[
        "文本生成图案与透明背景图案",
        "图片背景移除与透明边缘检查",
        "无缝平铺纹理与局部修改",
        "产品场景贴图与 3D 相关能力",
        "真实供应商适配器与任务轮询（queued / running / succeeded / failed / canceled / timed-out）"
      ]}
      aside={<AiStatusNotice />}
    />
  );
}
