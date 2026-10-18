"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Konva from "konva";
import {
  Image as KonvaImage,
  Layer as KonvaLayer,
  Rect,
  Stage,
  Text as KonvaText,
  Transformer
} from "react-konva";
import type { Layer, LayerPatch, Project } from "@acs/project-schema";
import type { ProductTemplate } from "@acs/template-schema";
import { loadImageElement } from "@/lib/image";

export interface CommitLayerArgs {
  id: string;
  patch: LayerPatch;
}

export interface EditorCanvasProps {
  project: Project;
  template: ProductTemplate | null;
  selectedLayerId: string | null;
  zoom: number;
  pan: { x: number; y: number };
  panMode: boolean;
  onSelect: (id: string | null) => void;
  onCommitLayer: (args: CommitLayerArgs) => void;
  onZoomBy: (factor: number, anchor?: { x: number; y: number }) => void;
  onPanChange: (pan: { x: number; y: number }) => void;
  onViewportResize: (size: { width: number; height: number }) => void;
}

function useImageElement(src: string): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    setImage(null);
    loadImageElement(src)
      .then((element) => {
        if (!cancelled) setImage(element);
      })
      .catch(() => {
        if (!cancelled) setImage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);
  return image;
}

interface LayerNodeProps {
  layer: Layer;
  draggable: boolean;
  onSelect: (id: string) => void;
  onCommit: (id: string, patch: LayerPatch) => void;
  registerRef: (id: string, node: Konva.Node | null) => void;
}

function ImageLayerNode({ layer, draggable, onSelect, onCommit, registerRef }: LayerNodeProps) {
  const image = useImageElement(layer.type === "image" ? layer.src : "");
  const nodeRef = useRef<Konva.Image | null>(null);

  useEffect(() => {
    registerRef(layer.id, nodeRef.current);
    return () => registerRef(layer.id, null);
  }, [layer.id, registerRef, image]);

  if (!image || layer.type !== "image") return null;

  return (
    <KonvaImage
      ref={(node) => {
        nodeRef.current = node;
        registerRef(layer.id, node);
      }}
      image={image}
      x={layer.x}
      y={layer.y}
      width={layer.width}
      height={layer.height}
      rotation={layer.rotation}
      opacity={layer.opacity}
      visible={layer.visible}
      draggable={draggable}
      crop={
        layer.crop
          ? { x: layer.crop.x, y: layer.crop.y, width: layer.crop.width, height: layer.crop.height }
          : undefined
      }
      onMouseDown={() => onSelect(layer.id)}
      onTouchStart={() => onSelect(layer.id)}
      onDragEnd={(event) => onCommit(layer.id, { x: event.target.x(), y: event.target.y() })}
      onTransformEnd={(event) => {
        const node = event.target;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onCommit(layer.id, {
          x: node.x(),
          y: node.y(),
          width: Math.max(1, node.width() * scaleX),
          height: Math.max(1, node.height() * scaleY),
          rotation: node.rotation()
        });
      }}
    />
  );
}

function TextLayerNode({ layer, draggable, onSelect, onCommit, registerRef }: LayerNodeProps) {
  const nodeRef = useRef<Konva.Text | null>(null);
  const measuredHeightRef = useRef(layer.height);
  const onCommitRef = useRef(onCommit);
  const layerId = layer.id;

  const text = layer.type === "text" ? layer.text : "";
  const fontSize = layer.type === "text" ? layer.fontSize : 0;
  const fontFamily = layer.type === "text" ? layer.fontFamily : "";
  const fontWeight = layer.type === "text" ? layer.fontWeight : "normal";
  const fontStyle = layer.type === "text" ? layer.fontStyle : "normal";
  const align = layer.type === "text" ? layer.align : "left";

  useEffect(() => {
    onCommitRef.current = onCommit;
  });

  const syncHeight = useCallback(() => {
    const node = nodeRef.current;
    if (!node || fontSize <= 0) return;
    const measured = Math.round(node.height() * 100) / 100;
    if (Math.abs(measured - measuredHeightRef.current) < 0.5) return;
    measuredHeightRef.current = measured;
    onCommitRef.current(layerId, { height: measured });
  }, [fontSize, layerId]);

  useEffect(() => {
    registerRef(layerId, nodeRef.current);
    return () => registerRef(layerId, null);
  }, [layerId, registerRef]);

  // Konva clips text that does not fit a fixed height, so the node keeps an
  // automatic height and the measured value is written back to the project.
  useEffect(() => {
    syncHeight();
  }, [syncHeight, text, layer.width, fontFamily, fontWeight, align]);

  if (layer.type !== "text") return null;

  return (
    <KonvaText
      ref={(node) => {
        nodeRef.current = node;
        registerRef(layer.id, node);
      }}
      text={text}
      x={layer.x}
      y={layer.y}
      width={layer.width}
      rotation={layer.rotation}
      opacity={layer.opacity}
      visible={layer.visible}
      draggable={draggable}
      fontSize={fontSize}
      fontFamily={fontFamily}
      fontStyle={`${fontStyle} ${fontWeight}`.trim()}
      fill={layer.fill}
      align={align}
      wrap="word"
      onMouseDown={() => onSelect(layer.id)}
      onTouchStart={() => onSelect(layer.id)}
      onDragEnd={(event) => onCommit(layer.id, { x: event.target.x(), y: event.target.y() })}
      onTransformEnd={(event) => {
        const node = event.target;
        const scaleX = node.scaleX();
        node.scaleX(1);
        node.scaleY(1);
        onCommit(layer.id, {
          x: node.x(),
          y: node.y(),
          width: Math.max(8, node.width() * scaleX),
          rotation: node.rotation()
        });
      }}
    />
  );
}

export default function EditorCanvas(props: EditorCanvasProps) {
  const {
    project,
    template,
    selectedLayerId,
    zoom,
    pan,
    panMode,
    onSelect,
    onCommitLayer,
    onZoomBy,
    onPanChange,
    onViewportResize
  } = props;

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodeRefs = useRef<Map<string, Konva.Node>>(new Map());

  const registerRef = useCallback((id: string, node: Konva.Node | null) => {
    if (node) nodeRefs.current.set(id, node);
    else nodeRefs.current.delete(id);
  }, []);

  const selectedLayer = useMemo(
    () => project.layers.find((layer) => layer.id === selectedLayerId) ?? null,
    [project.layers, selectedLayerId]
  );

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    if (!selectedLayer || selectedLayer.locked || !selectedLayer.visible) {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
      return;
    }
    const node = nodeRefs.current.get(selectedLayer.id);
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedLayer, project.layers]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const report = () => onViewportResize({ width: wrapper.clientWidth, height: wrapper.clientHeight });
    report();
    const observer = new ResizeObserver(report);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [onViewportResize]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    let pinchDistance = 0;
    const distance = (touches: TouchList) => {
      const first = touches[0];
      const second = touches[1];
      if (!first || !second) return 0;
      return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
    };
    const midpoint = (touches: TouchList) => {
      const first = touches[0];
      const second = touches[1];
      if (!first || !second) return { x: 0, y: 0 };
      const rect = wrapper.getBoundingClientRect();
      return {
        x: (first.clientX + second.clientX) / 2 - rect.left,
        y: (first.clientY + second.clientY) / 2 - rect.top
      };
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length >= 2) {
        pinchDistance = distance(event.touches);
        event.stopPropagation();
      }
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length >= 2) {
        event.preventDefault();
        event.stopPropagation();
        const next = distance(event.touches);
        if (pinchDistance > 0 && next > 0) {
          onZoomBy(next / pinchDistance, midpoint(event.touches));
        }
        pinchDistance = next;
      }
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinchDistance = 0;
    };

    wrapper.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    wrapper.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    wrapper.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
    return () => {
      wrapper.removeEventListener("touchstart", onTouchStart, { capture: true });
      wrapper.removeEventListener("touchmove", onTouchMove, { capture: true });
      wrapper.removeEventListener("touchend", onTouchEnd, { capture: true });
    };
  }, [onZoomBy]);

  const handleWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    onZoomBy(event.evt.deltaY > 0 ? 0.92 : 1.08, pointer);
  };

  const guides = template
    ? [
        { rect: template.editableArea, color: "#6366f1", dash: [8, 6] },
        ...(template.safeArea
          ? [
              {
                rect: {
                  x: template.safeArea.left,
                  y: template.safeArea.top,
                  width: project.canvas.width - template.safeArea.left - template.safeArea.right,
                  height: project.canvas.height - template.safeArea.top - template.safeArea.bottom
                },
                color: "#0ea5e9",
                dash: [4, 4]
              }
            ]
          : []),
        ...(template.bleed
          ? [
              {
                rect: {
                  x: template.bleed.left,
                  y: template.bleed.top,
                  width: project.canvas.width - template.bleed.left - template.bleed.right,
                  height: project.canvas.height - template.bleed.top - template.bleed.bottom
                },
                color: "#f97316",
                dash: [2, 4]
              }
            ]
          : [])
      ]
    : [];

  return (
    <div ref={wrapperRef} className="editor-stage-wrap">
      <Stage
        ref={stageRef}
        width={project.canvas.width}
        height={project.canvas.height}
        scaleX={zoom}
        scaleY={zoom}
        x={pan.x}
        y={pan.y}
        draggable={panMode}
        onWheel={handleWheel}
        onDragEnd={(event) => {
          if (event.target === event.target.getStage()) {
            onPanChange({ x: event.target.x(), y: event.target.y() });
          }
        }}
        onMouseDown={(event) => {
          if (event.target === event.target.getStage()) onSelect(null);
        }}
        onTouchStart={(event) => {
          if (event.target === event.target.getStage()) onSelect(null);
        }}
        style={{ cursor: panMode ? "grab" : "default" }}
      >
        <KonvaLayer>
          <Rect
            x={0}
            y={0}
            width={project.canvas.width}
            height={project.canvas.height}
            fill={project.canvas.backgroundColor}
            shadowColor="rgba(15,23,42,0.28)"
            shadowBlur={18}
            shadowOffsetY={6}
            listening={false}
          />
          {guides.map((guide, index) => (
            <Rect
              key={index}
              x={guide.rect.x}
              y={guide.rect.y}
              width={guide.rect.width}
              height={guide.rect.height}
              stroke={guide.color}
              strokeWidth={2 / zoom}
              dash={guide.dash.map((value) => value / zoom)}
              listening={false}
            />
          ))}
        </KonvaLayer>
        <KonvaLayer>
          {project.layers.map((layer) => {
            const layerProps: LayerNodeProps = {
              layer,
              draggable: !layer.locked && !panMode,
              onSelect,
              onCommit: (id, patch) => onCommitLayer({ id, patch }),
              registerRef
            };
            return layer.type === "image" ? (
              <ImageLayerNode key={layer.id} {...layerProps} />
            ) : (
              <TextLayerNode key={layer.id} {...layerProps} />
            );
          })}
        </KonvaLayer>
        <KonvaLayer>
          <Transformer
            ref={transformerRef}
            rotateEnabled
            flipEnabled={false}
            keepRatio={selectedLayer?.type === "image"}
            enabledAnchors={
              selectedLayer?.type === "image"
                ? ["top-left", "top-right", "bottom-left", "bottom-right"]
                : [
                    "top-left",
                    "top-center",
                    "top-right",
                    "middle-left",
                    "middle-right",
                    "bottom-left",
                    "bottom-center",
                    "bottom-right"
                  ]
            }
            anchorSize={9}
            anchorStroke="#4f46e5"
            borderStroke="#4f46e5"
            boundBoxFunc={(oldBox, newBox) =>
              newBox.width < 8 || newBox.height < 8 ? oldBox : newBox
            }
          />
        </KonvaLayer>
      </Stage>
    </div>
  );
}
