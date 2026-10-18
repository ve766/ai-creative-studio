"use client";

import { useMemo, useState } from "react";
import { TEMPLATES } from "@acs/template-library";
import type { TemplateCategory } from "@acs/template-schema";
import { CreateProjectButton } from "./CreateProjectButton";

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  mug: "马克杯",
  "tote-bag": "帆布袋",
  tshirt: "T 恤",
  "phone-case": "手机壳",
  notebook: "笔记本",
  poster: "海报",
  mousepad: "鼠标垫",
  cushion: "抱枕",
  bottle: "水杯",
  sticker: "贴纸"
};

export function TemplateGallery({
  showFilter = true,
  limit
}: {
  showFilter?: boolean;
  limit?: number;
}) {
  const [category, setCategory] = useState<TemplateCategory | "all">("all");

  const filtered = useMemo(() => {
    const list =
      category === "all" ? TEMPLATES : TEMPLATES.filter((item) => item.category === category);
    return limit ? list.slice(0, limit) : list;
  }, [category, limit]);

  const categories = useMemo(
    () => Array.from(new Set(TEMPLATES.map((item) => item.category))),
    []
  );

  return (
    <div className="stack" style={{ gap: 16 }}>
      {showFilter ? (
        <div className="row wrap" style={{ gap: 6 }}>
          <button
            type="button"
            className={`btn btn-sm${category === "all" ? " btn-primary" : ""}`}
            onClick={() => setCategory("all")}
          >
            全部（{TEMPLATES.length}）
          </button>
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              className={`btn btn-sm${category === item ? " btn-primary" : ""}`}
              onClick={() => setCategory(item)}
            >
              {CATEGORY_LABELS[item]}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid grid-templates">
        {filtered.map((template) => (
          <article key={template.id} className="card template-card">
            <img
              className="template-thumb"
              src={template.previewImage}
              alt={`${template.name} 预览`}
              width={template.canvas.width}
              height={template.canvas.height}
              loading="lazy"
            />
            <div className="template-body">
              <div className="row-between">
                <h3 style={{ fontSize: 14.5 }}>{template.name}</h3>
                <span className="badge">v{template.version}</span>
              </div>
              <p className="muted" style={{ fontSize: 12.5 }}>
                {template.description}
              </p>
              <div className="row wrap" style={{ gap: 6 }}>
                <span className="badge">{CATEGORY_LABELS[template.category]}</span>
                <span className="badge">
                  {template.canvas.width}×{template.canvas.height}px
                </span>
                {template.outputSpec ? (
                  <span className="badge">
                    {template.outputSpec.widthMm}×{template.outputSpec.heightMm}mm
                  </span>
                ) : null}
                {template.verified ? (
                  <span className="badge badge-success">已校验规格</span>
                ) : (
                  <span className="badge badge-warning">示例模板</span>
                )}
              </div>
              <div style={{ marginTop: "auto" }}>
                <CreateProjectButton templateId={template.id} />
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
