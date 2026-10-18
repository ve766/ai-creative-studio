"use client";

import { useEffect, useState } from "react";
import type { Layer, LayerPatch, Project } from "@acs/project-schema";
import type { ProductTemplate } from "@acs/template-schema";
import type { PreflightIssue } from "@acs/editor-core";

interface NumberInputProps {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onCommit: (value: number) => void;
}

function NumberInput({ label, value, step = 1, min, max, onCommit }: NumberInputProps) {
  const [draft, setDraft] = useState(String(Math.round(value * 100) / 100));

  useEffect(() => {
    setDraft(String(Math.round(value * 100) / 100));
  }, [value]);

  const commit = () => {
    const parsed = Number.parseFloat(draft);
    if (Number.isFinite(parsed)) {
      let next = parsed;
      if (min !== undefined) next = Math.max(min, next);
      if (max !== undefined) next = Math.min(max, next);
      onCommit(next);
    } else {
      setDraft(String(Math.round(value * 100) / 100));
    }
  };

  return (
    <label className="field" style={{ marginBottom: 0 }}>
      <span className="field-label">{label}</span>
      <input
        className="input"
        type="number"
        step={step}
        min={min}
        max={max}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
      />
    </label>
  );
}

const FONT_FAMILIES = [
  { label: "系统默认", value: "sans-serif" },
  { label: "苹方 / 微软雅黑", value: '"PingFang SC", "Microsoft YaHei", sans-serif' },
  { label: "思源黑体", value: '"Source Han Sans SC", "Noto Sans CJK SC", sans-serif' },
  { label: "宋体 / 衬线", value: 'Georgia, "Songti SC", serif' },
  { label: "等宽", value: "ui-monospace, monospace" }
];

export interface PropertyPanelProps {
  project: Project;
  template: ProductTemplate | null;
  layer: Layer | null;
  preflight: PreflightIssue[];
  busy: boolean;
  onRename: (name: string) => void;
  onUpdateLayer: (patch: LayerPatch) => void;
  onCenter: () => void;
  onFit: () => void;
  onExport: (mode: "preview" | "print") => void;
  onExportJson: () => void;
}

export function PropertyPanel(props: PropertyPanelProps) {
  const {
    project,
    template,
    layer,
    preflight,
    busy,
    onRename,
    onUpdateLayer,
    onCenter,
    onFit,
    onExport,
    onExportJson
  } = props;

  const [nameDraft, setNameDraft] = useState(project.name);
  useEffect(() => setNameDraft(project.name), [project.name]);

  const errors = preflight.filter((issue) => issue.level === "error");
  const warnings = preflight.filter((issue) => issue.level === "warning");
  const infos = preflight.filter((issue) => issue.level === "info");

  return (
    <div className="panel-scroll">
      <section className="panel-section">
        <div className="panel-title">项目</div>
        <label className="field">
          <span className="field-label">项目名称</span>
          <input
            className="input"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={() => {
              if (nameDraft.trim() && nameDraft !== project.name) onRename(nameDraft);
              else setNameDraft(project.name);
            }}
          />
        </label>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
          模板：{template ? `${template.name} v${template.version}` : project.templateId}
          <br />
          画布：{project.canvas.width}×{project.canvas.height}px · {project.canvas.dpi}dpi
          <br />
          输出：{project.print ? `${project.print.targetWidthMm}×${project.print.targetHeightMm}mm` : "未定义"}
        </div>
      </section>

      <section className="panel-section">
        <div className="panel-title">图层属性</div>
        {!layer ? (
          <p className="muted" style={{ fontSize: 12.5 }}>
            未选中图层，点击画布或图层列表选择。
          </p>
        ) : (
          <>
            <label className="field">
              <span className="field-label">图层名称</span>
              <input
                className="input"
                value={layer.name}
                onChange={(event) => onUpdateLayer({ name: event.target.value })}
              />
            </label>
            <div className="field-grid">
              <NumberInput label="X" value={layer.x} onCommit={(x) => onUpdateLayer({ x })} />
              <NumberInput label="Y" value={layer.y} onCommit={(y) => onUpdateLayer({ y })} />
              <NumberInput
                label="宽"
                min={1}
                value={layer.width}
                onCommit={(width) => onUpdateLayer({ width })}
              />
              <NumberInput
                label="高"
                min={1}
                value={layer.height}
                onCommit={(height) => onUpdateLayer({ height })}
              />
              <NumberInput
                label="旋转°"
                value={layer.rotation}
                onCommit={(rotation) => onUpdateLayer({ rotation })}
              />
              <NumberInput
                label="透明度"
                min={0}
                max={1}
                step={0.05}
                value={layer.opacity}
                onCommit={(opacity) => onUpdateLayer({ opacity })}
              />
            </div>

            {layer.type === "text" ? (
              <>
                <label className="field">
                  <span className="field-label">文本内容</span>
                  <textarea
                    className="textarea"
                    rows={3}
                    value={layer.text}
                    onChange={(event) => onUpdateLayer({ text: event.target.value })}
                  />
                </label>
                <div className="field-grid">
                  <NumberInput
                    label="字号"
                    min={6}
                    value={layer.fontSize}
                    onCommit={(fontSize) => onUpdateLayer({ fontSize })}
                  />
                  <label className="field" style={{ marginBottom: 0 }}>
                    <span className="field-label">字重</span>
                    <select
                      className="select"
                      value={layer.fontWeight}
                      onChange={(event) =>
                        onUpdateLayer({ fontWeight: event.target.value as "normal" | "bold" })
                      }
                    >
                      <option value="normal">常规</option>
                      <option value="bold">加粗</option>
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span className="field-label">字体</span>
                  <select
                    className="select"
                    value={layer.fontFamily}
                    onChange={(event) => onUpdateLayer({ fontFamily: event.target.value })}
                  >
                    {FONT_FAMILIES.map((font) => (
                      <option key={font.value} value={font.value}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="field-grid">
                  <label className="field" style={{ marginBottom: 0 }}>
                    <span className="field-label">颜色</span>
                    <input
                      className="input"
                      type="color"
                      value={layer.fill}
                      onChange={(event) => onUpdateLayer({ fill: event.target.value })}
                    />
                  </label>
                  <label className="field" style={{ marginBottom: 0 }}>
                    <span className="field-label">对齐</span>
                    <select
                      className="select"
                      value={layer.align}
                      onChange={(event) =>
                        onUpdateLayer({ align: event.target.value as "left" | "center" | "right" })
                      }
                    >
                      <option value="left">左对齐</option>
                      <option value="center">居中</option>
                      <option value="right">右对齐</option>
                    </select>
                  </label>
                </div>
              </>
            ) : null}

            <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
              <button type="button" className="btn btn-sm" onClick={onCenter}>
                水平垂直居中
              </button>
              <button type="button" className="btn btn-sm" onClick={onFit}>
                适应画布
              </button>
            </div>
          </>
        )}
      </section>

      <section className="panel-section">
        <div className="panel-title">导出前预检</div>
        {preflight.length === 0 ? (
          <span className="badge badge-success">未发现问题</span>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {[...errors, ...warnings, ...infos].map((issue, index) => (
              <div
                key={`${issue.code}-${index}`}
                className={`notice ${
                  issue.level === "error"
                    ? "notice-danger"
                    : issue.level === "warning"
                      ? "notice-warning"
                      : "notice-info"
                }`}
              >
                {issue.message}
              </div>
            ))}
          </div>
        )}
        <p className="faint" style={{ fontSize: 11.5, marginTop: 8 }}>
          预检基于模板示例规格，未经过印刷厂验证。
        </p>
      </section>

      <section className="panel-section">
        <div className="panel-title">导出</div>
        <div className="stack" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => onExport("preview")}
          >
            导出效果图 PNG（{project.canvas.width}×{project.canvas.height}）
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => onExport("print")}>
            导出印刷参考 PNG（按目标 DPI，不放大小图）
          </button>
          <button type="button" className="btn" onClick={onExportJson}>
            导出项目 JSON
          </button>
        </div>
      </section>
    </div>
  );
}
