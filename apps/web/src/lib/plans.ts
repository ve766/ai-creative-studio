export interface PlanDefinition {
  id: "free" | "pro" | "business";
  name: string;
  priceLabel: string;
  billingNote: string;
  highlight: boolean;
  features: string[];
  purchasable: boolean;
}

export const PLANS: PlanDefinition[] = [
  {
    id: "free",
    name: "Free",
    priceLabel: "¥0",
    billingNote: "永久免费",
    highlight: false,
    purchasable: false,
    features: ["基础编辑器与全部示例模板", "本地项目保存与 PNG 效果图导出", "有限的印刷参考导出"]
  },
  {
    id: "pro",
    name: "Pro",
    priceLabel: "价格待定",
    billingNote: "支付通道尚未开通",
    highlight: true,
    purchasable: false,
    features: ["更多产品模板与高分辨率导出", "AI 图案生成与背景移除额度", "部分 3D 产品设计功能"]
  },
  {
    id: "business",
    name: "商业版",
    priceLabel: "按需报价",
    billingNote: "根据真实需求评估",
    highlight: false,
    purchasable: false,
    features: ["批量设计与商业工作流", "团队协作与权限管理", "印刷生产文件与供应商规格对接"]
  }
];

export const PAYMENT_CONFIGURED = false;
