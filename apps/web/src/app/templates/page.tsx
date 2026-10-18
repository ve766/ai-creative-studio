import { AppShell } from "@/components/AppShell";
import { TemplateGallery } from "@/components/TemplateGallery";

export default function TemplatesPage() {
  return (
    <AppShell>
      <div className="container page">
        <div className="page-head">
          <div>
            <h1>产品模板库</h1>
            <p className="muted">
              每个模板包含稳定的模板 ID、版本号、画布坐标系、可编辑区域、安全区与出血区定义。
              项目会锁定创建时的模板版本，模板更新不会改变已有设计。
            </p>
          </div>
        </div>

        <div className="notice notice-warning" style={{ marginBottom: 20 }}>
          下列模板均为<strong>示例模板</strong>，尺寸与输出规格来自公开常规数据，尚未经过印刷厂验证。
          正式商业使用前需按供应商实际规格校准。
        </div>

        <TemplateGallery />
      </div>
    </AppShell>
  );
}
