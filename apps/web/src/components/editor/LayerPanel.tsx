"use client";

import type { Layer } from "@acs/project-schema";
import type { MoveDirection } from "@acs/editor-core";

export interface LayerPanelProps {
  layers: Layer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string, prop: "visible" | "locked") => void;
  onMove: (id: string, direction: MoveDirection) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}

export function LayerPanel(props: LayerPanelProps) {
  const { layers, selectedId, onSelect, onToggle, onMove, onDuplicate, onRemove } = props;
  const ordered = [...layers].reverse();

  if (ordered.length === 0) {
    return (
      <div className="panel-section">
        <div className="panel-title">图层</div>
        <div className="empty-state" style={{ padding: "22px 12px", fontSize: 12.5 }}>
          还没有图层
          <br />
          请上传图片或添加文字
        </div>
      </div>
    );
  }

  return (
    <div className="panel-scroll">
      <div className="panel-section" style={{ borderBottom: "none" }}>
        <div className="panel-title">图层（{ordered.length}）</div>
        <div className="stack" style={{ gap: 2 }}>
          {ordered.map((layer) => (
            <div
              key={layer.id}
              className="layer-row"
              data-selected={layer.id === selectedId}
              onClick={() => onSelect(layer.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onSelect(layer.id);
              }}
            >
              <span aria-hidden style={{ fontSize: 14 }}>
                {layer.type === "image" ? "🖼" : "T"}
              </span>
              <span className="layer-row-main">
                <span className="layer-row-name">{layer.name}</span>
                <span className="layer-row-meta">
                  {layer.type === "image"
                    ? `${Math.round(layer.naturalWidth)}×${Math.round(layer.naturalHeight)}`
                    : `${layer.fontSize}px`}
                  {layer.locked ? " · 已锁定" : ""}
                </span>
              </span>
              <button
                type="button"
                className="icon-btn"
                data-on={layer.visible}
                title={layer.visible ? "隐藏" : "显示"}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle(layer.id, "visible");
                }}
              >
                {layer.visible ? "👁" : "🚫"}
              </button>
              <button
                type="button"
                className="icon-btn"
                data-on={!layer.locked}
                title={layer.locked ? "解锁" : "锁定"}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle(layer.id, "locked");
                }}
              >
                {layer.locked ? "🔒" : "🔓"}
              </button>
            </div>
          ))}
        </div>
        <div className="divider" />
        <div className="row wrap" style={{ gap: 6 }}>
          <button
            type="button"
            className="btn btn-sm"
            disabled={!selectedId}
            onClick={() => selectedId && onMove(selectedId, "up")}
          >
            上移
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={!selectedId}
            onClick={() => selectedId && onMove(selectedId, "down")}
          >
            下移
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={!selectedId}
            onClick={() => selectedId && onMove(selectedId, "top")}
          >
            置顶
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={!selectedId}
            onClick={() => selectedId && onMove(selectedId, "bottom")}
          >
            置底
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={!selectedId}
            onClick={() => selectedId && onDuplicate(selectedId)}
          >
            复制
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            disabled={!selectedId}
            onClick={() => selectedId && onRemove(selectedId)}
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
}
