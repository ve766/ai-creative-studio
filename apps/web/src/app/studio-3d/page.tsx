import { FeaturePlan } from "@/components/FeaturePlan";

export default function Studio3dPage() {
  return (
    <FeaturePlan
      title="3D 立体产品设计"
      phase="阶段 5"
      summary="使用 Three.js 载入合法的 glTF/GLB 产品模型，将设计图案映射到指定材质或 UV 区域，支持多角度预览与效果图导出。"
      statusText="尚未引入 3D 模型库。本页面不会用产品照片冒充 3D 编辑。"
      requirements={[
        "选用授权明确、体积可控的 glTF/GLB 模型，并记录模型来源与授权",
        "为每个模型提供可验证的 UV 映射配置，先完成 1–2 种产品再扩展",
        "模型加载失败时给出明确提示，而不是静默空白",
        "保存模型 ID、模型版本、UV 映射配置与设计数据"
      ]}
      planned={[
        "载入模型并进行旋转、缩放与多角度查看",
        "基础灯光、材质与环境背景",
        "图案映射到指定材质或 UV 区域，可调整位置、缩放与旋转",
        "贴图更新后实时刷新模型",
        "导出产品多角度效果图"
      ]}
    />
  );
}
