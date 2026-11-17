import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  Annotation,
  AnnotationTool,
  CaptureSession,
  CommitOperation,
  Point,
  Rectangle,
  WindowTarget,
} from "@shared/types";
import {
  containsPoint,
  normalizeRect,
} from "@shared/geometry";
import { Icon } from "../components/Icon";
import { errorMessage } from "../utils";
import {
  canvasToPng,
  drawCaptureSelection,
  loadCaptureImages,
  type CaptureImageMap,
} from "./renderCanvas";

type Phase = "loading" | "select" | "editor";
type Handle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
type Interaction =
  | { type: "drag"; start: Point }
  | { type: "move"; start: Point; initial: Rectangle }
  | { type: "resize"; handle: Handle; start: Point; initial: Rectangle }
  | null;

const tools: Array<{ id: AnnotationTool; label: string; icon: string }> = [
  { id: "select", label: "选择", icon: "select" },
  { id: "rectangle", label: "矩形", icon: "rectangle" },
  { id: "ellipse", label: "椭圆", icon: "ellipse" },
  { id: "arrow", label: "箭头", icon: "arrow" },
  { id: "pen", label: "画笔", icon: "pen" },
  { id: "text", label: "文字", icon: "text" },
  { id: "mosaic", label: "马赛克", icon: "mosaic" },
];

export function CaptureOverlay({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<CaptureSession | null>(null);
  const [images, setImages] = useState<CaptureImageMap>(new Map());
  const [phase, setPhase] = useState<Phase>("loading");
  const [selection, setSelection] = useState<Rectangle | null>(null);
  const [hoverWindow, setHoverWindow] = useState<WindowTarget | null>(null);
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 });
  const [interaction, setInteraction] = useState<Interaction>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [redoStack, setRedoStack] = useState<Annotation[]>([]);
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null);
  const [tool, setTool] = useState<AnnotationTool>("select");
  const [color, setColor] = useState("#ff6b57");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [textPoint, setTextPoint] = useState<Point | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clickTimer = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const autoCopyStarted = useRef(false);

  useEffect(() => {
    let active = true;
    void window.toolbox
      .getCaptureSession(sessionId)
      .then(async (nextSession) => {
        const loadedImages = await loadCaptureImages(nextSession);
        if (!active) {
          return;
        }
        setSession(nextSession);
        setImages(loadedImages);
        setCursor(nextSession.cursor);
        if (nextSession.initialSelection) {
          setSelection(nextSession.initialSelection);
          setPhase("editor");
        } else {
          setPhase("select");
        }
      })
      .catch((loadError) => {
        setError(errorMessage(loadError));
        setPhase("select");
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  const currentWindow = useMemo(() => {
    if (!session || phase !== "select") {
      return null;
    }
    return findWindowAt(session.windows, cursor);
  }, [cursor, phase, session]);

  useEffect(() => {
    setHoverWindow(currentWindow);
  }, [currentWindow]);

  useEffect(() => {
    if (!session || !selection || !images.size || !canvasRef.current) {
      return;
    }
    drawCaptureSelection(
      canvasRef.current,
      session,
      images,
      selection,
      draft ? [...annotations, draft] : annotations,
      session.captureCursor,
    );
  }, [annotations, draft, images, selection, session]);

  const commit = useCallback(
    async (operation: CommitOperation, targetSelection = selection) => {
      if (!session || !targetSelection || busy) {
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const finalCanvas = document.createElement("canvas");
        const originalCanvas = document.createElement("canvas");
        const finalSize = drawCaptureSelection(
          finalCanvas,
          session,
          images,
          targetSelection,
          annotations,
          session.captureCursor,
        );
        drawCaptureSelection(
          originalCanvas,
          session,
          images,
          targetSelection,
          [],
          session.captureCursor,
        );
        const [finalImage, originalImage] = await Promise.all([
          canvasToPng(finalCanvas),
          canvasToPng(originalCanvas),
        ]);
        await window.toolbox.commitCapture({
          sessionId,
          operation,
          selection: targetSelection,
          finalImage,
          originalImage,
          width: finalSize.width,
          height: finalSize.height,
        });
      } catch (commitError) {
        setError(errorMessage(commitError));
        setBusy(false);
      }
    },
    [annotations, busy, images, selection, session, sessionId],
  );

  const finishSelection = useCallback(
    (nextSelection: Rectangle) => {
      if (nextSelection.width < 4 || nextSelection.height < 4) {
        return;
      }
      setSelection(nextSelection);
      setPhase("editor");
      if (session?.autoCopy && !autoCopyStarted.current) {
        autoCopyStarted.current = true;
        void commit("copy", nextSelection);
      }
    },
    [commit, session?.autoCopy],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (textPoint) {
          setTextPoint(null);
        } else {
          void window.toolbox.cancelCapture(sessionId);
        }
      }
      if (phase !== "editor") {
        return;
      }
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        void commit("copy-original");
      } else if (event.ctrlKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        void commit("copy");
      } else if (event.ctrlKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void commit("save");
      } else if (event.ctrlKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          setRedoStack((redo) => {
            const restored = redo.at(-1);
            if (restored) {
              setAnnotations((current) => [...current, restored]);
              return redo.slice(0, -1);
            }
            return redo;
          });
        } else {
          setAnnotations((current) => {
            const removed = current.at(-1);
            if (removed) {
              setRedoStack((redo) => [...redo, removed]);
              return current.slice(0, -1);
            }
            return current;
          });
        }
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedAnnotation
      ) {
        event.preventDefault();
        setAnnotations((current) =>
          current.filter((annotation) => annotation.id !== selectedAnnotation),
        );
        setSelectedAnnotation(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commit, phase, selectedAnnotation, sessionId, textPoint]);

  const pointFromEvent = (event: React.PointerEvent): Point => ({
    x: event.clientX,
    y: event.clientY,
  });

  const rootPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = pointFromEvent(event);
    setCursor(point);
    if (!interaction || !session || !selection) {
      return;
    }
    if (interaction.type === "drag") {
      setSelection(
        clampRectangle(
          normalizeRect(interaction.start, point),
          { x: 0, y: 0, width: session.virtualBounds.width, height: session.virtualBounds.height },
        ),
      );
    } else if (interaction.type === "move") {
      const delta = {
        x: point.x - interaction.start.x,
        y: point.y - interaction.start.y,
      };
      const moved = {
        ...interaction.initial,
        x: interaction.initial.x + delta.x,
        y: interaction.initial.y + delta.y,
      };
      setSelection(
        clampRectangle(moved, {
          x: 0,
          y: 0,
          width: session.virtualBounds.width,
          height: session.virtualBounds.height,
        }, true),
      );
    } else if (interaction.type === "resize") {
      setSelection(
        resizeRectangle(
          interaction.initial,
          interaction.handle,
          point,
          {
            x: 0,
            y: 0,
            width: session.virtualBounds.width,
            height: session.virtualBounds.height,
          },
        ),
      );
    }
  };

  const rootPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interaction) {
      return;
    }
    const point = pointFromEvent(event);
    if (interaction.type === "drag") {
      const rect = clampRectangle(
        normalizeRect(interaction.start, point),
        { x: 0, y: 0, width: session?.virtualBounds.width ?? 0, height: session?.virtualBounds.height ?? 0 },
      );
      setInteraction(null);
      setSelection(null);
      if (rect.width >= 5 && rect.height >= 5) {
        finishSelection(rect);
      } else {
        const target = session ? findWindowAt(session.windows, point) : null;
        if (clickTimer.current) {
          window.clearTimeout(clickTimer.current);
        }
        clickTimer.current = window.setTimeout(() => {
          if (target) {
            finishSelection(
              clampRectangle(target.localBounds, {
                x: 0,
                y: 0,
                width: session?.virtualBounds.width ?? 0,
                height: session?.virtualBounds.height ?? 0,
              }),
            );
          }
          clickTimer.current = null;
        }, 220);
      }
      return;
    }
    setInteraction(null);
  };

  const beginAnnotation = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!selection || event.button !== 0) {
      return;
    }
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === "select") {
      const hit = [...annotations].reverse().find((annotation) =>
        hitTestAnnotation(annotation, point),
      );
      if (hit) {
        setSelectedAnnotation(hit.id);
      } else {
        setSelectedAnnotation(null);
        setInteraction({
          type: "move",
          start: pointFromEvent(event),
          initial: selection,
        });
      }
      return;
    }

    if (tool === "text") {
      setSelectedAnnotation(null);
      setTextPoint(point);
      return;
    }

    const id = crypto.randomUUID();
    const base = { id, color, strokeWidth };
    let next: Annotation;
    if (tool === "rectangle" || tool === "ellipse" || tool === "mosaic") {
      next = {
        ...base,
        type: tool,
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
        ...(tool === "mosaic" ? { blockSize: 12 } : {}),
      } as Annotation;
    } else if (tool === "arrow") {
      next = { ...base, type: "arrow", x1: point.x, y1: point.y, x2: point.x, y2: point.y };
    } else {
      next = { ...base, type: "pen", points: [point] };
    }
    setDraft(next);
  };

  const moveAnnotation = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draft) {
      return;
    }
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    setDraft(updateDraft(draft, point));
  };

  const finishAnnotation = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draft) {
      return;
    }
    event.stopPropagation();
    const hasSize =
      (("width" in draft && (draft.width >= 2 || draft.height >= 2)) ||
        ("x2" in draft &&
          Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) >= 2) ||
        (draft.type === "pen" && draft.points.length >= 2));
    if (hasSize) {
      setAnnotations((current) => [...current, draft]);
      setRedoStack([]);
    }
    setDraft(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const beginResize = (event: React.PointerEvent, handle: Handle) => {
    event.stopPropagation();
    if (!selection) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setInteraction({
      type: "resize",
      handle,
      start: pointFromEvent(event),
      initial: selection,
    });
  };

  if (!session) {
    return (
      <div className="capture-loading">
        <span className="spinner" />
        <strong>{error ?? "正在冻结画面…"}</strong>
      </div>
    );
  }

  const toolbarTop =
    selection && selection.y + selection.height + 70 < session.virtualBounds.height
      ? selection.y + selection.height + 12
      : Math.max(12, (selection?.y ?? 0) - 60);
  const toolbarLeft = Math.max(
    12,
    Math.min(
      session.virtualBounds.width - 650,
      selection ? selection.x + selection.width - 480 : 12,
    ),
  );
  const activeWindow = phase === "select" ? hoverWindow : null;

  return (
    <div
      className={`capture-overlay ${phase}`}
      onPointerMove={rootPointerMove}
      onPointerUp={rootPointerUp}
      onPointerLeave={() => setHoverWindow(null)}
      onDoubleClick={(event) => {
        if (phase !== "select") {
          return;
        }
        if (clickTimer.current) {
          window.clearTimeout(clickTimer.current);
          clickTimer.current = null;
        }
        const display = session.displays.find((candidate) =>
          containsPoint(candidate.localBounds, { x: event.clientX, y: event.clientY }),
        );
        if (display) {
          finishSelection(display.localBounds);
        }
      }}
      onPointerDown={(event) => {
        if (phase !== "select" || event.button !== 0) {
          return;
        }
        const point = pointFromEvent(event);
        setInteraction({ type: "drag", start: point });
        setSelection(null);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
    >
      <div className="frozen-screen">
        {session.displays.map((display) => (
          <img
            key={display.id}
            src={display.imageUrl}
            crossOrigin="anonymous"
            alt=""
            draggable={false}
            style={{
              left: display.localBounds.x,
              top: display.localBounds.y,
              width: display.localBounds.width,
              height: display.localBounds.height,
            }}
          />
        ))}
      </div>

      {selection ? (
        <ShadeAround selection={selection} session={session} />
      ) : (
        <div className="capture-dim" />
      )}

      {activeWindow && (
        <div
          className="window-highlight"
          style={{
            left: activeWindow.localBounds.x,
            top: activeWindow.localBounds.y,
            width: activeWindow.localBounds.width,
            height: activeWindow.localBounds.height,
          }}
        >
          <span>{activeWindow.title}</span>
        </div>
      )}

      {phase === "select" && (
        <>
          <div className="crosshair-x" style={{ top: cursor.y }} />
          <div className="crosshair-y" style={{ left: cursor.x }} />
          <Magnifier session={session} images={images} point={cursor} />
          <div className="capture-instruction">
            <span>拖动选择区域</span>
            <i />
            <span>单击选择窗口</span>
            <i />
            <span>双击截取整屏</span>
            <kbd>Esc 取消</kbd>
          </div>
        </>
      )}

      {selection && phase === "editor" && (
        <>
          <div
            className="selection-frame"
            style={{
              left: selection.x,
              top: selection.y,
              width: selection.width,
              height: selection.height,
            }}
          >
            <span className="selection-size">
              {Math.round(selection.width)} × {Math.round(selection.height)}
            </span>
            {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as Handle[]).map(
              (handle) => (
                <button
                  key={handle}
                  className={`resize-handle ${handle}`}
                  aria-label={`调整 ${handle}`}
                  onPointerDown={(event) => beginResize(event, handle)}
                />
              ),
            )}
            <canvas
              ref={canvasRef}
              className="annotation-canvas"
              style={{ width: selection.width, height: selection.height }}
              onPointerDown={beginAnnotation}
              onPointerMove={moveAnnotation}
              onPointerUp={finishAnnotation}
            />
            {textPoint && (
              <input
                className="text-entry"
                autoFocus
                style={{
                  left: textPoint.x,
                  top: textPoint.y,
                  color,
                  fontSize: 18,
                }}
                onBlur={(event) => {
                  if (event.currentTarget.value.trim()) {
                    addTextAnnotation(
                      event.currentTarget.value,
                      textPoint,
                      color,
                      strokeWidth,
                      setAnnotations,
                    );
                    setRedoStack([]);
                  }
                  setTextPoint(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.blur();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    event.currentTarget.value = "";
                    event.currentTarget.blur();
                  }
                }}
              />
            )}
          </div>

          <div
            className="annotation-toolbar"
            style={{ left: toolbarLeft, top: toolbarTop }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="tool-group">
              {tools.map((item) => (
                <button
                  key={item.id}
                  className={tool === item.id ? "active" : ""}
                  title={item.label}
                  onClick={() => setTool(item.id)}
                >
                  <Icon name={item.icon} size={17} />
                </button>
              ))}
            </div>
            <span className="toolbar-separator" />
            <div className="color-group">
              {["#ff6b57", "#ffc341", "#4bd39a", "#58a6ff", "#ffffff", "#111111"].map(
                (item) => (
                  <button
                    key={item}
                    className={color === item ? "active" : ""}
                    style={{ background: item }}
                    title={item}
                    onClick={() => setColor(item)}
                  />
                ),
              )}
            </div>
            <input
              className="stroke-range"
              type="range"
              min="1"
              max="10"
              value={strokeWidth}
              title={`粗细 ${strokeWidth}`}
              onChange={(event) => setStrokeWidth(Number(event.target.value))}
            />
            <span className="toolbar-separator" />
            <button
              title="撤销 Ctrl+Z"
              disabled={annotations.length === 0}
              onClick={() => {
                setAnnotations((current) => {
                  const removed = current.at(-1);
                  if (removed) {
                    setRedoStack((redo) => [...redo, removed]);
                    return current.slice(0, -1);
                  }
                  return current;
                });
              }}
            >
              <Icon name="undo" size={17} />
            </button>
            <button
              title="重做 Ctrl+Shift+Z"
              disabled={redoStack.length === 0}
              onClick={() => {
                setRedoStack((redo) => {
                  const restored = redo.at(-1);
                  if (restored) {
                    setAnnotations((current) => [...current, restored]);
                    return redo.slice(0, -1);
                  }
                  return redo;
                });
              }}
            >
              <Icon name="redo" size={17} />
            </button>
            <button
              title="删除选中标注"
              disabled={!selectedAnnotation}
              onClick={() => {
                setAnnotations((current) =>
                  current.filter((annotation) => annotation.id !== selectedAnnotation),
                );
                setSelectedAnnotation(null);
              }}
            >
              <Icon name="trash" size={17} />
            </button>
            <span className="toolbar-separator" />
            <button className="toolbar-secondary" onClick={() => void commit("copy-original")}>
              原图
            </button>
            <button className="toolbar-secondary" onClick={() => void commit("save")}>
              <Icon name="save" size={16} /> 保存
            </button>
            <button className="toolbar-secondary" onClick={() => void commit("pin")}>
              <Icon name="pin" size={16} /> 贴图
            </button>
            <button className="toolbar-primary" onClick={() => void commit("copy")}>
              <Icon name="check" size={16} /> 复制
            </button>
            <button
              className="toolbar-close"
              title="取消 Esc"
              onClick={() => void window.toolbox.cancelCapture(sessionId)}
            >
              <Icon name="close" size={17} />
            </button>
          </div>

          {error && <div className="capture-error">{error}</div>}
          {busy && (
            <div className="capture-busy">
              <span className="spinner" />
              正在处理截图…
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ShadeAround({
  selection,
  session,
}: {
  selection: Rectangle;
  session: CaptureSession;
}) {
  const right = session.virtualBounds.width - selection.x - selection.width;
  const bottom = session.virtualBounds.height - selection.y - selection.height;
  return (
    <>
      <div className="shade" style={{ left: 0, top: 0, width: "100%", height: selection.y }} />
      <div
        className="shade"
        style={{
          left: 0,
          top: selection.y,
          width: selection.x,
          height: selection.height,
        }}
      />
      <div
        className="shade"
        style={{
          left: selection.x + selection.width,
          top: selection.y,
          width: right,
          height: selection.height,
        }}
      />
      <div
        className="shade"
        style={{
          left: 0,
          top: selection.y + selection.height,
          width: "100%",
          height: bottom,
        }}
      />
    </>
  );
}

function Magnifier({
  session,
  images,
  point,
}: {
  session: CaptureSession;
  images: CaptureImageMap;
  point: Point;
}) {
  const display = session.displays.find((candidate) =>
    containsPoint(candidate.localBounds, point),
  );
  const image = display ? images.get(display.id) : null;

  if (!display || !image) {
    return null;
  }
  const zoom = 8;
  const localX = point.x - display.localBounds.x;
  const localY = point.y - display.localBounds.y;
  const backgroundX = 66 - localX * zoom;
  const backgroundY = 46 - localY * zoom;
  const left = Math.min(session.virtualBounds.width - 190, point.x + 20);
  const top = Math.min(session.virtualBounds.height - 140, point.y + 20);
  return (
    <div className="magnifier" style={{ left, top }}>
      <div
        className="magnifier-preview"
        style={{
          backgroundImage: `url("${display.imageUrl}")`,
          backgroundSize: `${display.localBounds.width * zoom}px ${display.localBounds.height * zoom}px`,
          backgroundPosition: `${backgroundX}px ${backgroundY}px`,
        }}
      />
      <div>
        <span>
          {Math.round(point.x + session.virtualBounds.x)},{" "}
          {Math.round(point.y + session.virtualBounds.y)}
        </span>
      </div>
    </div>
  );
}

function findWindowAt(windows: WindowTarget[], point: Point): WindowTarget | null {
  return (
    windows.find((window) => containsPoint(window.localBounds, point)) ?? null
  );
}

function clampRectangle(
  rect: Rectangle,
  bounds: Rectangle,
  keepSize = false,
): Rectangle {
  const width = Math.min(Math.max(1, rect.width), bounds.width);
  const height = Math.min(Math.max(1, rect.height), bounds.height);
  return {
    x: Math.max(bounds.x, Math.min(bounds.x + bounds.width - width, rect.x)),
    y: Math.max(bounds.y, Math.min(bounds.y + bounds.height - height, rect.y)),
    width: keepSize ? width : Math.max(1, Math.min(width, bounds.x + bounds.width - rect.x)),
    height: keepSize ? height : Math.max(1, Math.min(height, bounds.y + bounds.height - rect.y)),
  };
}

function resizeRectangle(
  rect: Rectangle,
  handle: Handle,
  point: Point,
  bounds: Rectangle,
): Rectangle {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  if (handle.includes("w")) {
    left = point.x;
  }
  if (handle.includes("e")) {
    right = point.x;
  }
  if (handle.includes("n")) {
    top = point.y;
  }
  if (handle.includes("s")) {
    bottom = point.y;
  }
  const next = normalizeRect(
    { x: Math.max(bounds.x, Math.min(bounds.x + bounds.width, left)), y: Math.max(bounds.y, Math.min(bounds.y + bounds.height, top)) },
    { x: Math.max(bounds.x, Math.min(bounds.x + bounds.width, right)), y: Math.max(bounds.y, Math.min(bounds.y + bounds.height, bottom)) },
  );
  return {
    ...next,
    width: Math.max(10, next.width),
    height: Math.max(10, next.height),
  };
}

function updateDraft(annotation: Annotation, point: Point): Annotation {
  if (annotation.type === "rectangle" || annotation.type === "ellipse" || annotation.type === "mosaic") {
    const normalized = normalizeRect(
      { x: annotation.x, y: annotation.y },
      point,
    );
    return { ...annotation, ...normalized };
  }
  if (annotation.type === "arrow") {
    return { ...annotation, x2: point.x, y2: point.y };
  }
  if (annotation.type === "pen") {
    return { ...annotation, points: [...annotation.points, point] };
  }
  return annotation;
}

function hitTestAnnotation(annotation: Annotation, point: Point): boolean {
  if (
    annotation.type === "rectangle" ||
    annotation.type === "ellipse" ||
    annotation.type === "mosaic"
  ) {
    return (
      point.x >= annotation.x &&
      point.y >= annotation.y &&
      point.x <= annotation.x + annotation.width &&
      point.y <= annotation.y + annotation.height
    );
  }
  if (annotation.type === "arrow") {
    return distanceToSegment(
      point,
      { x: annotation.x1, y: annotation.y1 },
      { x: annotation.x2, y: annotation.y2 },
    ) < Math.max(8, annotation.strokeWidth * 3);
  }
  if (annotation.type === "pen") {
    return annotation.points.some(
      (item) => Math.hypot(item.x - point.x, item.y - point.y) < 10,
    );
  }
  if (annotation.type === "text") {
    return (
      point.x >= annotation.x &&
      point.y >= annotation.y &&
      point.x <= annotation.x + annotation.text.length * annotation.fontSize * 0.7 &&
      point.y <= annotation.y + annotation.fontSize * 1.5
    );
  }
  return false;
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function addTextAnnotation(
  text: string,
  point: Point,
  color: string,
  strokeWidth: number,
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>,
): void {
  setAnnotations((current) => [
    ...current,
    {
      id: crypto.randomUUID(),
      type: "text",
      x: point.x,
      y: point.y,
      text,
      fontSize: Math.max(16, strokeWidth * 6),
      color,
      strokeWidth,
    },
  ]);
}

