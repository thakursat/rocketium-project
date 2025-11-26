import {
  ChangeEvent,
  FormEvent,
  SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CSSProperties,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toPng } from "html-to-image";
import type { Socket } from "socket.io-client";
import { createComment, getDesign, updateDesign } from "../api/designs";
import type { ApiError } from "../api/client";
import { useAppSelector } from "../hooks/store";
import type { Comment, DesignDetail, DesignElement } from "../types/design";
import { getSocket } from "../lib/socket";

const MAX_HISTORY_ENTRIES = 50;

interface EditorSnapshot {
  elements: DesignElement[];
  width: number;
  height: number;
  selectedElementId: string | null;
  name: string;
  isPublic: boolean;
}

interface EditorHistory {
  past: EditorSnapshot[];
  future: EditorSnapshot[];
}

type PersistedSnapshot = Omit<EditorSnapshot, "selectedElementId">;

const DEFAULT_CANVAS_SIZE = 1080;
const MIN_ELEMENT_SIZE = 24;

type ResizeHandle =
  | "top-left"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left";

interface ResizeSession {
  type: "resize";
  handle: ResizeHandle;
  elementId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startElement: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  target: HTMLElement | null;
}

interface RotateSession {
  type: "rotate";
  elementId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  centerClientX: number;
  centerClientY: number;
  startRotation: number;
  startPointerAngle: number;
  target: HTMLElement | null;
}

type TransformSession = ResizeSession | RotateSession;

interface PresenceParticipant {
  socketId: string;
  userId: string;
  name: string;
  color?: string;
  cursor?: { x: number; y: number };
}

interface RemoteCursor {
  x: number;
  y: number;
  name: string;
  color: string;
}

interface DesignRealtimePatch {
  elements?: DesignElement[];
  selectedElementId?: string | null;
  width?: number;
  height?: number;
  name?: string;
  isPublic?: boolean;
}

interface MentionOption {
  id: string;
  name: string;
}

interface MentionEntity {
  id: string;
  label: string;
}

const PRESENCE_COLORS = [
  "#2563eb",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#0ea5e9",
  "#22c55e",
] as const;

function hashToIndex(seed: string, modulo: number) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash) % modulo;
}

function getPresenceColor(seed: string) {
  if (!seed) {
    return PRESENCE_COLORS[0];
  }
  return PRESENCE_COLORS[hashToIndex(seed, PRESENCE_COLORS.length)];
}

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
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [participants, setParticipants] = useState<PresenceParticipant[]>([]);
  const [remoteCursors, setRemoteCursors] = useState<
    Record<string, RemoteCursor>
  >({});
  const [mentionEntities, setMentionEntities] = useState<MentionEntity[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const replaceElements = useCallback(
    (nextElements: DesignElement[]) => {
      let changed = false;
      const bounded = boundElementsToCanvas(
        nextElements,
        draftWidth,
        draftHeight
      );
      setElements((prev) => {
        if (elementsAreEqual(prev, bounded)) {
          return prev;
        }
        changed = true;
        return bounded;
      });
      return changed;
    },
    [draftHeight, draftWidth]
  );

  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [canvasScale, setCanvasScale] = useState(1);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const historyRef = useRef<EditorHistory>({ past: [], future: [] });
  const historyCheckpointRef = useRef(false);
  const selectedElementIdRef = useRef<string | null>(null);
  const lastSavedSnapshotRef = useRef<PersistedSnapshot | null>(null);
  const syncHistoryState = useCallback(() => {
    const history = historyRef.current;
    setCanUndo(history.past.length > 1);
    setCanRedo(history.future.length > 0);
  }, []);
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
  const transformRef = useRef<TransformSession | null>(null);
  const recentElementInteractionRef = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const localSocketIdRef = useRef<string | null>(null);
  const applyingRemotePatchRef = useRef(false);
  const presenceMapRef = useRef<Record<string, PresenceParticipant>>({});
  const lastCursorRef = useRef<{ x: number; y: number } | null>(null);
  const pendingCommentMessageRef = useRef<string | null>(null);
  const mentionTriggerRef = useRef<{ start: number; end: number } | null>(null);

  const userColor = useMemo(
    () => getPresenceColor(user?.id ?? user?.name ?? ""),
    [user?.id, user?.name]
  );

  const mentionCatalog = useMemo(() => {
    const lookup = new Map<string, MentionOption>();

    const register = (id: string | null | undefined, name?: string | null) => {
      const trimmedName = name?.trim();
      if (!trimmedName) {
        return;
      }
      const hasId = Boolean(id && id.trim().length > 0);
      const finalId = hasId ? id!.trim() : trimmedName;
      const key = hasId ? `id:${finalId}` : `name:${trimmedName.toLowerCase()}`;
      if (lookup.has(key)) {
        return;
      }
      lookup.set(key, {
        id: finalId,
        name: trimmedName,
      });
    };

    if (designMeta?.owner) {
      register(designMeta.owner.id, designMeta.owner.name);
    }

    participants.forEach((participant) =>
      register(participant.userId, participant.name)
    );

    comments.forEach((comment) =>
      register(comment.authorId, comment.authorName)
    );

    if (user) {
      register(user.id, user.name);
    }

    const entries = Array.from(lookup.values());
    const directory = new Map<string, string>();
    entries.forEach((entry) => {
      directory.set(entry.id, entry.name);
    });

    const filteredEntries = entries.filter((entry) => {
      if (user?.id) {
        return entry.id !== user.id;
      }
      if (user?.name) {
        return entry.name.toLowerCase() !== user.name.toLowerCase();
      }
      return true;
    });

    return { options: filteredEntries, directory };
  }, [comments, designMeta, participants, user]);

  const mentionableUsers = mentionCatalog.options;
  const mentionDirectory = mentionCatalog.directory;

  const mentionOptions = useMemo(() => {
    if (mentionQuery === null) {
      return [] as MentionOption[];
    }
    const normalized = mentionQuery.toLowerCase();
    if (!normalized) {
      return mentionableUsers;
    }
    return mentionableUsers.filter((option) =>
      option.name.toLowerCase().includes(normalized)
    );
  }, [mentionQuery, mentionableUsers]);

  useEffect(() => {
    setMentionEntities((prev) => {
      const filtered = prev.filter((entity) =>
        commentInput.includes(`@${entity.label}`)
      );
      if (filtered.length === prev.length) {
        return prev;
      }
      return filtered;
    });
  }, [commentInput]);

  const broadcastDesignPatch = useCallback(
    (patch: DesignRealtimePatch) => {
      if (!socketRef.current || !id) {
        return;
      }
      if (!socketRef.current.connected) {
        return;
      }
      socketRef.current.emit("design:patch", {
        designId: id,
        actorId: user?.id ?? "anonymous",
        patch,
      });
    },
    [id, user?.id]
  );

  const emitCursor = useCallback(
    (cursor: { x: number; y: number } | null) => {
      if (!socketRef.current || !id) {
        return;
      }
      if (!socketRef.current.connected) {
        return;
      }
      if (cursor) {
        const last = lastCursorRef.current;
        if (
          last &&
          Math.abs(last.x - cursor.x) < 0.5 &&
          Math.abs(last.y - cursor.y) < 0.5
        ) {
          return;
        }
        lastCursorRef.current = cursor;
      } else {
        lastCursorRef.current = null;
      }
      socketRef.current.emit("design:cursor", {
        designId: id,
        cursor,
      });
    },
    [id]
  );

  const updateCursorPosition = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const offsetX = clientX - rect.left;
      const offsetY = clientY - rect.top;
      const x = clamp(offsetX / canvasScale, 0, draftWidth);
      const y = clamp(offsetY / canvasScale, 0, draftHeight);
      emitCursor({ x, y });
    },
    [canvasScale, draftWidth, draftHeight, emitCursor]
  );

  const clearCursor = useCallback(() => {
    emitCursor(null);
  }, [emitCursor]);

  const resetMentionState = useCallback(() => {
    mentionTriggerRef.current = null;
    setMentionQuery((prev) => (prev !== null ? null : prev));
    setMentionActiveIndex(0);
  }, []);

  const updateMentionContext = useCallback(
    (value: string, cursorPosition: number) => {
      const trigger = findMentionTrigger(value, cursorPosition);
      if (trigger) {
        mentionTriggerRef.current = {
          start: trigger.start,
          end: cursorPosition,
        };
        setMentionQuery(trigger.query);
        setMentionActiveIndex(0);
      } else {
        resetMentionState();
      }
    },
    [resetMentionState]
  );

  const handleCommentInputChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const { value, selectionStart } = event.target;
      setCommentInput(value);
      const cursor = selectionStart ?? value.length;
      updateMentionContext(value, cursor);
    },
    [updateMentionContext]
  );

  const handleCommentSelectionChange = useCallback(
    (event: SyntheticEvent<HTMLTextAreaElement>) => {
      const target = event.currentTarget;
      const cursor = target.selectionStart ?? target.value.length;
      updateMentionContext(target.value, cursor);
    },
    [updateMentionContext]
  );

  const handleMentionSelect = useCallback(
    (option: MentionOption) => {
      const trigger = mentionTriggerRef.current;
      if (!trigger) {
        return;
      }
      const label = option.name.trim();
      if (!label) {
        return;
      }
      let nextCursorPosition = trigger.start;
      setCommentInput((prev) => {
        const before = prev.slice(0, trigger.start);
        const after = prev.slice(trigger.end);
        const mentionText = `@${label}`;
        const needsTrailingSpace =
          after.length === 0 || /[\s.,!?]/.test(after.charAt(0)) ? "" : " ";
        const nextValue = `${before}${mentionText}${needsTrailingSpace}${after}`;
        nextCursorPosition =
          before.length + mentionText.length + needsTrailingSpace.length;
        return nextValue;
      });
      setMentionEntities((prev) => {
        const filtered = prev.filter((entity) => entity.label !== label);
        return [...filtered, { id: option.id, label }];
      });
      resetMentionState();
      requestAnimationFrame(() => {
        const input = commentInputRef.current;
        if (input) {
          input.focus();
          input.setSelectionRange(nextCursorPosition, nextCursorPosition);
        }
      });
    },
    [resetMentionState]
  );

  const handleCommentKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionQuery !== null && mentionOptions.length > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setMentionActiveIndex((prev) =>
            prev + 1 >= mentionOptions.length ? 0 : prev + 1
          );
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setMentionActiveIndex((prev) =>
            prev - 1 < 0 ? mentionOptions.length - 1 : prev - 1
          );
          return;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          handleMentionSelect(mentionOptions[mentionActiveIndex]);
          return;
        }
      }
      if (mentionQuery !== null) {
        if (event.key === "Escape") {
          event.preventDefault();
          resetMentionState();
        }
      }
    },
    [
      handleMentionSelect,
      mentionActiveIndex,
      mentionOptions,
      mentionQuery,
      resetMentionState,
    ]
  );

  const handleMentionSuggestionHover = useCallback((index: number) => {
    setMentionActiveIndex(index);
  }, []);

  const captureSnapshot = useCallback(
    () => ({
      elements: elements.map((element) => ({ ...element })),
      width: draftWidth,
      height: draftHeight,
      selectedElementId,
      name: draftName,
      isPublic: draftIsPublic,
    }),
    [
      elements,
      draftWidth,
      draftHeight,
      draftIsPublic,
      draftName,
      selectedElementId,
    ]
  );

  const updateSelectedElementId = useCallback(
    (
      nextId: string | null,
      options?: {
        broadcast?: boolean;
      }
    ) => {
      if (selectedElementIdRef.current === nextId) {
        return;
      }
      selectedElementIdRef.current = nextId;
      setSelectedElementId(nextId);
      const shouldBroadcast = options?.broadcast ?? true;
      if (!shouldBroadcast) {
        return;
      }
      if (applyingRemotePatchRef.current) {
        return;
      }
      broadcastDesignPatch({ selectedElementId: nextId });
    },
    [broadcastDesignPatch]
  );

  useEffect(() => {
    selectedElementIdRef.current = selectedElementId;
  }, [selectedElementId]);

  useEffect(() => {
    selectedElementIdRef.current = selectedElementId;
  }, [selectedElementId]);

  const applySnapshot = useCallback(
    (
      snapshot: EditorSnapshot,
      options?: {
        broadcast?: boolean;
      }
    ) => {
      const normalizedElements = normalizeElements(
        snapshot.elements.map((element) => ({ ...element }))
      );
      const elementsChanged = replaceElements(normalizedElements);
      const widthChanged = draftWidth !== snapshot.width;
      const heightChanged = draftHeight !== snapshot.height;
      const nameChanged = draftName !== snapshot.name;
      const visibilityChanged = draftIsPublic !== snapshot.isPublic;
      if (widthChanged) {
        setDraftWidth(snapshot.width);
      }
      if (heightChanged) {
        setDraftHeight(snapshot.height);
      }
      if (nameChanged) {
        setDraftName(snapshot.name);
      }
      if (visibilityChanged) {
        setDraftIsPublic(snapshot.isPublic);
      }
      if (nameChanged || visibilityChanged) {
        setDesignMeta((prev) => {
          if (!prev) {
            return prev;
          }
          return {
            ...prev,
            name: nameChanged ? snapshot.name : prev.name,
            isPublic: visibilityChanged ? snapshot.isPublic : prev.isPublic,
          };
        });
      }
      const hasSelected = normalizedElements.some(
        (element) => element.id === snapshot.selectedElementId
      );
      const nextSelected = hasSelected
        ? snapshot.selectedElementId
        : normalizedElements[normalizedElements.length - 1]?.id ?? null;
      const previousSelected = selectedElementId;
      updateSelectedElementId(nextSelected, { broadcast: false });
      setIsDirty(true);
      const shouldBroadcast = options?.broadcast ?? true;
      if (!shouldBroadcast) {
        return;
      }
      if (applyingRemotePatchRef.current) {
        return;
      }
      const selectionChanged = previousSelected !== nextSelected;
      const payload: DesignRealtimePatch = {};
      if (elementsChanged) {
        payload.elements = normalizedElements;
      }
      if (selectionChanged) {
        payload.selectedElementId = nextSelected ?? null;
      }
      if (widthChanged) {
        payload.width = snapshot.width;
      }
      if (heightChanged) {
        payload.height = snapshot.height;
      }
      if (nameChanged) {
        payload.name = snapshot.name;
      }
      if (visibilityChanged) {
        payload.isPublic = snapshot.isPublic;
      }
      if (Object.keys(payload).length === 0) {
        return;
      }
      broadcastDesignPatch({
        ...payload,
      });
    },
    [
      broadcastDesignPatch,
      draftHeight,
      draftIsPublic,
      draftName,
      draftWidth,
      replaceElements,
      selectedElementId,
      updateSelectedElementId,
    ]
  );

  const beginHistoryEntry = useCallback(() => {
    if (historyCheckpointRef.current) {
      return;
    }
    const snapshot = captureSnapshot();
    const history = historyRef.current;
    history.past.push(snapshot);
    if (history.past.length > MAX_HISTORY_ENTRIES) {
      history.past.shift();
    }
    history.future = [];
    historyCheckpointRef.current = true;
    syncHistoryState();
  }, [captureSnapshot, syncHistoryState]);

  const finalizeHistoryEntry = useCallback(() => {
    historyCheckpointRef.current = false;
  }, []);

  const handleUndo = useCallback(() => {
    const history = historyRef.current;
    if (history.past.length <= 1) {
      return;
    }
    const currentSnapshot = captureSnapshot();
    const previousSnapshot = history.past.pop();
    if (!previousSnapshot) {
      return;
    }
    history.future.push(currentSnapshot);
    if (history.future.length > MAX_HISTORY_ENTRIES) {
      history.future.shift();
    }
    historyCheckpointRef.current = false;
    applySnapshot(previousSnapshot);
    syncHistoryState();
  }, [applySnapshot, captureSnapshot, syncHistoryState]);

  const handleRedo = useCallback(() => {
    const history = historyRef.current;
    if (history.future.length === 0) {
      return;
    }
    const currentSnapshot = captureSnapshot();
    const nextSnapshot = history.future.pop();
    if (!nextSnapshot) {
      return;
    }
    history.past.push(currentSnapshot);
    if (history.past.length > MAX_HISTORY_ENTRIES) {
      history.past.shift();
    }
    historyCheckpointRef.current = false;
    applySnapshot(nextSnapshot);
    syncHistoryState();
  }, [applySnapshot, captureSnapshot, syncHistoryState]);

  const applyResizeFromPointer = (
    session: ResizeSession,
    event: PointerEvent
  ) => {
    const { startClientX, startClientY, startElement, handle, elementId } =
      session;
    const deltaX = (event.clientX - startClientX) / canvasScale;
    const deltaY = (event.clientY - startClientY) / canvasScale;

    const angleRad = (startElement.rotation * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const localDx = cos * deltaX + sin * deltaY;
    const localDy = -sin * deltaX + cos * deltaY;

    const uX = cos;
    const uY = sin;
    const vX = -sin;
    const vY = cos;

    const startWidth = startElement.width;
    const startHeight = startElement.height;
    let widthCandidate = startWidth;
    let heightCandidate = startHeight;
    let newX = startElement.x;
    let newY = startElement.y;

    const clampDimension = (value: number, minimum: number) =>
      value < minimum ? minimum : value;

    const clampPosition = (value: number, size: number, max: number) =>
      clamp(value, -size, max);

    switch (handle) {
      case "top-left": {
        widthCandidate = clampDimension(startWidth - localDx, MIN_ELEMENT_SIZE);
        heightCandidate = clampDimension(
          startHeight - localDy,
          MIN_ELEMENT_SIZE
        );
        const widthDelta = startWidth - widthCandidate;
        const heightDelta = startHeight - heightCandidate;
        newX = startElement.x + widthDelta * uX + heightDelta * vX;
        newY = startElement.y + widthDelta * uY + heightDelta * vY;
        break;
      }
      case "top": {
        heightCandidate = clampDimension(
          startHeight - localDy,
          MIN_ELEMENT_SIZE
        );
        const heightDelta = startHeight - heightCandidate;
        newX = startElement.x + heightDelta * vX;
        newY = startElement.y + heightDelta * vY;
        break;
      }
      case "top-right": {
        widthCandidate = clampDimension(startWidth + localDx, MIN_ELEMENT_SIZE);
        heightCandidate = clampDimension(
          startHeight - localDy,
          MIN_ELEMENT_SIZE
        );
        const heightDelta = startHeight - heightCandidate;
        newX = startElement.x + heightDelta * vX;
        newY = startElement.y + heightDelta * vY;
        break;
      }
      case "right": {
        widthCandidate = clampDimension(startWidth + localDx, MIN_ELEMENT_SIZE);
        break;
      }
      case "bottom-right": {
        widthCandidate = clampDimension(startWidth + localDx, MIN_ELEMENT_SIZE);
        heightCandidate = clampDimension(
          startHeight + localDy,
          MIN_ELEMENT_SIZE
        );
        break;
      }
      case "bottom": {
        heightCandidate = clampDimension(
          startHeight + localDy,
          MIN_ELEMENT_SIZE
        );
        break;
      }
      case "bottom-left": {
        widthCandidate = clampDimension(startWidth - localDx, MIN_ELEMENT_SIZE);
        heightCandidate = clampDimension(
          startHeight + localDy,
          MIN_ELEMENT_SIZE
        );
        const widthDelta = startWidth - widthCandidate;
        newX = startElement.x + widthDelta * uX;
        newY = startElement.y + widthDelta * uY;
        break;
      }
      case "left": {
        widthCandidate = clampDimension(startWidth - localDx, MIN_ELEMENT_SIZE);
        const widthDelta = startWidth - widthCandidate;
        newX = startElement.x + widthDelta * uX;
        newY = startElement.y + widthDelta * uY;
        break;
      }
    }

    const clampedX = clampPosition(newX, widthCandidate, draftWidth);
    const clampedY = clampPosition(newY, heightCandidate, draftHeight);

    let didChange = false;
    let nextElements: DesignElement[] | null = null;
    setElements((prev) => {
      const updated = prev.map((element) => {
        if (element.id !== elementId) {
          return element;
        }
        const prevWidth = element.width ?? startWidth;
        const prevHeight = element.height ?? startHeight;
        if (
          element.x === clampedX &&
          element.y === clampedY &&
          prevWidth === widthCandidate &&
          prevHeight === heightCandidate
        ) {
          return element;
        }
        didChange = true;
        return {
          ...element,
          x: clampedX,
          y: clampedY,
          width: widthCandidate,
          height: heightCandidate,
        };
      });
      if (didChange) {
        const normalized = normalizeElements(updated);
        const bounded = boundElementsToCanvas(
          normalized,
          draftWidth,
          draftHeight
        );
        nextElements = bounded;
        return bounded;
      }
      return updated;
    });
    if (didChange) {
      setIsDirty(true);
      recentElementInteractionRef.current = true;
      if (!applyingRemotePatchRef.current && nextElements) {
        broadcastDesignPatch({ elements: nextElements });
      }
    }
  };

  const applyRotateFromPointer = (
    session: RotateSession,
    event: PointerEvent
  ) => {
    const {
      elementId,
      centerClientX,
      centerClientY,
      startRotation,
      startPointerAngle,
    } = session;
    const pointerAngle = Math.atan2(
      event.clientY - centerClientY,
      event.clientX - centerClientX
    );
    const deltaAngle = pointerAngle - startPointerAngle;
    let nextRotation = startRotation + (deltaAngle * 180) / Math.PI;
    if (!Number.isFinite(nextRotation)) {
      return;
    }
    nextRotation = ((nextRotation % 360) + 360) % 360;

    let didChange = false;
    let nextElements: DesignElement[] | null = null;
    setElements((prev) => {
      const updated = prev.map((element) => {
        if (element.id !== elementId) {
          return element;
        }
        const prevRotation = element.rotation ?? 0;
        if (Math.abs(prevRotation - nextRotation) < 0.1) {
          return element;
        }
        didChange = true;
        return {
          ...element,
          rotation: nextRotation,
        };
      });
      if (didChange) {
        const normalized = normalizeElements(updated);
        const bounded = boundElementsToCanvas(
          normalized,
          draftWidth,
          draftHeight
        );
        nextElements = bounded;
        return bounded;
      }
      return updated;
    });
    if (didChange) {
      setIsDirty(true);
      recentElementInteractionRef.current = true;
      if (!applyingRemotePatchRef.current && nextElements) {
        broadcastDesignPatch({ elements: nextElements });
      }
    }
  };

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
    if (!id || !user) {
      return;
    }
    const socket = getSocket();
    socketRef.current = socket;

    const joinPayload = {
      designId: id,
      userId: user.id,
      name: user.name,
      color: userColor,
    };

    const handleConnect = () => {
      localSocketIdRef.current = socket.id ?? null;
      socket.emit("design:join", joinPayload);
    };

    const handlePresence = (
      payload: { designId: string; participants: PresenceParticipant[] } | null
    ) => {
      if (!payload || payload.designId !== id) {
        return;
      }
      const lookup: Record<string, PresenceParticipant> = {};
      payload.participants.forEach((participant) => {
        lookup[participant.socketId] = participant;
      });
      presenceMapRef.current = lookup;
      setParticipants(payload.participants);
      setRemoteCursors(() => {
        const next: Record<string, RemoteCursor> = {};
        payload.participants.forEach((participant) => {
          if (participant.socketId === localSocketIdRef.current) {
            return;
          }
          if (!participant.cursor) {
            return;
          }
          next[participant.socketId] = {
            x: participant.cursor.x,
            y: participant.cursor.y,
            name: participant.name,
            color:
              participant.color ??
              getPresenceColor(participant.userId ?? participant.socketId),
          };
        });
        return next;
      });
    };

    const handleCursorEvent = (
      payload:
        | {
            designId: string;
            socketId: string;
            cursor: { x: number; y: number } | null;
          }
        | undefined
    ) => {
      if (!payload || payload.designId !== id) {
        return;
      }
      if (payload.socketId === localSocketIdRef.current) {
        return;
      }
      const participant = presenceMapRef.current[payload.socketId];
      if (!payload.cursor) {
        setRemoteCursors((prev) => {
          if (!prev[payload.socketId]) {
            return prev;
          }
          const { [payload.socketId]: _removed, ...rest } = prev;
          return rest;
        });
        return;
      }
      const cursor = payload.cursor;
      setRemoteCursors((prev) => ({
        ...prev,
        [payload.socketId]: {
          x: cursor.x,
          y: cursor.y,
          name: participant?.name ?? "Guest",
          color:
            participant?.color ??
            getPresenceColor(participant?.userId ?? payload.socketId),
        },
      }));
    };

    const handlePatchEvent = (
      payload:
        | {
            designId: string;
            actorId?: string;
            patch: DesignRealtimePatch;
          }
        | undefined
    ) => {
      if (!payload || payload.designId !== id) {
        return;
      }
      applyingRemotePatchRef.current = true;
      if (payload.patch.elements) {
        replaceElements(normalizeElements(payload.patch.elements));
      }
      if (payload.patch.selectedElementId !== undefined) {
        updateSelectedElementId(payload.patch.selectedElementId ?? null, {
          broadcast: false,
        });
      }
      if (typeof payload.patch.width === "number") {
        const nextWidth = payload.patch.width;
        setDraftWidth((prev) => (prev === nextWidth ? prev : nextWidth));
      }
      if (typeof payload.patch.height === "number") {
        const nextHeight = payload.patch.height;
        setDraftHeight((prev) => (prev === nextHeight ? prev : nextHeight));
      }
      if (typeof payload.patch.name === "string") {
        const nextName = payload.patch.name;
        setDraftName(nextName);
        setDesignMeta((prev) => {
          if (!prev || prev.name === nextName) {
            return prev;
          }
          return {
            ...prev,
            name: nextName,
          };
        });
      }
      if (typeof payload.patch.isPublic === "boolean") {
        const nextIsPublic = payload.patch.isPublic;
        setDraftIsPublic(nextIsPublic);
        setDesignMeta((prev) => {
          if (!prev || prev.isPublic === nextIsPublic) {
            return prev;
          }
          return {
            ...prev,
            isPublic: nextIsPublic,
          };
        });
      }
      setIsDirty(true);
      applyingRemotePatchRef.current = false;
    };

    const handleCommentCreated = (
      payload:
        | {
            designId: string;
            comment: Comment;
          }
        | undefined
    ) => {
      if (!payload || payload.designId !== id) {
        return;
      }
      setComments((prev) => {
        if (prev.some((item) => item._id === payload.comment._id)) {
          return prev;
        }
        return [...prev, payload.comment];
      });
      if (
        pendingCommentMessageRef.current &&
        payload.comment.authorId === user.id
      ) {
        pendingCommentMessageRef.current = null;
        setCommentSubmitting(false);
      }
    };

    const handleSocketError = (
      payload:
        | {
            message?: string;
          }
        | undefined
    ) => {
      if (!payload?.message) {
        return;
      }
      if (pendingCommentMessageRef.current) {
        setCommentError(payload.message);
        pendingCommentMessageRef.current = null;
        setCommentSubmitting(false);
      }
    };

    const handleDisconnect = () => {
      localSocketIdRef.current = null;
      if (pendingCommentMessageRef.current) {
        pendingCommentMessageRef.current = null;
        setCommentSubmitting(false);
        setCommentError("Connection lost while posting comment.");
      }
    };

    socket.on("connect", handleConnect);
    socket.on("design:presence", handlePresence);
    socket.on("design:cursor", handleCursorEvent);
    socket.on("design:patch", handlePatchEvent);
    socket.on("comment:created", handleCommentCreated);
    socket.on("error", handleSocketError);
    socket.on("disconnect", handleDisconnect);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      if (socket.connected) {
        socket.emit("design:leave", { designId: id });
      }
      socket.off("connect", handleConnect);
      socket.off("design:presence", handlePresence);
      socket.off("design:cursor", handleCursorEvent);
      socket.off("design:patch", handlePatchEvent);
      socket.off("comment:created", handleCommentCreated);
      socket.off("error", handleSocketError);
      socket.off("disconnect", handleDisconnect);
      if (socket.id && localSocketIdRef.current === socket.id) {
        localSocketIdRef.current = null;
      }
      presenceMapRef.current = {};
      setParticipants([]);
      setRemoteCursors({});
      lastCursorRef.current = null;
      clearCursor();
      socketRef.current = null;
    };
  }, [
    clearCursor,
    id,
    replaceElements,
    updateSelectedElementId,
    user,
    userColor,
  ]);

  useEffect(() => {
    if (!id || !token) {
      return;
    }
    setLoading(true);
    setError(null);
    getDesign(id, token)
      .then((response) => {
        const detail = response.design;
        const normalizedElements = normalizeElements(
          sortByZIndex(detail.elements)
        );
        const boundedElements = boundElementsToCanvas(
          normalizedElements,
          detail.width,
          detail.height
        );
        setDesignMeta(detail);
        setElements(boundedElements);
        setComments(response.comments);
        setDraftName(detail.name);
        setDraftIsPublic(detail.isPublic);
        setDraftWidth(detail.width);
        setDraftHeight(detail.height);
        setLastSavedAt(detail.lastSavedAt ?? detail.updatedAt ?? null);
        const lastSelectedId =
          boundedElements[boundedElements.length - 1]?.id ?? null;
        updateSelectedElementId(lastSelectedId, { broadcast: false });
        const initialSnapshot: EditorSnapshot = {
          elements: boundedElements.map((element) => ({ ...element })),
          width: detail.width,
          height: detail.height,
          selectedElementId: lastSelectedId,
          name: detail.name,
          isPublic: detail.isPublic,
        };
        lastSavedSnapshotRef.current = toPersistedSnapshot(initialSnapshot);
        setIsDirty(false);
        historyRef.current.past = [initialSnapshot];
        historyRef.current.future = [];
        historyCheckpointRef.current = false;
        syncHistoryState();
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
  }, [id, navigate, syncHistoryState, token, updateSelectedElementId]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      const transform = transformRef.current;
      if (!drag && !transform) {
        return;
      }
      event.preventDefault();
      if (drag && drag.pointerId === event.pointerId) {
        const deltaX = (event.clientX - drag.startClientX) / canvasScale;
        const deltaY = (event.clientY - drag.startClientY) / canvasScale;
        let changed = false;
        let nextElements: DesignElement[] | null = null;
        setElements((prev) => {
          const updated = prev.map((element) => {
            if (element.id !== drag.id) {
              return element;
            }
            const { width, height } = getElementSize(element);
            const nextX = clamp(drag.startX + deltaX, -width, draftWidth);
            const nextY = clamp(drag.startY + deltaY, -height, draftHeight);
            if (nextX !== element.x || nextY !== element.y) {
              changed = true;
              return { ...element, x: nextX, y: nextY };
            }
            return element;
          });
          if (changed) {
            const normalized = normalizeElements(updated);
            const bounded = boundElementsToCanvas(
              normalized,
              draftWidth,
              draftHeight
            );
            nextElements = bounded;
            return bounded;
          }
          return updated;
        });
        if (changed && dragRef.current) {
          dragRef.current.moved = true;
          setIsDirty(true);
        }
        if (changed) {
          recentElementInteractionRef.current = true;
          if (!applyingRemotePatchRef.current && nextElements) {
            broadcastDesignPatch({ elements: nextElements });
          }
        }
      }

      if (transform && transform.pointerId === event.pointerId) {
        if (transform.type === "resize") {
          applyResizeFromPointer(transform, event);
        } else if (transform.type === "rotate") {
          applyRotateFromPointer(transform, event);
        }
      }

      updateCursorPosition(event.clientX, event.clientY);
    };

    const handlePointerEnd = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag && drag.pointerId === event.pointerId) {
        drag.target?.releasePointerCapture?.(drag.pointerId);
        dragRef.current = null;
        setActiveDragId(null);
        finalizeHistoryEntry();
      }
      const transform = transformRef.current;
      if (transform && transform.pointerId === event.pointerId) {
        transform.target?.releasePointerCapture?.(transform.pointerId);
        transformRef.current = null;
        finalizeHistoryEntry();
      }
      if (recentElementInteractionRef.current) {
        window.setTimeout(() => {
          recentElementInteractionRef.current = false;
        }, 0);
      }
      clearCursor();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [
    canvasScale,
    draftWidth,
    draftHeight,
    applyResizeFromPointer,
    applyRotateFromPointer,
    finalizeHistoryEntry,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        if (
          target.isContentEditable ||
          tagName === "INPUT" ||
          tagName === "TEXTAREA" ||
          tagName === "SELECT"
        ) {
          return;
        }
      }
      if (!(event.metaKey || event.ctrlKey)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if (!event.shiftKey && key === "y") {
        event.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleRedo, handleUndo]);

  const selectedElement = useMemo(
    () => elements.find((element) => element.id === selectedElementId) ?? null,
    [elements, selectedElementId]
  );

  const handleElementSelection = (id: string) => {
    updateSelectedElementId(id);
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
    beginHistoryEntry();
    updateSelectedElementId(element.id);
    recentElementInteractionRef.current = true;
    setActiveDragId(element.id);
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

  const handleResizeHandlePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    element: DesignElement,
    handle: ResizeHandle
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
    if (transformRef.current) {
      transformRef.current.target?.releasePointerCapture?.(
        transformRef.current.pointerId
      );
      transformRef.current = null;
    }
    beginHistoryEntry();
    updateSelectedElementId(element.id);
    recentElementInteractionRef.current = true;
    const target = event.currentTarget;
    try {
      target.setPointerCapture(event.pointerId);
    } catch (err) {
      // ignore if pointer capture unsupported
    }
    const { width, height } = getElementSize(element);
    transformRef.current = {
      type: "resize",
      handle,
      elementId: element.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startElement: {
        x: element.x,
        y: element.y,
        width,
        height,
        rotation: element.rotation ?? 0,
      },
      target,
    };
  };

  const handleRotatePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    element: DesignElement
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
    if (transformRef.current) {
      transformRef.current.target?.releasePointerCapture?.(
        transformRef.current.pointerId
      );
      transformRef.current = null;
    }
    beginHistoryEntry();
    updateSelectedElementId(element.id);
    recentElementInteractionRef.current = true;
    const { width, height } = getElementSize(element);
    const hostElement = event.currentTarget.parentElement?.parentElement;
    const elementRect = hostElement?.getBoundingClientRect();
    const centerClientX = elementRect
      ? elementRect.left + elementRect.width / 2
      : event.clientX;
    const centerClientY = elementRect
      ? elementRect.top + elementRect.height / 2
      : event.clientY;
    const startPointerAngle = Math.atan2(
      event.clientY - centerClientY,
      event.clientX - centerClientX
    );
    const target = event.currentTarget;
    try {
      target.setPointerCapture(event.pointerId);
    } catch (err) {
      // ignore if pointer capture unsupported
    }
    transformRef.current = {
      type: "rotate",
      elementId: element.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      centerClientX,
      centerClientY,
      startRotation: element.rotation ?? 0,
      startPointerAngle,
      target,
    };
  };

  const applyElementsUpdate = (
    updater: (previous: DesignElement[]) => DesignElement[],
    options?: { finalize?: boolean }
  ) => {
    beginHistoryEntry();
    let nextElements: DesignElement[] | null = null;
    setElements((prev) => {
      const normalized = normalizeElements(updater([...prev]));
      const bounded = boundElementsToCanvas(
        normalized,
        draftWidth,
        draftHeight
      );
      nextElements = bounded;
      if (
        selectedElementId &&
        !bounded.some((element) => element.id === selectedElementId)
      ) {
        updateSelectedElementId(bounded[bounded.length - 1]?.id ?? null);
      }
      setIsDirty(true);
      return bounded;
    });
    if (!applyingRemotePatchRef.current && nextElements) {
      broadcastDesignPatch({ elements: nextElements });
    }
    if (options?.finalize ?? true) {
      finalizeHistoryEntry();
    }
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
    updateSelectedElementId(element.id);
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
        isPublic: draftIsPublic,
      };
      const response = await updateDesign(id, payload, token);
      const detail = response.design;
      setDesignMeta(detail);
      const normalized = normalizeElements(sortByZIndex(detail.elements));
      const bounded = boundElementsToCanvas(
        normalized,
        detail.width,
        detail.height
      );
      setElements(bounded);
      setDraftName(detail.name);
      setDraftIsPublic(detail.isPublic);
      setDraftWidth(detail.width);
      setDraftHeight(detail.height);
      setLastSavedAt(detail.lastSavedAt ?? detail.updatedAt ?? null);
      setIsDirty(false);
      lastSavedSnapshotRef.current = toPersistedSnapshot({
        elements: bounded.map((element) => ({ ...element })),
        width: detail.width,
        height: detail.height,
        selectedElementId: selectedElementIdRef.current,
        name: detail.name,
        isPublic: detail.isPublic,
      });
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message ?? "Unable to save design");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!designMeta) {
      return;
    }
    const snapshot = captureSnapshot();
    const persisted = toPersistedSnapshot(snapshot);
    const baseline = lastSavedSnapshotRef.current;
    if (!baseline) {
      setIsDirty(true);
      return;
    }
    setIsDirty(!persistedSnapshotsEqual(baseline, persisted));
  }, [captureSnapshot, designMeta]);

  const handleExport = useCallback(async () => {
    const node = canvasRef.current;
    if (!node) {
      setExportError("Canvas is not ready to export yet.");
      return;
    }
    setExportError(null);
    setExporting(true);
    try {
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: window.devicePixelRatio || 1,
        filter(domNode) {
          if (!(domNode instanceof Element)) {
            return true;
          }
          const classList = domNode.classList;
          if (!classList) {
            return true;
          }
          if (
            classList.contains("canvas-selection") ||
            classList.contains("canvas-selection-border") ||
            classList.contains("canvas-rotate-handle") ||
            classList.contains("canvas-resize-handle") ||
            classList.contains("remote-cursor")
          ) {
            return false;
          }
          return true;
        },
      });
      const rawName = draftName.trim() || designMeta?.name || "Design";
      const safeName = rawName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .toLowerCase();
      const link = document.createElement("a");
      link.download = `${safeName || "design"}-${timestamp}.png`;
      link.href = dataUrl;
      link.rel = "noopener";
      link.click();
    } catch (err) {
      console.error("Failed to export design", err);
      setExportError("Unable to export design. Please try again.");
    } finally {
      setExporting(false);
    }
  }, [designMeta?.name, draftName]);

  const handleSubmitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id) {
      return;
    }
    const message = commentInput.trim();
    if (!message) {
      return;
    }
    const mentionTokens = message.match(/@[A-Za-z0-9_\-]+/g) ?? [];
    const mentionValues: string[] = [];
    mentionTokens.forEach((token) => {
      const label = token.slice(1);
      const mapped = mentionEntities.find((entity) => entity.label === label);
      const value = mapped ? mapped.id : label;
      if (!mentionValues.includes(value)) {
        mentionValues.push(value);
      }
    });
    setCommentError(null);

    const resetCommentInput = () => {
      setCommentInput("");
      setMentionEntities([]);
      resetMentionState();
    };

    if (socketRef.current && socketRef.current.connected) {
      setCommentSubmitting(true);
      resetCommentInput();
      pendingCommentMessageRef.current = message;
      socketRef.current.emit("comment:create", {
        designId: id,
        payload: {
          message,
          mentions: mentionValues,
        },
      });
      return;
    }

    if (!token) {
      setCommentError("Unable to submit comment while offline.");
      return;
    }

    setCommentSubmitting(true);
    try {
      const result = await createComment(
        id,
        {
          message,
          mentions: mentionValues,
        },
        token
      );
      setComments((prev) => {
        if (prev.some((comment) => comment._id === result.comment._id)) {
          return prev;
        }
        return [...prev, result.comment];
      });
      resetCommentInput();
    } catch (err) {
      const apiError = err as ApiError;
      setCommentError(apiError?.message ?? "Unable to post comment");
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleTogglePublic = (isPublic: boolean) => {
    setDraftIsPublic(isPublic);
    setDesignMeta((prev) => {
      if (!prev || prev.isPublic === isPublic) {
        return prev;
      }
      return {
        ...prev,
        isPublic,
      };
    });
    setIsDirty(true);
    if (!applyingRemotePatchRef.current) {
      broadcastDesignPatch({ isPublic });
    }
  };

  const handleNameChange = (event: FormEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value;
    setDraftName(value);
    setDesignMeta((prev) => {
      if (!prev || prev.name === value) {
        return prev;
      }
      return {
        ...prev,
        name: value,
      };
    });
    setIsDirty(true);
    if (!applyingRemotePatchRef.current) {
      broadcastDesignPatch({ name: value });
    }
  };

  const sortedLayers = useMemo(
    () => [...elements].slice().reverse(),
    [elements]
  );

  const localSocketId = localSocketIdRef.current;
  const otherParticipants = participants.filter(
    (participant) => participant.socketId !== localSocketId
  );
  const presenceSummary = otherParticipants.length
    ? otherParticipants.length === 1
      ? `${otherParticipants[0].name} is editing`
      : `${otherParticipants.length} collaborators editing`
    : "You're the only one here";

  const safeCanvasScale =
    Number.isFinite(canvasScale) && canvasScale > 0 ? canvasScale : 1;
  const scaledCanvasWidth = Math.max(draftWidth * safeCanvasScale, 0);
  const scaledCanvasHeight = Math.max(draftHeight * safeCanvasScale, 0);

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
          </div>
          <div className="editor-presence">
            <span className="editor-presence-status">{presenceSummary}</span>
            <div className="editor-presence-list">
              {otherParticipants.slice(0, 4).map((participant) => {
                const color =
                  participant.color ?? getPresenceColor(participant.userId);
                return (
                  <span
                    key={participant.socketId}
                    className="editor-presence-avatar"
                    style={{
                      backgroundColor: `${color}1A`,
                      borderColor: color,
                      color,
                    }}
                    title={participant.name}
                  >
                    {participant.name.charAt(0).toUpperCase()}
                  </span>
                );
              })}
              {otherParticipants.length > 4 && (
                <span className="editor-presence-more">
                  +{otherParticipants.length - 4}
                </span>
              )}
            </div>
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
          <div className="editor-history-group">
            <button
              type="button"
              onClick={handleUndo}
              disabled={!canUndo}
              title="Undo (Cmd+Z / Ctrl+Z)"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={!canRedo}
              title="Redo (Cmd+Shift+Z / Ctrl+Y)"
            >
              Redo
            </button>
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
            className="button-secondary"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? "Exporting…" : "Download PNG"}
          </button>
          <button
            className="primary"
            onClick={handleSave}
            disabled={saving || !isDirty}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </header>
      {exportError && <div className="editor-export-error">{exportError}</div>}
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
              width: scaledCanvasWidth,
              height: scaledCanvasHeight,
            }}
          >
            <div
              className="editor-canvas-scale"
              style={{
                width: draftWidth,
                height: draftHeight,
                transform: `scale(${safeCanvasScale})`,
                transformOrigin: "top left",
              }}
            >
              <div
                className="editor-canvas"
                style={{ width: draftWidth, height: draftHeight }}
                ref={canvasRef}
                onPointerMove={(event) =>
                  updateCursorPosition(event.clientX, event.clientY)
                }
                onPointerLeave={() => clearCursor()}
                onClick={() => {
                  if (recentElementInteractionRef.current) {
                    recentElementInteractionRef.current = false;
                    return;
                  }
                  updateSelectedElementId(null);
                }}
              >
                {elements.map((element) => (
                  <CanvasElement
                    key={element.id}
                    element={element}
                    isSelected={element.id === selectedElementId}
                    isDragging={activeDragId === element.id}
                    onPointerDown={(event) =>
                      handleElementPointerDown(event, element)
                    }
                    onSelect={() => handleElementSelection(element.id)}
                    onResizeHandlePointerDown={(event, handle) =>
                      handleResizeHandlePointerDown(event, element, handle)
                    }
                    onRotatePointerDown={(event) =>
                      handleRotatePointerDown(event, element)
                    }
                  />
                ))}
                {Object.entries(remoteCursors).map(([socketId, cursor]) => (
                  <div
                    key={socketId}
                    className="remote-cursor"
                    style={{
                      left: cursor.x,
                      top: cursor.y,
                      transform: `translate(-50%, -50%) scale(${
                        1 / safeCanvasScale
                      })`,
                      transformOrigin: "top left",
                    }}
                  >
                    <span
                      className="remote-cursor-dot"
                      style={{ backgroundColor: cursor.color }}
                    />
                    <span
                      className="remote-cursor-label"
                      style={{
                        backgroundColor: `${cursor.color}1A`,
                        borderColor: cursor.color,
                        color: cursor.color,
                      }}
                    >
                      {cursor.name}
                    </span>
                  </div>
                ))}
              </div>
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
                <DesignOverview width={draftWidth} height={draftHeight} />
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
                    <p>
                      {renderCommentMessage(
                        comment.message,
                        comment.mentions,
                        mentionDirectory
                      )}
                    </p>
                  </article>
                ))
              )}
            </div>
            <form className="comment-form" onSubmit={handleSubmitComment}>
              <label className="comment-form-field">
                <span>Add a comment</span>
                <div className="mention-input-wrapper">
                  <textarea
                    ref={commentInputRef}
                    value={commentInput}
                    onChange={handleCommentInputChange}
                    onSelect={handleCommentSelectionChange}
                    onKeyDown={handleCommentKeyDown}
                    onBlur={resetMentionState}
                    placeholder="Share feedback…"
                    rows={3}
                    disabled={commentSubmitting}
                    aria-autocomplete="list"
                    aria-expanded={mentionQuery !== null}
                  />
                  {mentionQuery !== null && (
                    <ul className="mention-suggestions" role="listbox">
                      {mentionOptions.length > 0 ? (
                        mentionOptions.map((option, index) => (
                          <li
                            key={option.id}
                            role="option"
                            aria-selected={index === mentionActiveIndex}
                            className={
                              index === mentionActiveIndex
                                ? "mention-suggestion active"
                                : "mention-suggestion"
                            }
                            onMouseEnter={() =>
                              handleMentionSuggestionHover(index)
                            }
                            onMouseDown={(event) => {
                              event.preventDefault();
                              handleMentionSelect(option);
                            }}
                          >
                            <span className="mention-suggestion-name">
                              {option.name}
                            </span>
                          </li>
                        ))
                      ) : (
                        <li
                          className="mention-suggestion empty"
                          aria-disabled="true"
                        >
                          No matches
                        </li>
                      )}
                    </ul>
                  )}
                </div>
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
  isDragging: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onSelect: () => void;
  onResizeHandlePointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
    handle: ResizeHandle
  ) => void;
  onRotatePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

function CanvasElement({
  element,
  isSelected,
  isDragging,
  onPointerDown,
  onSelect,
  onResizeHandlePointerDown,
  onRotatePointerDown,
}: CanvasElementProps) {
  const width = element.width ?? (element.type === "text" ? 360 : 200);
  const height = element.height ?? (element.type === "text" ? 120 : 200);
  const rotation = element.rotation ?? 0;
  const transform = `translate(${width / 2}px, ${
    height / 2
  }px) rotate(${rotation}deg) translate(-${width / 2}px, -${height / 2}px)`;
  const borderRadius =
    element.type === "shape" && element.shapeType === "circle"
      ? "9999px"
      : "0.75rem";
  const style: CSSProperties = {
    position: "absolute",
    left: element.x,
    top: element.y,
    width,
    height,
    transform,
    transformOrigin: "top left",
    zIndex: element.zIndex,
    opacity: element.opacity ?? 1,
    boxShadow: isSelected
      ? "0 12px 24px rgba(37, 99, 235, 0.18)"
      : "0 4px 24px rgba(15, 23, 42, 0.12)",
    borderRadius,
    cursor: isDragging ? "grabbing" : "grab",
    userSelect: "none",
    WebkitUserSelect: "none",
    touchAction: "none",
  };

  const containerStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    borderRadius,
    overflow: "hidden",
    background:
      element.type === "shape"
        ? element.fill ?? "#2563eb"
        : element.type === "text"
        ? "white"
        : "transparent",
    border:
      element.type === "shape" && element.stroke
        ? `${element.strokeWidth ?? 2}px solid ${element.stroke}`
        : undefined,
    boxSizing: "border-box",
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
  }

  const resizeHandles: Array<{
    name: ResizeHandle;
    className: string;
    cursor: CSSProperties["cursor"];
  }> = [
    { name: "top-left", className: "handle-top-left", cursor: "nwse-resize" },
    { name: "top", className: "handle-top", cursor: "ns-resize" },
    { name: "top-right", className: "handle-top-right", cursor: "nesw-resize" },
    { name: "right", className: "handle-right", cursor: "ew-resize" },
    {
      name: "bottom-right",
      className: "handle-bottom-right",
      cursor: "nwse-resize",
    },
    { name: "bottom", className: "handle-bottom", cursor: "ns-resize" },
    {
      name: "bottom-left",
      className: "handle-bottom-left",
      cursor: "nesw-resize",
    },
    { name: "left", className: "handle-left", cursor: "ew-resize" },
  ];

  return (
    <div
      style={style}
      onPointerDown={onPointerDown}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
      draggable={false}
      aria-pressed={isSelected}
    >
      <div style={containerStyle}>{content}</div>
      {isSelected && (
        <div className="canvas-selection" aria-hidden="true">
          <div className="canvas-selection-border" />
          <div
            className="canvas-rotate-handle"
            onPointerDown={(event) => onRotatePointerDown(event)}
          />
          {resizeHandles.map((handle) => (
            <div
              key={handle.name}
              className={`canvas-resize-handle ${handle.className}`}
              style={{ cursor: handle.cursor }}
              onPointerDown={(event) =>
                onResizeHandlePointerDown(event, handle.name)
              }
            />
          ))}
        </div>
      )}
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

interface DesignOverviewProps {
  width: number;
  height: number;
}

function DesignOverview({ width, height }: DesignOverviewProps) {
  return (
    <div className="inspector-section">
      <p className="inspector-hint">
        Canvas dimensions are fixed for this design. Create a new design if you
        need a different preset.
      </p>
      <div className="design-meta-grid">
        <div>
          <span className="design-meta-label">Width</span>
          <span className="design-meta-value">{width} px</span>
        </div>
        <div>
          <span className="design-meta-label">Height</span>
          <span className="design-meta-value">{height} px</span>
        </div>
      </div>
    </div>
  );
}

function toPersistedSnapshot(snapshot: EditorSnapshot): PersistedSnapshot {
  return {
    elements: snapshot.elements.map((element) => ({ ...element })),
    width: snapshot.width,
    height: snapshot.height,
    name: snapshot.name,
    isPublic: snapshot.isPublic,
  };
}

function elementsAreEqual(a: DesignElement[], b: DesignElement[]) {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      return false;
    }
  }
  return true;
}

function persistedSnapshotsEqual(a: PersistedSnapshot, b: PersistedSnapshot) {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.name === b.name &&
    a.isPublic === b.isPublic &&
    elementsAreEqual(a.elements, b.elements)
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

interface MentionTriggerInfo {
  start: number;
  query: string;
}

function findMentionTrigger(
  value: string,
  cursor: number
): MentionTriggerInfo | null {
  const uptoCursor = value.slice(0, cursor);
  const atIndex = uptoCursor.lastIndexOf("@");
  if (atIndex === -1) {
    return null;
  }
  if (atIndex > 0) {
    const charBefore = uptoCursor.charAt(atIndex - 1);
    if (charBefore && /[A-Za-z0-9_]/.test(charBefore)) {
      return null;
    }
  }
  const query = uptoCursor.slice(atIndex + 1);
  if (query.length > 0 && /[^A-Za-z0-9_\-]/.test(query)) {
    return null;
  }
  return { start: atIndex, query };
}

function renderCommentMessage(
  message: string,
  mentionIds: string[],
  directory: Map<string, string>
) {
  let mentionPointer = 0;
  return message
    .split(/(@[A-Za-z0-9_\-]+)/g)
    .filter((segment) => segment.length > 0)
    .map((segment, index) => {
      if (!segment.startsWith("@")) {
        return <span key={`text-${index}`}>{segment}</span>;
      }
      const label = segment.slice(1);
      const mentionId = mentionIds[mentionPointer] ?? null;
      mentionPointer += 1;
      if (mentionId && directory.has(mentionId)) {
        const displayName = directory.get(mentionId) ?? label;
        return (
          <a
            key={`mention-${index}`}
            className="comment-mention"
            href={`/users/${mentionId}`}
            title={displayName}
          >
            {segment}
          </a>
        );
      }
      return (
        <span
          key={`mention-${index}`}
          className="comment-mention"
          data-mention-id={mentionId ?? undefined}
        >
          {segment}
        </span>
      );
    });
}

function getElementSize(element: DesignElement) {
  const defaultWidth = element.type === "text" ? 360 : 220;
  const defaultHeight = element.type === "text" ? 120 : 220;
  return {
    width: element.width ?? defaultWidth,
    height: element.height ?? defaultHeight,
  };
}

function boundElementToCanvas(
  element: DesignElement,
  canvasWidth: number,
  canvasHeight: number
): DesignElement {
  if (canvasWidth <= 0 || canvasHeight <= 0) {
    return element;
  }

  const { width: inferredWidth, height: inferredHeight } =
    getElementSize(element);
  const measuredWidth =
    element.width !== undefined
      ? Math.max(element.width, MIN_ELEMENT_SIZE)
      : Math.max(inferredWidth, MIN_ELEMENT_SIZE);
  const measuredHeight =
    element.height !== undefined
      ? Math.max(element.height, MIN_ELEMENT_SIZE)
      : Math.max(inferredHeight, MIN_ELEMENT_SIZE);

  const boundedWidth = clamp(measuredWidth, MIN_ELEMENT_SIZE, canvasWidth);
  const boundedHeight = clamp(measuredHeight, MIN_ELEMENT_SIZE, canvasHeight);

  const maxX = Math.max(canvasWidth - boundedWidth, 0);
  const maxY = Math.max(canvasHeight - boundedHeight, 0);

  const boundedX = clamp(element.x, 0, maxX);
  const boundedY = clamp(element.y, 0, maxY);

  const nextElement: DesignElement = {
    ...element,
    x: boundedX,
    y: boundedY,
  };

  if (element.width !== undefined || boundedWidth !== measuredWidth) {
    nextElement.width = boundedWidth;
  }

  if (element.height !== undefined || boundedHeight !== measuredHeight) {
    nextElement.height = boundedHeight;
  }

  return nextElement;
}

function boundElementsToCanvas(
  elements: DesignElement[],
  canvasWidth: number,
  canvasHeight: number
) {
  if (canvasWidth <= 0 || canvasHeight <= 0) {
    return elements;
  }
  return elements.map((element) =>
    boundElementToCanvas(element, canvasWidth, canvasHeight)
  );
}

function clamp(value: number, min: number, max: number) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
