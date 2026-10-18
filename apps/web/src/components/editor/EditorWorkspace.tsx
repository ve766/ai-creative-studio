"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createImageLayer, createTextLayer } from "@acs/project-schema";
import { buildPreflightReport, fitInside, validateImageFile } from "@acs/editor-core";
import { getTemplate } from "@acs/template-library";
import { LIMITS } from "@/lib/app-config";
import { useEditorStore, selectCanRedo, selectCanUndo, selectSelectedLayer } from "@/lib/editor-store";
import { downloadDataUrl, downloadText, renderProjectToDataUrl, safeFilename } from "@/lib/export";
import { ImageProcessingError, prepareImageFile } from "@/lib/image";
import { getProjectRepository, type ProjectLoadFailureReason } from "@/lib/project-repo";
import { LayerPanel } from "./LayerPanel";
import { PropertyPanel } from "./PropertyPanel";

const EditorCanvas = dynamic(() => import("./EditorCanvas"), {
  ssr: false,
  loading: () => (
    <div
      className="editor-stage-wrap"
      style={{ display: "grid", placeItems: "center", color: "var(--text-muted)" }}
    >
      正在加载画布…
    </div>
  )
});

export function EditorWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const store = useEditorStore();
  const {
    project,
    load,
    unload,
    undo,
    redo,
    select,
    setZoom,
    zoomBy,
    setPan,
    fitToViewport,
    addLayer,
    removeLayer,
    updateLayer,
    updateLayerTransient,
    commitHistory,
    duplicateLayer,
    moveLayer,
    toggleLayer,
    centerLayer,
    fitLayerToCanvas,
    renameProject,
    markSaved,
    setSaveState,
    setError
  } = store;

  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [loadFailure, setLoadFailure] = useState<{
    reason: ProjectLoadFailureReason;
    message: string;
  } | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [panMode, setPanMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const savedRef = useRef<string | null>(null);
  const fittedRef = useRef(false);

  const selectedLayer = useEditorStore(selectSelectedLayer);
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);
  const zoom = store.zoom;
  const pan = store.pan;
  const saveState = store.saveState;
  const error = store.error;

  useEffect(() => {
    const repository = getProjectRepository();
    const result = repository.load(projectId);
    if (!result.ok) {
      setLoadFailure({ reason: result.reason, message: result.message });
      setStatus("missing");
      return;
    }
    load(result.project);
    savedRef.current = result.project.updatedAt;
    setStatus("ready");
    return () => unload();
  }, [projectId, load, unload]);

  const template = useMemo(
    () => (project ? getTemplate(project.templateId) : null),
    [project]
  );

  useEffect(() => {
    if (!project || status !== "ready") return;
    if (savedRef.current === project.updatedAt) return;
    const timer = setTimeout(() => {
      try {
        setSaveState("saving");
        getProjectRepository().save(project);
        savedRef.current = project.updatedAt;
        markSaved(project.updatedAt);
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "自动保存失败");
      }
    }, LIMITS.autosaveDebounceMs);
    return () => clearTimeout(timer);
  }, [project, status, markSaved, setError, setSaveState]);

  useEffect(() => {
    if (status !== "ready") {
      fittedRef.current = false;
      return;
    }
    if (fittedRef.current) return;
    if (viewport.width <= 0 || viewport.height <= 0) return;
    fittedRef.current = true;
    fitToViewport(viewport.width, viewport.height);
  }, [status, viewport, fitToViewport]);

  const onViewportResize = useCallback((size: { width: number; height: number }) => {
    setViewport((current) =>
      current.width === size.width && current.height === size.height ? current : size
    );
  }, []);

  const onZoomBy = useCallback(
    (factor: number, anchor?: { x: number; y: number }) => zoomBy(factor, anchor),
    [zoomBy]
  );

  const onCommitLayer = useCallback(
    ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const current = useEditorStore.getState().project;
      if (!current) return;
      const layer = current.layers.find((item) => item.id === id);
      if (!layer) return;
      const merged = { ...layer, ...patch };
      const x = Math.max(-merged.width + 8, Math.min(current.canvas.width - 8, merged.x));
      const y = Math.max(-merged.height + 8, Math.min(current.canvas.height - 8, merged.y));
      updateLayer(id, { ...patch, x, y } as never);
    },
    [updateLayer]
  );

  const preflight = useMemo(() => {
    if (!project) return [];
    return buildPreflightReport(project, {
      canvas: project.canvas,
      targetWidthMm: project.print?.targetWidthMm ?? project.canvas.width,
      targetDpi: project.print?.dpi ?? project.canvas.dpi,
      safeArea: template?.safeArea ?? null
    });
  }, [project, template]);

  const handleFiles = useCallback(
    async (file: File) => {
      if (!project) return;
      setLocalError(null);
      const meta = validateImageFile({ name: file.name, type: file.type, size: file.size });
      if (!meta.ok) {
        setLocalError(meta.message);
        return;
      }
      try {
        const prepared = await prepareImageFile(file, LIMITS.maxStoredImageDimension);
        const box = { width: project.canvas.width * 0.8, height: project.canvas.height * 0.8 };
        const fitted = fitInside(
          { width: prepared.width, height: prepared.height },
          { width: box.width, height: box.height }
        );
        const layer = createImageLayer({
          name: file.name.replace(/\.[^.]+$/, "").slice(0, 30) || "图片",
          src: prepared.dataUrl,
          x: (project.canvas.width - fitted.width) / 2,
          y: (project.canvas.height - fitted.height) / 2,
          width: fitted.width,
          height: fitted.height,
          naturalWidth: prepared.width,
          naturalHeight: prepared.height
        });
        addLayer(layer);
        setLeftOpen(false);
        if (prepared.downscaled) {
          setLocalError(
            `图片已压缩到最长边 ${LIMITS.maxStoredImageDimension}px 以适配浏览器本地存储，原始 ${prepared.originalWidth}×${prepared.originalHeight}px。`
          );
        }
      } catch (processingError) {
        setLocalError(
          processingError instanceof ImageProcessingError
            ? processingError.message
            : "图片处理失败"
        );
      }
    },
    [project, addLayer]
  );

  const handleAddText = useCallback(() => {
    if (!project) return;
    const layer = createTextLayer({
      text: "双击右侧修改文字",
      x: project.canvas.width * 0.12,
      y: project.canvas.height * 0.42,
      width: project.canvas.width * 0.76,
      fontSize: Math.max(24, Math.round(project.canvas.width * 0.07)),
      fill: "#14181f"
    });
    addLayer(layer);
    setLeftOpen(false);
  }, [project, addLayer]);

  const handleExport = useCallback(
    async (mode: "preview" | "print") => {
      const current = useEditorStore.getState().project;
      if (!current) return;
      setBusy(true);
      setLocalError(null);
      try {
        const result = await renderProjectToDataUrl(current, { mode });
        downloadDataUrl(
          result.dataUrl,
          safeFilename(current.name, mode === "preview" ? "effect" : "print-ref")
        );
        if (result.warning) setLocalError(result.warning);
      } catch (exportError) {
        setLocalError(exportError instanceof Error ? exportError.message : "导出失败");
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const handleManualSave = useCallback(() => {
    const current = useEditorStore.getState().project;
    if (!current) return;
    try {
      setSaveState("saving");
      getProjectRepository().save(current);
      savedRef.current = current.updatedAt;
      markSaved(current.updatedAt);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败");
    }
  }, [markSaved, setError, setSaveState]);

  const handleExportJson = useCallback(() => {
    const current = useEditorStore.getState().project;
    if (!current) return;
    downloadText(JSON.stringify(current, null, 2), safeFilename(current.name, "project", "json"));
  }, []);

  const handleImportJson = useCallback(
    async (file: File) => {
      setLocalError(null);
      const text = await file.text();
      const result = getProjectRepository().importJson(text);
      if (!result.ok) {
        setLocalError(result.message);
        return;
      }
      router.push(`/editor/${result.project.id}`);
    },
    [router]
  );

  useEffect(() => {
    if (status !== "ready") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (event.code === "Space" && !editing) {
        setPanMode(true);
        event.preventDefault();
        return;
      }

      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (meta && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (meta && event.key.toLowerCase() === "s") {
        event.preventDefault();
        handleManualSave();
        return;
      }
      if (editing) return;

      const current = useEditorStore.getState().project;
      const id = useEditorStore.getState().selectedLayerId;
      if (!current || !id) return;
      const layer = current.layers.find((item) => item.id === id);
      if (!layer || layer.locked) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeLayer(id);
        return;
      }
      const step = event.shiftKey ? 10 : 1;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        updateLayer(id, { x: layer.x - step });
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        updateLayer(id, { x: layer.x + step });
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        updateLayer(id, { y: layer.y - step });
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        updateLayer(id, { y: layer.y + step });
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setPanMode(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [status, undo, redo, handleManualSave, removeLayer, updateLayer]);

  if (status === "loading") {
    return (
      <div className="editor-root" style={{ display: "grid", placeItems: "center" }}>
        <p className="muted">正在加载项目…</p>
      </div>
    );
  }

  if (status === "missing" || !project) {
    const title =
      loadFailure?.reason === "FUTURE_VERSION"
        ? "项目版本过新"
        : loadFailure?.reason === "INVALID"
          ? "项目数据无法读取"
          : "找不到该项目";
    const body =
      loadFailure?.reason === "FUTURE_VERSION"
        ? loadFailure.message
        : loadFailure?.reason === "INVALID"
          ? `${loadFailure.message}。原始数据仍保留在本地存储中，未被修改或删除。`
          : "项目可能已被删除，或保存在其他浏览器的本地存储中。当前版本项目数据保存在本机浏览器。";
    return (
      <div className="editor-root" style={{ display: "grid", placeItems: "center" }}>
        <div className="card" style={{ maxWidth: 420 }}>
          <div className="card-body stack">
            <h3>{title}</h3>
            <p className="muted">{body}</p>
            <Link href="/projects" className="btn btn-primary">
              返回我的项目
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const saveLabel =
    saveState === "saving"
      ? "保存中…"
      : saveState === "dirty"
        ? "有未保存修改"
        : saveState === "error"
          ? "保存失败"
          : store.lastSavedAt
            ? `已保存 ${new Date(store.lastSavedAt).toLocaleTimeString("zh-CN")}`
            : "已保存";

  const banner = localError ?? error;

  return (
    <div className="editor-root">
      <div className="editor-topbar">
        <Link href="/projects" className="btn btn-sm btn-ghost">
          ← 项目
        </Link>
        <strong style={{ fontSize: 13.5, whiteSpace: "nowrap" }}>{project.name}</strong>
        <span className="badge" data-state={saveState}>
          {saveLabel}
        </span>
        <div className="row" style={{ gap: 4 }}>
          <button type="button" className="btn btn-sm" disabled={!canUndo} onClick={undo} title="撤销 Ctrl+Z">
            撤销
          </button>
          <button type="button" className="btn btn-sm" disabled={!canRedo} onClick={redo} title="重做 Ctrl+Y">
            重做
          </button>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button type="button" className="btn btn-sm" onClick={() => setZoom(zoom / 1.2)}>
            −
          </button>
          <span className="muted" style={{ fontSize: 12, minWidth: 44, textAlign: "center" }}>
            {Math.round(zoom * 100)}%
          </span>
          <button type="button" className="btn btn-sm" onClick={() => setZoom(zoom * 1.2)}>
            +
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => fitToViewport(viewport.width, viewport.height)}
          >
            适应
          </button>
          <button
            type="button"
            className={`btn btn-sm${panMode ? " btn-primary" : ""}`}
            onClick={() => setPanMode((value) => !value)}
            title="按住空格可临时平移"
          >
            {panMode ? "平移中" : "平移"}
          </button>
        </div>
        <div className="row" style={{ gap: 6, marginLeft: "auto" }}>
          <button type="button" className="btn btn-sm" onClick={handleManualSave}>
            保存
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={busy}
            onClick={() => handleExport("preview")}
          >
            {busy ? "导出中…" : "导出 PNG"}
          </button>
        </div>
      </div>

      {banner ? (
        <div className="notice notice-warning" style={{ margin: "8px 12px 0" }}>
          {banner}
          <button
            type="button"
            className="icon-btn"
            style={{ float: "right" }}
            onClick={() => {
              setLocalError(null);
              setError(null);
            }}
          >
            ✕
          </button>
        </div>
      ) : null}

      <div className="editor-body">
        <aside className="editor-side" data-open={leftOpen}>
          <div className="panel-section">
            <div className="panel-title">工具</div>
            <div className="stack" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => fileInputRef.current?.click()}
              >
                上传图片
              </button>
              <button type="button" className="btn" onClick={handleAddText}>
                添加文字
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => importInputRef.current?.click()}
              >
                导入项目 JSON
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFiles(file);
                event.target.value = "";
              }}
            />
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleImportJson(file);
                event.target.value = "";
              }}
            />
          </div>
          <LayerPanel
            layers={project.layers}
            selectedId={store.selectedLayerId}
            onSelect={(id) => {
              select(id);
              setRightOpen(true);
            }}
            onToggle={toggleLayer}
            onMove={moveLayer}
            onDuplicate={duplicateLayer}
            onRemove={removeLayer}
          />
        </aside>

        <EditorCanvas
          project={project}
          template={template}
          selectedLayerId={store.selectedLayerId}
          zoom={zoom}
          pan={pan}
          panMode={panMode}
          onSelect={select}
          onCommitLayer={onCommitLayer}
          onZoomBy={onZoomBy}
          onPanChange={setPan}
          onViewportResize={onViewportResize}
        />

        <aside className="editor-side editor-side-right" data-open={rightOpen}>
          <PropertyPanel
            project={project}
            template={template}
            layer={selectedLayer}
            preflight={preflight}
            busy={busy}
            onRename={renameProject}
            onUpdateLayer={(patch) => {
              if (!selectedLayer) return;
              updateLayer(selectedLayer.id, patch);
            }}
            onUpdateLayerTransient={(patch) => {
              if (!selectedLayer) return;
              updateLayerTransient(selectedLayer.id, patch);
            }}
            onCommitLayerHistory={commitHistory}
            onCenter={() => selectedLayer && centerLayer(selectedLayer.id)}
            onFit={() => selectedLayer && fitLayerToCanvas(selectedLayer.id)}
            onExport={(mode) => void handleExport(mode)}
            onExportJson={handleExportJson}
          />
        </aside>
      </div>

      <div className="mobile-tabs">
        <button
          type="button"
          className={`btn btn-sm${leftOpen ? " btn-primary" : ""}`}
          onClick={() => {
            setLeftOpen((value) => !value);
            setRightOpen(false);
          }}
        >
          图层 / 工具
        </button>
        <button
          type="button"
          className={`btn btn-sm${rightOpen ? " btn-primary" : ""}`}
          onClick={() => {
            setRightOpen((value) => !value);
            setLeftOpen(false);
          }}
        >
          属性 / 导出
        </button>
        <button
          type="button"
          className="btn btn-sm"
          style={{ marginLeft: "auto" }}
          onClick={() => {
            setLeftOpen(false);
            setRightOpen(false);
          }}
        >
          关闭面板
        </button>
      </div>
    </div>
  );
}
