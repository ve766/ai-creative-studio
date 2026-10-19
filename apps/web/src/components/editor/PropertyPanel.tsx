"use client";

import { useEffect, useMemo, useState } from "react";
import type { ImageLayer, Layer, LayerPatch, Project } from "@acs/project-schema";
import type { ProductTemplate } from "@acs/template-schema";
import type { PreflightIssue } from "@acs/editor-core";
import { describePrintExport } from "@/lib/export";
import type { ImageOperationRequest } from "@/lib/image-ops";

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
  dpiIssues: PreflightIssue[];
  busy: boolean;
  processing: boolean;
  onRename: (name: string) => void;
  onUpdateLayer: (patch: LayerPatch) => void;
  onUpdateLayerTransient: (patch: LayerPatch) => void;
  onCommitLayerHistory: () => void;
  onCenter: () => void;
  onFit: () => void;
  onProcessImage: (request: ImageOperationRequest) => void;
  onExport: (mode: "preview" | "print") => void;
  onExportJson: () => void;
}

function ImageToolSection({
  layer,
  dpiIssues,
  processing,
  onProcessImage
}: {
  layer: ImageLayer;
  dpiIssues: PreflightIssue[];
  processing: boolean;
  onProcessImage: (request: ImageOperationRequest) => void;
}) {
  const naturalWidth = Math.max(1, Math.round(layer.naturalWidth));
  const naturalHeight = Math.max(1, Math.round(layer.naturalHeight));
  const [crop, setCrop] = useState({ x: 0, y: 0, width: naturalWidth, height: naturalHeight });
  const [maxEdge, setMaxEdge] = useState(naturalWidth);
  const [adjust, setAdjust] = useState({ brightness: 0, contrast: 0, saturation: 0, opacity: 1 });

  useEffect(() => {
    setCrop({ x: 0, y: 0, width: naturalWidth, height: naturalHeight });
    setMaxEdge(naturalWidth);
  }, [layer.id, naturalWidth, naturalHeight]);

  return (
    <section className="panel-section">
      <div className="panel-title">图像处理（生成新图层）</div>
      <p className="faint" style={{ fontSize: 11.5 }}>
        原图 {naturalWidth}×{naturalHeight}px。所有处理都会新建一个图层，原始图层保持不变，可用 Ctrl+Z 撤销。
      </p>

      {dpiIssues.length === 0 ? (
        <div style={{ marginBottom: 10 }}>
          <span className="badge badge-success">满足目标 DPI</span>
        </div>
      ) : (
        <div className="stack" style={{ gap: 5, marginBottom: 10 }}>
          {dpiIssues.map((issue, index) => (
            <div
              key={`${issue.code}-${index}`}
              className="muted"
              style={{ fontSize: 11.5, lineHeight: 1.55, display: "flex", gap: 6 }}
            >
              <span
                aria-hidden
                style={{
                  flex: "none",
                  marginTop: 3,
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background:
                    issue.level === "error"
                      ? "var(--danger)"
                      : issue.level === "warning"
                        ? "var(--warning)"
                        : "var(--info)"
                }}
              />
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="panel-title" style={{ fontSize: 12.5 }}>
        裁切（原图像素坐标）
      </div>
      <div className="field-grid">
        <NumberInput label="裁切起点 X" min={0} value={crop.x} onCommit={(x) => setCrop((c) => ({ ...c, x }))} />
        <NumberInput label="裁切起点 Y" min={0} value={crop.y} onCommit={(y) => setCrop((c) => ({ ...c, y }))} />
        <NumberInput label="裁切宽" min={1} value={crop.width} onCommit={(width) => setCrop((c) => ({ ...c, width }))} />
        <NumberInput label="裁切高" min={1} value={crop.height} onCommit={(height) => setCrop((c) => ({ ...c, height }))} />
      </div>
      <button
        type="button"
        className="btn btn-sm"
        disabled={processing}
        onClick={() => onProcessImage({ crop })}
      >
        裁切为新图层
      </button>

      <div className="panel-title" style={{ fontSize: 12.5, marginTop: 12 }}>
        缩放（限制最长边）
      </div>
      <div className="field-grid">
        <NumberInput label="最长边(px)" min={1} value={maxEdge} onCommit={setMaxEdge} />
      </div>
      <button
        type="button"
        className="btn btn-sm"
        disabled={processing}
        onClick={() => onProcessImage({ resize: { mode: "fit-max-edge", maxEdge } })}
      >
        缩放为新图层
      </button>

      <div className="panel-title" style={{ fontSize: 12.5, marginTop: 12 }}>
        亮度 / 对比度 / 饱和度 / 透明度
      </div>
      <div className="field-grid">
        <NumberInput
          label="亮度"
          min={-100}
          max={100}
          value={adjust.brightness}
          onCommit={(brightness) => setAdjust((a) => ({ ...a, brightness }))}
        />
        <NumberInput
          label="对比度"
          min={-100}
          max={100}
          value={adjust.contrast}
          onCommit={(contrast) => setAdjust((a) => ({ ...a, contrast }))}
        />
        <NumberInput
          label="饱和度"
          min={-100}
          max={100}
          value={adjust.saturation}
          onCommit={(saturation) => setAdjust((a) => ({ ...a, saturation }))}
        />
        <NumberInput
          label="调整透明度"
          min={0}
          max={1}
          step={0.05}
          value={adjust.opacity}
          onCommit={(opacity) => setAdjust((a) => ({ ...a, opacity }))}
        />
      </div>
      <button
        type="button"
        className="btn btn-sm"
        disabled={processing}
        onClick={() =>
          onProcessImage({
            color: {
              brightness: adjust.brightness,
              contrast: adjust.contrast,
              saturation: adjust.saturation
            },
            opacity: adjust.opacity
          })
        }
      >
        调整为新图层
      </button>

      <div className="panel-title" style={{ fontSize: 12.5, marginTop: 12 }}>
        透明区域
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        <button
          type="button"
          className="btn btn-sm"
          disabled={processing}
          onClick={() => onProcessImage({ trimTransparent: {} })}
        >
          去除透明边缘
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={processing}
          onClick={() => onProcessImage({ cleanFringe: {} })}
        >
          清理透明毛边
        </button>
      </div>
      <p className="faint" style={{ fontSize: 11.5, marginTop: 8 }}>
        毛边清理只删除阈值以下的半透明像素，不是 AI 抠图或背景移除。
      </p>
    </section>
  );
}

export function PropertyPanel(props: PropertyPanelProps) {
  const {
    project,
    template,
    layer,
    preflight,
    dpiIssues,
    busy,
    processing,
    onRename,
    onUpdateLayer,
    onUpdateLayerTransient,
    onCommitLayerHistory,
    onCenter,
    onFit,
    onProcessImage,
    onExport,
    onExportJson
  } = props;

  const [nameDraft, setNameDraft] = useState(project.name);
  useEffect(() => setNameDraft(project.name), [project.name]);

  const [layerNameDraft, setLayerNameDraft] = useState(layer?.name ?? "");
  useEffect(() => setLayerNameDraft(layer?.name ?? ""), [layer?.id, layer?.name]);

  const errors = preflight.filter((issue) => issue.level === "error");
  const warnings = preflight.filter((issue) => issue.level === "warning");
  const infos = preflight.filter((issue) => issue.level === "info");
  const printPlan = useMemo(() => describePrintExport(project), [project]);

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
                value={layerNameDraft}
                onChange={(event) => setLayerNameDraft(event.target.value)}
                onBlur={() => {
                  const next = layerNameDraft.trim();
                  if (next && next !== layer.name) onUpdateLayer({ name: next });
                  else setLayerNameDraft(layer.name);
                }}
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
                    onChange={(event) => onUpdateLayerTransient({ text: event.target.value })}
                    onBlur={onCommitLayerHistory}
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
                      onChange={(event) => onUpdateLayerTransient({ fill: event.target.value })}
                      onBlur={onCommitLayerHistory}
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

      {layer && layer.type === "image" ? (
        <ImageToolSection
          layer={layer}
          dpiIssues={dpiIssues}
          processing={processing}
          onProcessImage={onProcessImage}
        />
      ) : null}

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
          <button
            type="button"
            className="btn"
            disabled={busy || !printPlan.ok}
            onClick={() => onExport("print")}
          >
            {printPlan.ok
              ? `导出印刷参考 PNG（${printPlan.plan.outputWidth}×${printPlan.plan.outputHeight}px）`
              : "导出印刷参考 PNG（当前设备不支持该尺寸）"}
          </button>
          <button type="button" className="btn" onClick={onExportJson}>
            导出项目 JSON
          </button>
          {!printPlan.ok ? (
            <div className="notice notice-danger">{printPlan.message}</div>
          ) : printPlan.plan.capped && printPlan.plan.warning ? (
            <div className="notice notice-warning">{printPlan.plan.warning}</div>
          ) : null}
          <p className="faint" style={{ fontSize: 11.5 }}>
            效果图用于预览；印刷参考按目标 DPI 计算，不会放大小图以伪造细节。两者都不是印刷厂所需的原始生产文件。
          </p>
        </div>
      </section>
    </div>
  );
}
