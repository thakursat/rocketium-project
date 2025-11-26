import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createComment, getDesign, updateDesign } from "../api/designs";
import type { ApiError } from "../api/client";
import { useAppSelector } from "../hooks/store";
import type { Comment, DesignDetail, DesignElement } from "../types/design";

const DEFAULT_CANVAS_SIZE = 1080;

export default function DesignEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, user } = useAppSelector((state) => state.auth);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [designMeta, setDesignMeta] = useState<DesignDetail | null>(null);
  const [elements, setElements] = useState<DesignElement[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(
    null
  );
  const [draftName, setDraftName] = useState("");
  const [draftIsPublic, setDraftIsPublic] = useState(false);
  const [draftWidth, setDraftWidth] = useState(DEFAULT_CANVAS_SIZE);
  const [draftHeight, setDraftHeight] = useState(DEFAULT_CANVAS_SIZE);
  const [version, setVersion] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const [canvasScale, setCanvasScale] = useState(1);
  const dragRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    pointerId: number;
    moved: boolean;
    target: HTMLElement | null;
  } | null>(null);

  useEffect(() => {
    if (!draftWidth || !draftHeight) {
      return;
    }
    const handleResize = () => {
      if (!stageRef.current) return;
      const padding = 48;
      const availableWidth = stageRef.current.clientWidth - padding;
      const availableHeight = stageRef.current.clientHeight - padding;
      const scale = Math.min(
        availableWidth / draftWidth,
        availableHeight / draftHeight,
        1
      );
      setCanvasScale(Number.isFinite(scale) && scale > 0 ? scale : 1);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [draftWidth, draftHeight]);

  useEffect(() => {
    if (!id || !token) {
      return;
    }
    setLoading(true);
    setError(null);
    getDesign(id, token)
      .then((response) => {
        const detail = response.design;
        const sortedElements = normalizeElements(sortByZIndex(detail.elements));
        setDesignMeta(detail);
        setElements(sortedElements);
        setComments(response.comments);
        setDraftName(detail.name);
        setDraftIsPublic(detail.isPublic);
        setDraftWidth(detail.width);
        setDraftHeight(detail.height);
        setVersion(detail.version);
        setLastSavedAt(detail.lastSavedAt ?? detail.updatedAt ?? null);
        setSelectedElementId(
          sortedElements[sortedElements.length - 1]?.id ?? null
        );
        setIsDirty(false);
      })
      .catch((err) => {
        const apiError = err as ApiError;
        if (apiError?.code === "DESIGN_NOT_FOUND") {
          navigate("/designs");
          return;
        }
        setError(apiError?.message ?? "Unable to load design");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id, navigate, token]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }
      event.preventDefault();
      const deltaX = (event.clientX - drag.startClientX) / canvasScale;
      const deltaY = (event.clientY - drag.startClientY) / canvasScale;
      let changed = false;
      setElements((prev) =>
        prev.map((element) => {
          if (element.id !== drag.id) {
            return element;
          }
          const { width, height } = getElementSize(element);
          const nextX = clamp(drag.startX + deltaX, -width, draftWidth);
          const nextY = clamp(drag.startY + deltaY, -height, draftHeight);
          if (
            Math.abs(nextX - element.x) > 0.25 ||
            Math.abs(nextY - element.y) > 0.25
          ) {
            changed = true;
            return { ...element, x: nextX, y: nextY };
          }
          return element;
        })
      );
      if (changed && dragRef.current && !dragRef.current.moved) {
        dragRef.current.moved = true;
        setIsDirty(true);
      }
    };

    const handlePointerEnd = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      drag.target?.releasePointerCapture?.(drag.pointerId);
      dragRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [canvasScale, draftWidth, draftHeight]);

  const selectedElement = useMemo(
    () => elements.find((element) => element.id === selectedElementId) ?? null,
    [elements, selectedElementId]
  );

  const handleElementSelection = (id: string) => {
    setSelectedElementId(id);
  };

  const handleElementPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    element: DesignElement
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (dragRef.current) {
      dragRef.current.target?.releasePointerCapture?.(
        dragRef.current.pointerId
      );
    }
    setSelectedElementId(element.id);
    const target = event.currentTarget;
    try {
      target.setPointerCapture(event.pointerId);
    } catch (err) {
      // Pointer capture might not be supported; safe to ignore.
    }
    dragRef.current = {
      id: element.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: element.x,
      startY: element.y,
      pointerId: event.pointerId,
      moved: false,
      target,
    };
  };

  const applyElementsUpdate = (
    updater: (previous: DesignElement[]) => DesignElement[]
  ) => {
    setElements((prev) => {
      const next = normalizeElements(updater([...prev]));
      if (
        selectedElementId &&
        !next.some((element) => element.id === selectedElementId)
      ) {
        setSelectedElementId(next[next.length - 1]?.id ?? null);
      }
      setIsDirty(true);
      return next;
    });
  };

  const handleElementChange = <K extends keyof DesignElement>(
    id: string,
    key: K,
    value: DesignElement[K]
  ) => {
    applyElementsUpdate((prev) =>
      prev.map((element) =>
        element.id === id ? { ...element, [key]: value } : element
      )
    );
  };

  const handleAddElement = (
    type: DesignElement["type"],
    extra?: Partial<DesignElement>
  ) => {
    const newId = crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    const defaultWidth = type === "text" ? 360 : 220;
    const defaultHeight = type === "text" ? 120 : 220;
    const element: DesignElement = {
      id: newId,
      name: `${capitalize(type)} ${elements.length + 1}`,
      type,
      x: 0,
      y: 0,
      width: defaultWidth,
      height: defaultHeight,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: elements.length,
      fill: type === "shape" ? "#2563eb" : "#1f2933",
      stroke: undefined,
      strokeWidth: undefined,
      opacity: 1,
      fontFamily: type === "text" ? "Inter, sans-serif" : undefined,
      fontSize: type === "text" ? 48 : undefined,
      text: type === "text" ? "New heading" : undefined,
      align: type === "text" ? "left" : undefined,
      imageUrl: undefined,
      shapeType: type === "shape" ? "rect" : undefined,
      metadata: {},
      ...extra,
    };

    const width = element.width ?? defaultWidth;
    const height = element.height ?? defaultHeight;
    const baseX = Math.max(draftWidth / 2 - width / 2, 0);
    const baseY = Math.max(draftHeight / 2 - height / 2, 0);
    element.x = baseX;
    element.y = baseY;

    applyElementsUpdate((prev) => [...prev, element]);
    setSelectedElementId(element.id);
  };

  const handleAddImage = () => {
    const url = window.prompt("Image URL");
    if (!url) return;
    handleAddElement("image", {
      imageUrl: url,
      width: 320,
      height: 240,
      fill: undefined,
    });
  };

  const handleDeleteElement = (id: string) => {
    applyElementsUpdate((prev) => prev.filter((element) => element.id !== id));
  };

  const handleReorderElement = (id: string, direction: "up" | "down") => {
    applyElementsUpdate((prev) => {
      const next = [...prev];
      const index = next.findIndex((element) => element.id === id);
      if (index === -1) {
        return next;
      }
      const targetIndex = direction === "up" ? index + 1 : index - 1;
      if (targetIndex < 0 || targetIndex >= next.length) {
        return next;
      }
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  };

  const handleSave = async () => {
    if (!token || !id || !designMeta) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: draftName.trim(),
        width: draftWidth,
        height: draftHeight,
        elements,
        version,
        isPublic: draftIsPublic,
      };
      const response = await updateDesign(id, payload, token);
      const detail = response.design;
      setDesignMeta(detail);
      const normalized = normalizeElements(sortByZIndex(detail.elements));
      setElements(normalized);
      setDraftName(detail.name);
      setDraftIsPublic(detail.isPublic);
      setDraftWidth(detail.width);
      setDraftHeight(detail.height);
      setVersion(detail.version);
      setLastSavedAt(detail.lastSavedAt ?? detail.updatedAt ?? null);
      setIsDirty(false);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message ?? "Unable to save design");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !id || !commentInput.trim()) {
      return;
    }
    setCommentSubmitting(true);
    setCommentError(null);
    try {
      const result = await createComment(
        id,
        {
          message: commentInput.trim(),
        },
        token
      );
      setComments((prev) => [...prev, result.comment]);
      setCommentInput("");
    } catch (err) {
      const apiError = err as ApiError;
      setCommentError(apiError?.message ?? "Unable to post comment");
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleTogglePublic = (isPublic: boolean) => {
    setDraftIsPublic(isPublic);
    setIsDirty(true);
  };

  const handleNameChange = (event: FormEvent<HTMLInputElement>) => {
    setDraftName(event.currentTarget.value);
    setIsDirty(true);
  };

  const handleSizeChange = (dimension: "width" | "height", value: number) => {
    if (!Number.isFinite(value) || value <= 0) {
      return;
    }
    if (dimension === "width") {
      setDraftWidth(value);
    } else {
      setDraftHeight(value);
    }
    setIsDirty(true);
  };

  const sortedLayers = useMemo(
    () => [...elements].slice().reverse(),
    [elements]
  );

  if (!id) {
    return <p className="page">Design not found.</p>;
  }

  if (loading) {
    return (
      <div className="page">
        <p>Loading design…</p>
      </div>
    );
  }

  if (!designMeta) {
    return (
      <div className="page">
        <p>Failed to load design.</p>
      </div>
    );
  }

  return (
    <div className="editor-page">
      <header className="editor-topbar">
        <div className="editor-topbar-left">
          <input
            className="editor-name-input"
            value={draftName}
            onChange={handleNameChange}
            placeholder="Design name"
          />
          <div className="editor-meta">
            <span>
              Last saved:{" "}
              {lastSavedAt ? new Date(lastSavedAt).toLocaleString() : "Unsaved"}
            </span>
            <span>Version {version}</span>
          </div>
        </div>
        <div className="editor-topbar-actions">
          <div className="editor-visibility-toggle">
            <label>
              <input
                type="radio"
                name="visibility"
                value="private"
                checked={!draftIsPublic}
                onChange={() => handleTogglePublic(false)}
              />
              <span>Private</span>
            </label>
            <label>
              <input
                type="radio"
                name="visibility"
                value="public"
                checked={draftIsPublic}
                onChange={() => handleTogglePublic(true)}
              />
              <span>Public</span>
            </label>
          </div>
          <div className="editor-add-group">
            <button onClick={() => handleAddElement("text")}>Add text</button>
            <button
              onClick={() => handleAddElement("shape", { shapeType: "rect" })}
            >
              Add rectangle
            </button>
            <button
              onClick={() => handleAddElement("shape", { shapeType: "circle" })}
            >
              Add circle
            </button>
            <button onClick={handleAddImage}>Add image</button>
          </div>
          <button
            className="primary"
            onClick={handleSave}
            disabled={saving || !isDirty}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </header>
      {error && <div className="page-error editor-error">{error}</div>}
      <div className="editor-body">
        <aside className="layers-panel">
          <header>
            <h3>Layers</h3>
            <p>Manage order, selection, and visibility.</p>
          </header>
          <ul>
            {sortedLayers.map((element) => {
              const isSelected = element.id === selectedElementId;
              return (
                <li
                  key={element.id}
                  className={isSelected ? "layer-item selected" : "layer-item"}
                >
                  <button
                    className="layer-select"
                    onClick={() => handleElementSelection(element.id)}
                  >
                    <span className="layer-name">{element.name}</span>
                    <span className="layer-type">
                      {formatElementType(element)}
                    </span>
                  </button>
                  <div className="layer-actions">
                    <button
                      onClick={() => handleReorderElement(element.id, "up")}
                      aria-label="Bring forward"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => handleReorderElement(element.id, "down")}
                      aria-label="Send backward"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => handleDeleteElement(element.id)}
                      aria-label="Delete layer"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
            {elements.length === 0 && (
              <li className="layer-empty">
                No layers yet. Add your first element.
              </li>
            )}
          </ul>
        </aside>
        <main className="editor-canvas-area" ref={stageRef}>
          <div
            className="editor-canvas-wrapper"
            style={{
              width: draftWidth,
              height: draftHeight,
              transform: `scale(${canvasScale})`,
            }}
          >
            <div
              className="editor-canvas"
              style={{ width: draftWidth, height: draftHeight }}
              onClick={() => setSelectedElementId(null)}
            >
              {elements.map((element) => (
                <CanvasElement
                  key={element.id}
                  element={element}
                  isSelected={element.id === selectedElementId}
                  onPointerDown={(event) =>
                    handleElementPointerDown(event, element)
                  }
                  onKeyboardSelect={() => handleElementSelection(element.id)}
                />
              ))}
            </div>
          </div>
        </main>
        <aside className="editor-right-panel">
          <section className="inspector-panel">
            <header>
              <h3>
                {selectedElement ? selectedElement.name : "Design settings"}
              </h3>
            </header>
            <div className="inspector-content">
              {selectedElement ? (
                <ElementInspector
                  element={selectedElement}
                  onChange={handleElementChange}
                />
              ) : (
                <DesignInspector
                  width={draftWidth}
                  height={draftHeight}
                  onSizeChange={handleSizeChange}
                />
              )}
            </div>
          </section>
          <section className="comments-panel">
            <header>
              <h3>Comments</h3>
            </header>
            <div className="comments-list">
              {comments.length === 0 ? (
                <p className="comments-empty">No comments yet.</p>
              ) : (
                comments.map((comment) => (
                  <article key={comment._id} className="comment">
                    <header>
                      <strong>{comment.authorName}</strong>
                      <span>
                        {new Date(comment.createdAt).toLocaleString()}
                      </span>
                    </header>
                    <p>{comment.message}</p>
                  </article>
                ))
              )}
            </div>
            <form className="comment-form" onSubmit={handleSubmitComment}>
              <label>
                <span>Add a comment</span>
                <textarea
                  value={commentInput}
                  onChange={(event) => setCommentInput(event.target.value)}
                  placeholder="Share feedback…"
                  rows={3}
                  disabled={commentSubmitting}
                />
              </label>
              {commentError && (
                <div className="comment-error">{commentError}</div>
              )}
              <button
                type="submit"
                className="primary"
                disabled={commentSubmitting || !commentInput.trim()}
              >
                {commentSubmitting ? "Posting…" : "Post comment"}
              </button>
            </form>
          </section>
        </aside>
      </div>
    </div>
  );
}

interface CanvasElementProps {
  element: DesignElement;
  isSelected: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onKeyboardSelect: () => void;
}

function CanvasElement({
  element,
  isSelected,
  onPointerDown,
  onKeyboardSelect,
}: CanvasElementProps) {
  const style: CSSProperties = {
    position: "absolute",
    left: element.x,
    top: element.y,
    width: element.width ?? (element.type === "text" ? 360 : 200),
    height: element.height ?? (element.type === "text" ? 120 : 200),
    transform: `rotate(${element.rotation ?? 0}deg)`,
    transformOrigin: "top left",
    zIndex: element.zIndex,
    opacity: element.opacity ?? 1,
    border: isSelected ? "2px solid #2563eb" : "1px solid transparent",
    boxShadow: isSelected
      ? "0 0 0 4px rgba(37, 99, 235, 0.25)"
      : "0 4px 24px rgba(15, 23, 42, 0.12)",
    borderRadius:
      element.type === "shape" && element.shapeType === "circle"
        ? "9999px"
        : "0.75rem",
    overflow: "hidden",
    cursor: "grab",
    background: element.type === "text" ? "white" : undefined,
    userSelect: "none",
    WebkitUserSelect: "none",
    touchAction: "none",
  };

  let content: ReactNode = null;

  if (element.type === "text") {
    content = (
      <div
        style={{
          width: "100%",
          height: "100%",
          color: element.fill ?? "#111827",
          fontFamily: element.fontFamily ?? "Inter, sans-serif",
          fontSize: element.fontSize ?? 48,
          display: "flex",
          alignItems: "center",
          justifyContent:
            element.align === "center"
              ? "center"
              : element.align === "right"
              ? "flex-end"
              : "flex-start",
          padding: "12px",
          textAlign: element.align ?? "left",
          whiteSpace: "pre-wrap",
        }}
      >
        {element.text ?? "Text"}
      </div>
    );
  } else if (element.type === "image") {
    content = (
      <img
        src={element.imageUrl ?? ""}
        alt={element.name}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
  } else {
    content = (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: element.fill ?? "#2563eb",
          border: element.stroke
            ? `${element.strokeWidth ?? 2}px solid ${element.stroke}`
            : "none",
        }}
      />
    );
  }

  return (
    <div
      style={style}
      onPointerDown={onPointerDown}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onKeyboardSelect();
        }
      }}
      role="button"
      tabIndex={0}
      draggable={false}
      aria-pressed={isSelected}
    >
      {content}
    </div>
  );
}

interface ElementInspectorProps {
  element: DesignElement;
  onChange: <K extends keyof DesignElement>(
    id: string,
    key: K,
    value: DesignElement[K]
  ) => void;
}

function ElementInspector({ element, onChange }: ElementInspectorProps) {
  const handleNumericChange = <K extends keyof DesignElement>(
    key: K,
    value: string,
    fallback?: number
  ) => {
    const parsed = Number(value);
    const resolved = Number.isFinite(parsed) ? parsed : fallback ?? 0;
    onChange(element.id, key, resolved as DesignElement[K]);
  };

  return (
    <div className="inspector-section">
      <label>
        Name
        <input
          type="text"
          value={element.name}
          onChange={(event) => onChange(element.id, "name", event.target.value)}
        />
      </label>
      <div className="inspector-grid">
        <label>
          X
          <input
            type="number"
            value={Math.round(element.x)}
            onChange={(event) => handleNumericChange("x", event.target.value)}
          />
        </label>
        <label>
          Y
          <input
            type="number"
            value={Math.round(element.y)}
            onChange={(event) => handleNumericChange("y", event.target.value)}
          />
        </label>
        <label>
          Width
          <input
            type="number"
            value={Math.round(element.width ?? 200)}
            onChange={(event) =>
              handleNumericChange(
                "width",
                event.target.value,
                element.width ?? 200
              )
            }
          />
        </label>
        <label>
          Height
          <input
            type="number"
            value={Math.round(element.height ?? 200)}
            onChange={(event) =>
              handleNumericChange(
                "height",
                event.target.value,
                element.height ?? 200
              )
            }
          />
        </label>
        <label>
          Rotation
          <input
            type="number"
            value={Math.round(element.rotation ?? 0)}
            onChange={(event) =>
              handleNumericChange("rotation", event.target.value, 0)
            }
          />
        </label>
        <label>
          Opacity
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={element.opacity ?? 1}
            onChange={(event) =>
              handleNumericChange("opacity", event.target.value, 1)
            }
          />
        </label>
      </div>
      {element.type === "text" && (
        <>
          <label>
            Text
            <textarea
              value={element.text ?? ""}
              onChange={(event) =>
                onChange(element.id, "text", event.target.value)
              }
              rows={3}
            />
          </label>
          <div className="inspector-grid">
            <label>
              Font size
              <input
                type="number"
                value={element.fontSize ?? 32}
                onChange={(event) =>
                  handleNumericChange("fontSize", event.target.value, 32)
                }
              />
            </label>
            <label>
              Color
              <input
                type="color"
                value={element.fill ?? "#111827"}
                onChange={(event) =>
                  onChange(element.id, "fill", event.target.value)
                }
              />
            </label>
          </div>
          <label>
            Alignment
            <select
              value={element.align ?? "left"}
              onChange={(event) =>
                onChange(
                  element.id,
                  "align",
                  event.target.value as DesignElement["align"]
                )
              }
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
        </>
      )}
      {element.type === "shape" && (
        <div className="inspector-grid">
          <label>
            Fill
            <input
              type="color"
              value={element.fill ?? "#2563eb"}
              onChange={(event) =>
                onChange(element.id, "fill", event.target.value)
              }
            />
          </label>
          <label>
            Stroke
            <input
              type="color"
              value={element.stroke ?? "#1f2933"}
              onChange={(event) =>
                onChange(element.id, "stroke", event.target.value)
              }
            />
          </label>
          <label>
            Stroke width
            <input
              type="number"
              value={element.strokeWidth ?? 0}
              onChange={(event) =>
                handleNumericChange("strokeWidth", event.target.value, 0)
              }
            />
          </label>
          <label>
            Shape
            <select
              value={element.shapeType ?? "rect"}
              onChange={(event) =>
                onChange(
                  element.id,
                  "shapeType",
                  event.target.value as DesignElement["shapeType"]
                )
              }
            >
              <option value="rect">Rectangle</option>
              <option value="circle">Circle</option>
            </select>
          </label>
        </div>
      )}
      {element.type === "image" && (
        <label>
          Image URL
          <input
            type="url"
            value={element.imageUrl ?? ""}
            onChange={(event) =>
              onChange(element.id, "imageUrl", event.target.value)
            }
          />
        </label>
      )}
    </div>
  );
}

interface DesignInspectorProps {
  width: number;
  height: number;
  onSizeChange: (dimension: "width" | "height", value: number) => void;
}

function DesignInspector({
  width,
  height,
  onSizeChange,
}: DesignInspectorProps) {
  return (
    <div className="inspector-section">
      <p className="inspector-hint">
        Adjust the canvas dimensions to match your export target. Ensure layers
        remain within the new bounds.
      </p>
      <div className="inspector-grid">
        <label>
          Width
          <input
            type="number"
            value={width}
            onChange={(event) =>
              onSizeChange("width", Number(event.target.value))
            }
            min={320}
            max={3840}
          />
        </label>
        <label>
          Height
          <input
            type="number"
            value={height}
            onChange={(event) =>
              onSizeChange("height", Number(event.target.value))
            }
            min={320}
            max={3840}
          />
        </label>
      </div>
    </div>
  );
}

function normalizeElements(elements: DesignElement[]) {
  return elements.map((element, index) => ({
    ...element,
    zIndex: index,
  }));
}

function sortByZIndex(elements: DesignElement[]) {
  return [...elements].sort((a, b) => a.zIndex - b.zIndex);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatElementType(element: DesignElement) {
  if (element.type === "shape") {
    return element.shapeType === "circle" ? "Circle" : "Rectangle";
  }
  return capitalize(element.type);
}

function getElementSize(element: DesignElement) {
  const defaultWidth = element.type === "text" ? 360 : 220;
  const defaultHeight = element.type === "text" ? 120 : 220;
  return {
    width: element.width ?? defaultWidth,
    height: element.height ?? defaultHeight,
  };
}

function clamp(value: number, min: number, max: number) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
