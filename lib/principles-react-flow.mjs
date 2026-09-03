import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import htm from "https://esm.sh/htm@3.1.1";
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useUpdateNodeInternals,
} from "https://esm.sh/@xyflow/react@12.11.3?deps=react@18.3.1,react-dom@18.3.1";

const html = htm.bind(React.createElement);
const CONFIG = window.TJM_CONFLICT_CONFIG || window.TJM_CHRONBIBLE_CONFIG;

if (!CONFIG) {
  console.warn("React Flow Mind Map: reading-plan configuration was not found.");
} else {
  const MAIN_EXTENT = [[0, 0], [2600, 1700]];
  const GROUP_EXTENT = [[0, 0], [1900, 1300]];
  const MAIN_NODE_EXTENT = [[0, 0], [2180, 1380]];
  const GROUP_NODE_EXTENT = [[0, 0], [1480, 980]];
  const SENTINEL_READING_ID = CONFIG.planId === "bible-conflict-ages-v1" ? "coa-000" : "chron-000-00";
  const STORAGE_VERSION = 1;
  const roots = new Map();
  let activeHost = null;
  let activeRoot = null;
  let activeSourceSection = null;
  let mountQueued = false;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const firstLine = (value = "") => String(value).split(/\r?\n/).find((line) => line.trim())?.trim() || "Untitled principle";
  const firstWords = (value = "", count = 8) => {
    const words = firstLine(value).split(/\s+/);
    return words.length > count ? `${words.slice(0, count).join(" ")}…` : words.join(" ");
  };
  const activeRows = (rows = []) => rows.filter((row) => !row.deleted_at);
  const sortByNumber = (rows = []) => [...rows].sort((left, right) => Number(left.principle_number) - Number(right.principle_number));
  const uuid = () => globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  function parseReferences(value) {
    return Array.from(new Set(String(value || "")
      .split(/[^0-9]+/)
      .filter(Boolean)
      .map(Number)
      .filter((number) => Number.isInteger(number) && number > 0)))
      .sort((a, b) => a - b);
  }

  function safeJSON(value, fallback) {
    try {
      const parsed = JSON.parse(value);
      return parsed ?? fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function createStorage(planId, userId) {
    const key = `tjm-react-flow-mindmap:${planId}:${userId || "guest"}`;
    const oldPrefix = `tjm-principle-mindmap-v4:${planId}`;

    const defaultState = () => ({
      version: STORAGE_VERSION,
      mainPositions: {},
      groupPositions: {},
      viewports: {},
      leaders: {},
      groupOrders: {},
      emptyGroups: [],
    });

    function migrateLegacy() {
      const next = defaultState();
      try {
        next.mainPositions = safeJSON(localStorage.getItem(`${oldPrefix}:main-positions`),
          safeJSON(localStorage.getItem(`${oldPrefix}:positions`), {}));
        next.viewports = safeJSON(localStorage.getItem(`${oldPrefix}:views`), {});
        next.leaders = safeJSON(localStorage.getItem(`${oldPrefix}:leaders`), {});
        next.groupOrders = safeJSON(localStorage.getItem(`${oldPrefix}:group-orders`), {});
        next.emptyGroups = safeJSON(localStorage.getItem(`${oldPrefix}:empty-groups`), []);
      } catch (_error) {
        return next;
      }
      return next;
    }

    function read() {
      try {
        const existing = safeJSON(localStorage.getItem(key), null);
        if (existing && typeof existing === "object") return { ...defaultState(), ...existing };
        const migrated = migrateLegacy();
        localStorage.setItem(key, JSON.stringify(migrated));
        return migrated;
      } catch (_error) {
        return defaultState();
      }
    }

    function write(next) {
      try {
        localStorage.setItem(key, JSON.stringify({ ...next, version: STORAGE_VERSION }));
      } catch (_error) {
        // The map remains usable for the current visit when storage is unavailable.
      }
    }

    return { read, write, key };
  }

  function usePersistentLayout(planId, userId) {
    const storage = useMemo(() => createStorage(planId, userId), [planId, userId]);
    const [layout, setLayoutState] = useState(() => storage.read());

    useEffect(() => {
      setLayoutState(storage.read());
    }, [storage]);

    const setLayout = useCallback((updater) => {
      setLayoutState((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        storage.write(next);
        return next;
      });
    }, [storage]);

    return [layout, setLayout];
  }

  function groupPrinciples(principles, layout) {
    const groups = new Map();
    const singles = [];

    for (const principle of activeRows(principles)) {
      if (!principle.group_id) {
        singles.push(principle);
        continue;
      }
      if (!groups.has(principle.group_id)) groups.set(principle.group_id, []);
      groups.get(principle.group_id).push(principle);
    }

    const groupModels = [...groups.entries()].map(([groupId, members]) => {
      const ids = members.map((member) => member.id);
      const savedOrder = Array.isArray(layout.groupOrders[groupId]) ? layout.groupOrders[groupId] : [];
      const orderedIds = [
        ...savedOrder.filter((id) => ids.includes(id)),
        ...sortByNumber(members).map((member) => member.id).filter((id) => !savedOrder.includes(id)),
      ];
      const savedLeader = layout.leaders[groupId];
      const leaderId = savedLeader && ids.includes(savedLeader) ? savedLeader : orderedIds[0];
      const leader = members.find((member) => member.id === leaderId) || members[0];
      const customTitle = String(members.find((member) => String(member.group_title || "").trim())?.group_title || "").trim();
      const orderedMembers = orderedIds.map((id) => members.find((member) => member.id === id)).filter(Boolean);
      return {
        id: groupId,
        members: orderedMembers,
        leader,
        customTitle,
        title: customTitle || `Group led by #${leader?.principle_number ?? "—"}`,
      };
    });

    return { groups: groupModels, singles: sortByNumber(singles) };
  }

  function readingFor(bridge, readingId) {
    return bridge.options.getReadings?.().find((reading) => reading.id === readingId) || null;
  }

  function readingLabel(bridge, principle) {
    const reading = readingFor(bridge, principle.reading_id);
    return reading ? bridge.options.readingLabel?.(reading) || reading.title || principle.reading_id : "Not attached to a reading";
  }

  function useBridgeRows(bridge) {
    const [rows, setRows] = useState(() => activeRows(bridge.options.getPrinciples?.() || []));

    useEffect(() => {
      const onUpdate = (event) => {
        if (event.detail?.planId !== CONFIG.planId) return;
        setRows(activeRows(event.detail.rows || []));
      };
      window.addEventListener("tjm-principles-updated", onUpdate);
      return () => window.removeEventListener("tjm-principles-updated", onUpdate);
    }, []);

    const applyRows = useCallback((nextRows) => {
      const normalized = activeRows(nextRows || []);
      setRows(normalized);
      bridge.options.setPrinciples?.(normalized);
      window.dispatchEvent(new CustomEvent("tjm-principles-updated", {
        detail: { planId: CONFIG.planId, rows: normalized },
      }));
      return normalized;
    }, [bridge]);

    return [rows, applyRows, setRows];
  }

  function useDialogFocus(open, ref) {
    useEffect(() => {
      if (!open) return undefined;
      const previous = document.activeElement;
      requestAnimationFrame(() => ref.current?.querySelector("input, textarea, button")?.focus());
      const onKey = (event) => {
        if (event.key === "Escape") ref.current?.querySelector("[data-close-dialog]")?.click();
      };
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("keydown", onKey);
        previous?.focus?.();
      };
    }, [open, ref]);
  }

  const PrincipleNode = memo(function PrincipleNode({ id, data, selected }) {
    const updateNodeInternals = useUpdateNodeInternals();
    useEffect(() => {
      requestAnimationFrame(() => updateNodeInternals(id));
    }, [id, data.expanded, updateNodeInternals]);

    const principle = data.principle;
    return html`
      <article className=${`tjm-rf-node tjm-rf-principle-node ${data.expanded ? "is-expanded" : "is-compact"} ${selected ? "is-selected" : ""}`}
        data-rf-principle-id=${principle.id}>
        <div className="tjm-rf-principle-row">
          <button type="button"
            className="tjm-rf-number-handle rf-node-drag-handle"
            aria-label=${`Move principle ${principle.principle_number}`}
            title="Drag to move"
            onClick=${(event) => event.stopPropagation()}>
            ${principle.principle_number}
          </button>
          <button type="button" className="tjm-rf-preview nodrag nopan"
            onClick=${() => data.onToggle(principle.id)}
            aria-expanded=${String(data.expanded)}>
            ${firstWords(principle.body, data.expanded ? 16 : 8)}
          </button>
          <button type="button" className="tjm-rf-node-menu nodrag nopan"
            aria-label=${`Options for principle ${principle.principle_number}`}
            onClick=${() => data.onMenu(principle.id)}>⋮</button>
        </div>
        ${data.expanded && html`
          <div className="tjm-rf-expanded-body nodrag nopan">
            <p>${principle.body}</p>
            ${(principle.cross_reference_numbers || []).length > 0 && html`
              <div className="tjm-rf-reference-row" aria-label="Cross references">
                ${(principle.cross_reference_numbers || []).map((number) => html`
                  <button type="button" className="nodrag nopan" onClick=${() => data.onFindReference(number)}>#${number}</button>
                `)}
              </div>
            `}
            <small>${readingLabel(data.bridge, principle)}</small>
            <div className="tjm-rf-expanded-actions">
              <button type="button" className="nodrag nopan" onClick=${() => data.onEdit(principle)}>Edit</button>
              ${principle.reading_id && principle.reading_id !== SENTINEL_READING_ID && html`
                <button type="button" className="nodrag nopan" onClick=${() => data.onGoToReading(principle)}>Go to reading</button>
              `}
              ${principle.group_id && html`
                <button type="button" className="nodrag nopan" onClick=${() => data.onMakeStandalone(principle)}>Make standalone</button>
              `}
            </div>
          </div>
        `}
      </article>
    `;
  });

  const GroupNode = memo(function GroupNode({ data, selected }) {
    const group = data.group;
    return html`
      <article className=${`tjm-rf-node tjm-rf-group-node ${selected ? "is-selected" : ""}`}
        data-rf-group-id=${group.id}>
        <header>
          <button type="button" className="tjm-rf-group-grip rf-group-drag-handle"
            aria-label=${`Move ${group.title}`} title="Drag to move group"
            onClick=${(event) => event.stopPropagation()}>⠿</button>
          <button type="button" className="tjm-rf-group-open nodrag nopan"
            onClick=${() => data.onOpenGroup(group.id)}>
            <small>${group.customTitle ? `GROUP · LED BY #${group.leader?.principle_number}` : "GROUP"}</small>
            <strong>${group.title}</strong>
            <span>${firstWords(group.leader?.body, 12)}</span>
          </button>
          <button type="button" className="tjm-rf-node-menu nodrag nopan"
            aria-label=${`Options for ${group.title}`} onClick=${() => data.onGroupMenu(group)}>⋮</button>
        </header>
        <div className="tjm-rf-member-circles nodrag nopan" aria-label="Principles in this group">
          ${group.members.map((member) => html`
            <button type="button"
              className=${`tjm-rf-member-circle nodrag nopan ${member.id === group.leader?.id ? "is-leader" : ""}`}
              data-rf-member-id=${member.id}
              data-rf-group-id=${group.id}
              aria-label=${`Open or move principle ${member.principle_number}`}
              title="Tap to open · press and hold to move"
              onPointerDown=${(event) => data.onCirclePointerDown(event, member, group)}>
              ${member.principle_number}
            </button>
          `)}
        </div>
      </article>
    `;
  });

  const EmptyGroupNode = memo(function EmptyGroupNode({ data }) {
    return html`
      <article className="tjm-rf-node tjm-rf-group-node tjm-rf-empty-group" data-rf-empty-group-id=${data.group.id}>
        <header>
          <button type="button" className="tjm-rf-group-grip rf-group-drag-handle" aria-label="Move empty group">⠿</button>
          <div className="tjm-rf-empty-copy nodrag nopan">
            <small>EMPTY GROUP</small>
            <strong>${data.group.title || "New group"}</strong>
            <span>Drag a principle here.</span>
          </div>
          <button type="button" className="tjm-rf-node-menu nodrag nopan" onClick=${() => data.onEmptyGroupMenu(data.group)}>⋮</button>
        </header>
      </article>
    `;
  });

  const nodeTypes = {
    principle: PrincipleNode,
    group: GroupNode,
    emptyGroup: EmptyGroupNode,
  };

  function EditorSheet({ editor, principles, bridge, busy, onClose, onSaved }) {
    const dialogRef = useRef(null);
    const isOpen = Boolean(editor);
    useDialogFocus(isOpen, dialogRef);
    if (!editor) return null;

    const principle = editor.principle || null;
    const nextNumber = [...principles, ...(bridge.options.getDeletedPrinciples?.() || [])]
      .reduce((maximum, row) => Math.max(maximum, Number(row.principle_number) || 0), 0) + 1;

    const submit = async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const number = Number(form.get("principle-number"));
      const body = String(form.get("principle-body") || "").trim();
      const references = parseReferences(form.get("cross-references"));
      if (!Number.isInteger(number) || number < 1) return bridge.options.toast?.("Choose a whole principle number greater than zero.", "error");
      if (!body) return bridge.options.toast?.("Write a principle before saving it.", "error");
      if (body.length > 2000) return bridge.options.toast?.("Keep the principle under 2,000 characters.", "error");
      const duplicate = principles.find((row) => row.id !== principle?.id && Number(row.principle_number) === number);
      if (duplicate) return bridge.options.toast?.(`Principle #${number} is already in use.`, "error");
      const availableNumbers = new Set(principles.filter((row) => row.id !== principle?.id).map((row) => Number(row.principle_number)));
      if (principle) availableNumbers.add(number);
      const unknown = references.filter((reference) => !availableNumbers.has(reference));
      if (unknown.length) return bridge.options.toast?.(`Principle ${unknown.map((value) => `#${value}`).join(", ")} does not exist yet.`, "error");
      await onSaved({ principle, number, body, references });
    };

    return html`
      <div className="tjm-rf-dialog-backdrop" role="presentation" onMouseDown=${(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}>
        <section className="tjm-rf-editor-sheet" role="dialog" aria-modal="true" aria-labelledby="tjm-rf-editor-title" ref=${dialogRef}>
          <header>
            <div>
              <small>${principle ? "EDIT PRINCIPLE" : "NEW PRINCIPLE"}</small>
              <h3 id="tjm-rf-editor-title">${principle ? `Principle #${principle.principle_number}` : "Capture a discovery"}</h3>
            </div>
            <button type="button" data-close-dialog onClick=${onClose} disabled=${busy} aria-label="Close">×</button>
          </header>
          <form onSubmit=${submit}>
            <label>Principle number
              <input name="principle-number" type="number" min="1" step="1" required defaultValue=${principle?.principle_number || nextNumber} />
            </label>
            <label>Principle
              <textarea name="principle-body" maxLength="2000" required defaultValue=${principle?.body || ""}
                placeholder="Write the principle in your own words."></textarea>
            </label>
            <label>Related principle numbers
              <input name="cross-references" inputMode="numeric" defaultValue=${(principle?.cross_reference_numbers || []).join(", ")}
                placeholder="10, 20, 30" />
              <small>Separate principle numbers with commas.</small>
            </label>
            <div className="tjm-rf-sheet-actions">
              <button type="submit" className="is-primary" disabled=${busy}>${busy ? "Saving…" : "Save"}</button>
              <button type="button" onClick=${onClose} disabled=${busy}>Cancel</button>
            </div>
          </form>
        </section>
      </div>
    `;
  }

  function NameGroupSheet({ group, busy, onClose, onSave }) {
    const dialogRef = useRef(null);
    useDialogFocus(Boolean(group), dialogRef);
    if (!group) return null;
    return html`
      <div className="tjm-rf-dialog-backdrop" role="presentation" onMouseDown=${(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}>
        <section className="tjm-rf-small-dialog" role="dialog" aria-modal="true" aria-labelledby="tjm-rf-group-title" ref=${dialogRef}>
          <header><div><small>GROUP NAME</small><h3 id="tjm-rf-group-title">Name this group</h3></div>
            <button type="button" data-close-dialog onClick=${onClose} disabled=${busy} aria-label="Close">×</button></header>
          <form onSubmit=${(event) => {
            event.preventDefault();
            onSave(String(new FormData(event.currentTarget).get("group-title") || "").trim());
          }}>
            <label>Group name
              <input name="group-title" maxLength="80" defaultValue=${group.customTitle || ""}
                placeholder=${group.id ? `Group led by #${group.leader?.principle_number || ""}` : "New group"} />
            </label>
            <p>Leave the name blank to use the automatic “Group led by #…” name.</p>
            <div className="tjm-rf-sheet-actions">
              <button type="submit" className="is-primary" disabled=${busy}>${busy ? "Saving…" : "Save name"}</button>
              <button type="button" onClick=${onClose} disabled=${busy}>Cancel</button>
            </div>
          </form>
        </section>
      </div>
    `;
  }

  function MoveSheet({ principle, groups, busy, onClose, onMove }) {
    const dialogRef = useRef(null);
    useDialogFocus(Boolean(principle), dialogRef);
    if (!principle) return null;
    return html`
      <div className="tjm-rf-dialog-backdrop" role="presentation" onMouseDown=${(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}>
        <section className="tjm-rf-small-dialog" role="dialog" aria-modal="true" aria-labelledby="tjm-rf-move-title" ref=${dialogRef}>
          <header><div><small>MOVE PRINCIPLE</small><h3 id="tjm-rf-move-title">Principle #${principle.principle_number}</h3></div>
            <button type="button" data-close-dialog onClick=${onClose} disabled=${busy} aria-label="Close">×</button></header>
          <div className="tjm-rf-move-list">
            ${principle.group_id && html`<button type="button" disabled=${busy} onClick=${() => onMove("standalone")}>Make standalone</button>`}
            <button type="button" disabled=${busy} onClick=${() => onMove("new")}>Create a new group</button>
            ${groups.filter((group) => group.id !== principle.group_id).map((group) => html`
              <button type="button" disabled=${busy} onClick=${() => onMove(group.id)}>
                <strong>${group.title}</strong><span>${group.members.length} ${group.members.length === 1 ? "principle" : "principles"}</span>
              </button>
            `)}
          </div>
        </section>
      </div>
    `;
  }

  function ContextMenu({ menu, onClose, onEdit, onMove, onDelete, onRename, onDissolve }) {
    useEffect(() => {
      if (!menu) return undefined;
      const close = (event) => {
        if (!event.target.closest?.(".tjm-rf-context-menu")) onClose();
      };
      const timer = setTimeout(() => document.addEventListener("pointerdown", close, true), 0);
      return () => {
        clearTimeout(timer);
        document.removeEventListener("pointerdown", close, true);
      };
    }, [menu, onClose]);
    if (!menu) return null;
    const style = { left: `${Math.max(8, menu.x)}px`, top: `${Math.max(8, menu.y)}px` };
    return html`
      <div className="tjm-rf-context-menu" style=${style} role="menu">
        ${menu.kind === "principle" && html`
          <button type="button" role="menuitem" onClick=${() => onEdit(menu.item)}>Edit principle</button>
          <button type="button" role="menuitem" onClick=${() => onMove(menu.item)}>Move to another group</button>
          <button type="button" role="menuitem" className="is-danger" onClick=${() => onDelete([menu.item])}>Delete principle</button>
        `}
        ${menu.kind === "group" && html`
          <button type="button" role="menuitem" onClick=${() => onRename(menu.item)}>Edit group name</button>
          <button type="button" role="menuitem" onClick=${() => onDissolve(menu.item)}>Remove group, keep principles</button>
          <button type="button" role="menuitem" className="is-danger" onClick=${() => onDelete(menu.item.members)}>Delete group and principles</button>
        `}
        ${menu.kind === "emptyGroup" && html`
          <button type="button" role="menuitem" onClick=${() => onRename(menu.item)}>Edit group name</button>
          <button type="button" role="menuitem" className="is-danger" onClick=${() => onDelete([])}>Delete empty group</button>
        `}
      </div>
    `;
  }

  function MindMapFlow({
    nodes,
    onNodesChange,
    nodeExtent,
    translateExtent,
    initialViewport,
    onViewportEnd,
    onNodeDragStart,
    onNodeDragStop,
    onInit,
    onPaneClick,
    emptyMessage,
  }) {
    return html`
      <div className="tjm-rf-flow-wrap">
        <${ReactFlow}
          nodes=${nodes}
          edges=${[]}
          nodeTypes=${nodeTypes}
          onNodesChange=${onNodesChange}
          onNodeDragStart=${onNodeDragStart}
          onNodeDragStop=${onNodeDragStop}
          onInit=${onInit}
          onPaneClick=${onPaneClick}
          onMoveEnd=${(_, viewport) => onViewportEnd(viewport)}
          defaultViewport=${initialViewport || { x: 0, y: 0, zoom: 0.78 }}
          minZoom=${0.42}
          maxZoom=${2.2}
          translateExtent=${translateExtent}
          nodeExtent=${nodeExtent}
          panOnDrag=${true}
          panOnScroll=${false}
          zoomOnScroll=${true}
          zoomOnPinch=${true}
          zoomOnDoubleClick=${false}
          preventScrolling=${true}
          selectionOnDrag=${false}
          elementsSelectable=${true}
          nodesConnectable=${false}
          nodesFocusable=${true}
          fitView=${!initialViewport}
          fitViewOptions=${{ padding: 0.18, minZoom: 0.5, maxZoom: 1 }}
          proOptions=${{ hideAttribution: false }}>
          <${Background} gap=${28} size=${1} color="#d8c9d4" />
          <${Controls} position="bottom-right" showInteractive=${false} />
          <${MiniMap} position="bottom-left" pannable=${true} zoomable=${true}
            nodeColor=${(node) => node.type === "group" || node.type === "emptyGroup" ? "#6f4868" : "#d1a33c"} />
          <${Panel} position="top-left" className="tjm-rf-boundary-note">Drag the background to pan · pinch or scroll to zoom</${Panel}>
          ${nodes.length === 0 && html`<${Panel} position="top-center" className="tjm-rf-empty-panel">${emptyMessage}</${Panel}>`}
        </${ReactFlow}>
      </div>
    `;
  }

  function PrincipleMindMap({ bridge }) {
    const session = bridge.options.getSession?.();
    const userId = session?.user?.id || "guest";
    const [principles, applyRows] = useBridgeRows(bridge);
    const [layout, setLayout] = usePersistentLayout(CONFIG.planId, userId);
    const [openGroupId, setOpenGroupId] = useState("");
    const [expandedId, setExpandedId] = useState("");
    const [editor, setEditor] = useState(null);
    const [renameGroup, setRenameGroup] = useState(null);
    const [movePrinciple, setMovePrinciple] = useState(null);
    const [menu, setMenu] = useState(null);
    const [busy, setBusy] = useState(false);
    const [toolbarOpen, setToolbarOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [mainNodes, setMainNodes, onMainNodesChange] = useNodesState([]);
    const [groupNodes, setGroupNodes, onGroupNodesChange] = useNodesState([]);
    const mainFlow = useRef(null);
    const groupFlow = useRef(null);
    const memberDrag = useRef(null);
    const [memberGhost, setMemberGhost] = useState(null);
    const models = useMemo(() => groupPrinciples(principles, layout), [principles, layout]);
    const openGroup = models.groups.find((group) => group.id === openGroupId) || null;

    const updateLayout = useCallback((updater) => setLayout((current) => {
      const next = updater({ ...current,
        mainPositions: { ...(current.mainPositions || {}) },
        groupPositions: Object.fromEntries(Object.entries(current.groupPositions || {}).map(([key, value]) => [key, { ...value }])),
        viewports: { ...(current.viewports || {}) },
        leaders: { ...(current.leaders || {}) },
        groupOrders: Object.fromEntries(Object.entries(current.groupOrders || {}).map(([key, value]) => [key, [...value]])),
        emptyGroups: [...(current.emptyGroups || [])],
      });
      return next;
    }), [setLayout]);

    const notifySync = useCallback((label, mode = "") => bridge.options.setSync?.(label, mode), [bridge]);
    const notify = useCallback((message, type = "") => bridge.options.toast?.(message, type), [bridge]);

    const ensureSignedIn = useCallback(() => {
      if (bridge.options.getSession?.()) return true;
      bridge.options.showSignIn?.();
      return false;
    }, [bridge]);

    const commitReturnedRows = useCallback((data, successLabel = "Saved") => {
      const next = activeRows(Array.isArray(data) ? data : data ? [data] : []);
      if (next.length) applyRows(next);
      notifySync(successLabel, "synced");
      return next;
    }, [applyRows, notifySync]);

    function layoutPositionFor(principle, groupId) {
      if (groupId) {
        const pos = layout.groupPositions[groupId]?.[principle.id] || { x: 100, y: 100 };
        return { x: pos.x + 150, y: pos.y + 80 };
      }
      const pos = layout.mainPositions[`principle:${principle.id}`] || layout.mainPositions[`single:${principle.id}`] || { x: 100, y: 100 };
      return { x: pos.x + 130, y: pos.y + 60 };
    }

    const makeNodeCallbacks = useCallback(() => ({
      bridge,
      expanded: false,
      onToggle: (id) => setExpandedId((current) => current === id ? "" : id),
      onEdit: (principle) => { setMenu(null); setEditor({ principle }); },
      onMenu: (id) => {
        const principle = principles.find((row) => row.id === id);
        const button = document.querySelector(`[data-rf-principle-id="${CSS.escape(id)}"] .tjm-rf-node-menu`);
        const rect = button?.getBoundingClientRect();
        if (principle && rect) setMenu({ kind: "principle", item: principle, x: rect.right - 190, y: rect.bottom + 6 });
      },
      onFindReference: (number) => {
        const target = principles.find((row) => Number(row.principle_number) === Number(number));
        if (!target) return notify(`Principle #${number} could not be found.`, "error");
        if (target.group_id) setOpenGroupId(target.group_id);
        else setOpenGroupId("");
        setExpandedId(target.id);
        requestAnimationFrame(() => {
          const flow = target.group_id ? groupFlow.current : mainFlow.current;
          const center = layoutPositionFor(target, target.group_id);
          flow?.setCenter?.(center.x, center.y, { zoom: 1, duration: 320 });
        });
      },
      onGoToReading: (principle) => bridge.options.goToReadingById?.(principle.reading_id),
      onMakeStandalone: (principle) => makeStandalone(principle),
    }), [bridge, principles, notify, layout]);

    const openGroupById = useCallback((groupId, principleId = "") => {
      setMenu(null);
      setOpenGroupId(groupId);
      setExpandedId(principleId);
      setToolbarOpen(false);
      history.pushState({ ...(history.state || {}), tjmReactFlowGroup: groupId }, "");
    }, []);

    const groupMenu = useCallback((group) => {
      const button = document.querySelector(`[data-rf-group-id="${CSS.escape(group.id)}"] .tjm-rf-node-menu`);
      const rect = button?.getBoundingClientRect();
      if (rect) setMenu({ kind: "group", item: group, x: rect.right - 210, y: rect.bottom + 6 });
    }, []);

    const emptyGroupMenu = useCallback((group) => {
      const button = document.querySelector(`[data-rf-empty-group-id="${CSS.escape(group.id)}"] .tjm-rf-node-menu`);
      const rect = button?.getBoundingClientRect();
      if (rect) setMenu({ kind: "emptyGroup", item: group, x: rect.right - 210, y: rect.bottom + 6 });
    }, []);

    const buildMainNodes = useCallback(() => {
      const callbacks = makeNodeCallbacks();
      const next = [];
      const positions = layout.mainPositions || {};
      let index = 0;
      const defaultPosition = () => ({ x: 80 + (index % 4) * 480, y: 80 + Math.floor(index++ / 4) * 260 });

      for (const group of models.groups) {
        const key = `group:${group.id}`;
        const position = positions[key] || defaultPosition();
        next.push({
          id: key,
          type: "group",
          position,
          dragHandle: ".rf-group-drag-handle",
          data: {
            ...callbacks,
            group,
            onOpenGroup: openGroupById,
            onGroupMenu: groupMenu,
            onCirclePointerDown: beginMemberCircleGesture,
          },
        });
      }

      for (const principle of models.singles) {
        const key = `principle:${principle.id}`;
        const position = positions[key] || positions[`single:${principle.id}`] || defaultPosition();
        next.push({
          id: key,
          type: "principle",
          position,
          dragHandle: ".rf-node-drag-handle",
          data: { ...callbacks, principle, expanded: expandedId === principle.id },
        });
      }

      for (const empty of layout.emptyGroups || []) {
        const key = `empty:${empty.id}`;
        const position = positions[key] || defaultPosition();
        next.push({
          id: key,
          type: "emptyGroup",
          position,
          dragHandle: ".rf-group-drag-handle",
          data: { group: empty, onEmptyGroupMenu: emptyGroupMenu },
        });
      }
      return next;
    }, [layout, models, expandedId, makeNodeCallbacks, openGroupById, groupMenu, emptyGroupMenu]);

    const buildGroupNodes = useCallback((group) => {
      if (!group) return [];
      const callbacks = makeNodeCallbacks();
      const saved = layout.groupPositions[group.id] || {};
      let index = 0;
      return group.members.map((principle) => {
        const position = saved[principle.id] || { x: 80 + (index % 4) * 400, y: 80 + Math.floor(index++ / 4) * 240 };
        return {
          id: `principle:${principle.id}`,
          type: "principle",
          position,
          dragHandle: ".rf-node-drag-handle",
          data: { ...callbacks, principle, expanded: expandedId === principle.id },
        };
      });
    }, [layout, expandedId, makeNodeCallbacks]);

    useEffect(() => {
      setMainNodes(buildMainNodes());
    }, [buildMainNodes, setMainNodes]);

    useEffect(() => {
      setGroupNodes(buildGroupNodes(openGroup));
    }, [buildGroupNodes, openGroup, setGroupNodes]);

    useEffect(() => {
      const onPop = () => {
        if (openGroupId) {
          setOpenGroupId("");
          setExpandedId("");
        }
      };
      window.addEventListener("popstate", onPop);
      return () => window.removeEventListener("popstate", onPop);
    }, [openGroupId]);

    const saveViewport = useCallback((mapId, viewport) => {
      updateLayout((next) => {
        next.viewports[mapId] = viewport;
        return next;
      });
    }, [updateLayout]);

    const saveNodePosition = useCallback((mapId, node) => {
      updateLayout((next) => {
        if (mapId === "main") next.mainPositions[node.id] = node.position;
        else {
          const groupId = mapId.slice(6);
          next.groupPositions[groupId] = { ...(next.groupPositions[groupId] || {}), [node.id.replace(/^principle:/, "")]: node.position };
        }
        return next;
      });
    }, [updateLayout]);

    const recomputeLeader = useCallback((groupId, nodes) => {
      if (!groupId || !nodes.length) return;
      const sorted = [...nodes].sort((left, right) => {
        if (Math.abs(left.position.y - right.position.y) > 24) return left.position.y - right.position.y;
        return left.position.x - right.position.x;
      });
      const ids = sorted.map((node) => node.id.replace(/^principle:/, ""));
      updateLayout((next) => {
        next.groupOrders[groupId] = ids;
        next.leaders[groupId] = ids[0];
        return next;
      });
    }, [updateLayout]);

    const handleMainNodeDragStop = useCallback(async (event, node) => {
      saveNodePosition("main", node);
      navigator.vibrate?.(10);
      if (node.type !== "principle") return;
      const intersecting = mainFlow.current?.getIntersectingNodes?.(node, true) || [];
      const target = intersecting.find((candidate) => candidate.id !== node.id && (candidate.type === "group" || candidate.type === "emptyGroup" || candidate.type === "principle"));
      if (!target) return;
      const principle = principles.find((row) => `principle:${row.id}` === node.id);
      if (!principle) return;
      await movePrincipleToNode(principle, target, { x: event.clientX, y: event.clientY });
    }, [principles, saveNodePosition, models, layout]);

    const handleGroupNodeDragStop = useCallback((event, node) => {
      if (!openGroup) return;
      saveNodePosition(`group:${openGroup.id}`, node);
      setGroupNodes((current) => {
        const updated = current.map((item) => item.id === node.id ? { ...item, position: node.position } : item);
        recomputeLeader(openGroup.id, updated);
        return updated;
      });
      navigator.vibrate?.(10);
    }, [openGroup, saveNodePosition, setGroupNodes, recomputeLeader]);

    const handleNodeDragStart = useCallback(() => {
      setMenu(null);
      navigator.vibrate?.(8);
    }, []);

    async function runMutation(label, mutation, successMessage) {
      if (!ensureSignedIn()) return null;
      setBusy(true);
      notifySync(label, "saving");
      try {
        const result = await mutation();
        if (result?.error) throw result.error;
        if (successMessage) notify(successMessage);
        notifySync("Synced across devices", "synced");
        return result;
      } catch (error) {
        notifySync("Sync failed", "error");
        notify(error?.message || "That change could not be saved.", "error");
        return null;
      } finally {
        setBusy(false);
      }
    }

    async function savePrinciple({ principle, number, body, references }) {
      const db = bridge.options.getDb();
      if (principle) {
        const result = await runMutation("Saving changes…", () => db.rpc("update_conflict_principle", {
          p_principle_id: principle.id,
          p_principle_number: number,
          p_body: body,
          p_cross_reference_numbers: references,
        }), `Principle #${number} updated.`);
        if (!result) return;
        commitReturnedRows(result.data, "Changes saved");
        setEditor(null);
        setExpandedId(principle.id);
        return;
      }

      const result = await runMutation("Saving principle…", () => db.rpc("create_conflict_principle", {
        p_plan_id: CONFIG.planId,
        p_reading_id: SENTINEL_READING_ID,
        p_body: body,
        p_cross_reference_numbers: references,
        p_principle_number: number,
      }), `Principle #${number} saved.`);
      if (!result) return;
      const created = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!created) return;
      const next = sortByNumber([...principles, created]);
      applyRows(next);
      const center = mainFlow.current?.screenToFlowPosition?.({ x: window.innerWidth / 2, y: window.innerHeight / 2 }) || { x: 160, y: 160 };
      updateLayout((layoutNext) => {
        layoutNext.mainPositions[`principle:${created.id}`] = { x: clamp(center.x, 0, 2100), y: clamp(center.y, 0, 1300) };
        return layoutNext;
      });
      setEditor(null);
      setExpandedId(created.id);
    }

    async function renameExistingGroup(group, title) {
      if (!group.id) return;
      const db = bridge.options.getDb();
      const result = await runMutation("Saving group name…", () => db.rpc("rename_conflict_principle_group", {
        p_group_id: group.id,
        p_title: title,
      }), title ? "Group name updated." : "The automatic group name is active.");
      if (!result) return;
      commitReturnedRows(result.data, "Group name saved");
      setRenameGroup(null);
    }

    function renameLocalGroup(group, title) {
      updateLayout((next) => {
        next.emptyGroups = next.emptyGroups.map((item) => item.id === group.id ? { ...item, title: title || "New group" } : item);
        return next;
      });
      setRenameGroup(null);
    }

    async function makeStandalone(principle) {
      if (!principle.group_id) return;
      const db = bridge.options.getDb();
      const result = await runMutation("Moving principle…", () => db.rpc("move_conflict_principles", {
        p_principle_ids: [principle.id],
        p_target_principle_id: null,
        p_mode: "standalone",
        p_group_title: null,
      }), `Principle #${principle.principle_number} is now standalone.`);
      if (!result) return;
      const nextRows = commitReturnedRows(result.data, "Principle moved");
      const remaining = nextRows.filter((row) => row.group_id === principle.group_id);
      updateLayout((next) => {
        next.groupOrders[principle.group_id] = (next.groupOrders[principle.group_id] || []).filter((id) => id !== principle.id);
        if (next.leaders[principle.group_id] === principle.id) next.leaders[principle.group_id] = remaining[0]?.id || "";
        if (next.groupPositions[principle.group_id]) delete next.groupPositions[principle.group_id][principle.id];
        const center = mainFlow.current?.screenToFlowPosition?.({ x: window.innerWidth / 2, y: window.innerHeight / 2 }) || { x: 160, y: 160 };
        next.mainPositions[`principle:${principle.id}`] = { x: clamp(center.x, 0, 2100), y: clamp(center.y, 0, 1300) };
        return next;
      });
      if (openGroupId === principle.group_id) setOpenGroupId("");
      setMovePrinciple(null);
    }

    async function moveFromSheet(target) {
      const principle = movePrinciple;
      if (!principle) return;
      if (target === "standalone") return makeStandalone(principle);
      const db = bridge.options.getDb();
      if (target === "new") {
        const result = await runMutation("Creating group…", () => db.rpc("move_conflict_principles", {
          p_principle_ids: [principle.id],
          p_target_principle_id: null,
          p_mode: "new",
          p_group_title: null,
        }), "New group created.");
        if (!result) return;
        const nextRows = commitReturnedRows(result.data, "Group created");
        const moved = nextRows.find((row) => row.id === principle.id);
        if (moved?.group_id) updateLayout((next) => {
          next.groupOrders[moved.group_id] = [principle.id];
          next.leaders[moved.group_id] = principle.id;
          return next;
        });
        setMovePrinciple(null);
        return;
      }
      const targetGroup = models.groups.find((group) => group.id === target);
      if (!targetGroup) return;
      await movePrincipleToExistingGroup(principle, targetGroup);
      setMovePrinciple(null);
    }

    async function movePrincipleToExistingGroup(principle, targetGroup, insertIndex = null) {
      const targetId = targetGroup.members[0]?.id;
      if (!targetId || targetId === principle.id) return;
      const db = bridge.options.getDb();
      const oldGroupId = principle.group_id;
      const result = await runMutation("Moving principle…", () => db.rpc("move_conflict_principles", {
        p_principle_ids: [principle.id],
        p_target_principle_id: targetId,
        p_mode: "existing",
        p_group_title: null,
      }), `Principle #${principle.principle_number} moved.`);
      if (!result) return;
      const nextRows = commitReturnedRows(result.data, "Principle moved");
      const moved = nextRows.find((row) => row.id === principle.id);
      const destinationId = moved?.group_id || targetGroup.id;
      updateLayout((next) => {
        if (oldGroupId) {
          next.groupOrders[oldGroupId] = (next.groupOrders[oldGroupId] || []).filter((id) => id !== principle.id);
          if (next.leaders[oldGroupId] === principle.id) next.leaders[oldGroupId] = next.groupOrders[oldGroupId][0] || "";
          if (next.groupPositions[oldGroupId]) delete next.groupPositions[oldGroupId][principle.id];
        }
        const base = (next.groupOrders[destinationId] || targetGroup.members.map((member) => member.id)).filter((id) => id !== principle.id);
        const index = insertIndex == null ? base.length : clamp(insertIndex, 0, base.length);
        base.splice(index, 0, principle.id);
        next.groupOrders[destinationId] = base;
        if (!next.leaders[destinationId]) next.leaders[destinationId] = base[0];
        delete next.mainPositions[`principle:${principle.id}`];
        delete next.mainPositions[`single:${principle.id}`];
        return next;
      });
    }

    async function movePrincipleToNode(principle, targetNode) {
      if (targetNode.type === "group") {
        const targetGroup = models.groups.find((group) => `group:${group.id}` === targetNode.id);
        if (targetGroup) await movePrincipleToExistingGroup(principle, targetGroup);
        return;
      }
      if (targetNode.type === "principle") {
        const targetPrinciple = principles.find((row) => `principle:${row.id}` === targetNode.id);
        if (!targetPrinciple || targetPrinciple.id === principle.id) return;
        const db = bridge.options.getDb();
        const result = await runMutation("Creating group…", () => db.rpc("move_conflict_principles", {
          p_principle_ids: [principle.id],
          p_target_principle_id: targetPrinciple.id,
          p_mode: "existing",
          p_group_title: null,
        }), "Principles grouped.");
        if (!result) return;
        const nextRows = commitReturnedRows(result.data, "Principles grouped");
        const moved = nextRows.find((row) => row.id === principle.id);
        const groupId = moved?.group_id || nextRows.find((row) => row.id === targetPrinciple.id)?.group_id;
        if (groupId) updateLayout((next) => {
          next.groupOrders[groupId] = [targetPrinciple.id, principle.id];
          next.leaders[groupId] = targetPrinciple.id;
          const targetPosition = targetNode.position || { x: 100, y: 100 };
          next.mainPositions[`group:${groupId}`] = targetPosition;
          delete next.mainPositions[`principle:${targetPrinciple.id}`];
          delete next.mainPositions[`principle:${principle.id}`];
          return next;
        });
        return;
      }
      if (targetNode.type === "emptyGroup") {
        const emptyId = targetNode.id.replace(/^empty:/, "");
        const empty = layout.emptyGroups.find((item) => item.id === emptyId);
        const db = bridge.options.getDb();
        const result = await runMutation("Creating group…", () => db.rpc("move_conflict_principles", {
          p_principle_ids: [principle.id],
          p_target_principle_id: null,
          p_mode: "new",
          p_group_title: empty?.title === "New group" ? null : empty?.title || null,
        }), "Group created.");
        if (!result) return;
        const nextRows = commitReturnedRows(result.data, "Group created");
        const moved = nextRows.find((row) => row.id === principle.id);
        if (moved?.group_id) updateLayout((next) => {
          next.emptyGroups = next.emptyGroups.filter((item) => item.id !== emptyId);
          next.groupOrders[moved.group_id] = [principle.id];
          next.leaders[moved.group_id] = principle.id;
          next.mainPositions[`group:${moved.group_id}`] = targetNode.position;
          delete next.mainPositions[targetNode.id];
          delete next.mainPositions[`principle:${principle.id}`];
          return next;
        });
      }
    }

    async function dissolveGroup(group) {
      if (!window.confirm(`Remove “${group.title}” and keep every principle as a standalone principle?`)) return;
      const db = bridge.options.getDb();
      const result = await runMutation("Removing group…", () => db.rpc("dissolve_conflict_principle_group", {
        p_group_id: group.id,
      }), "The group was removed. Every principle was kept.");
      if (!result) return;
      commitReturnedRows(result.data, "Principles kept");
      updateLayout((next) => {
        const groupPosition = next.mainPositions[`group:${group.id}`] || { x: 80, y: 80 };
        group.members.forEach((member, index) => {
          next.mainPositions[`principle:${member.id}`] = { x: groupPosition.x + (index % 2) * 300, y: groupPosition.y + Math.floor(index / 2) * 150 };
        });
        delete next.mainPositions[`group:${group.id}`];
        delete next.groupPositions[group.id];
        delete next.groupOrders[group.id];
        delete next.leaders[group.id];
        return next;
      });
      setOpenGroupId("");
      setMenu(null);
    }

    async function deletePrinciples(items) {
      if (menu?.kind === "emptyGroup" && items.length === 0) {
        const id = menu.item.id;
        updateLayout((next) => {
          next.emptyGroups = next.emptyGroups.filter((item) => item.id !== id);
          delete next.mainPositions[`empty:${id}`];
          return next;
        });
        setMenu(null);
        return;
      }
      if (!items.length) return;
      const label = items.length === 1 ? `principle #${items[0].principle_number}` : `${items.length} principles`;
      if (!window.confirm(`Move ${label} to Recently Deleted?`)) return;
      const db = bridge.options.getDb();
      const result = await runMutation("Moving to Recently Deleted…", () => db.rpc("soft_delete_conflict_principles", {
        p_principle_ids: items.map((item) => item.id),
      }), `${label} moved to Recently Deleted.`);
      if (!result) return;
      const nextRows = commitReturnedRows(result.data, "Moved to Recently Deleted");
      const removedIds = new Set(items.map((item) => item.id));
      const deleted = items.map((item) => ({ ...item, deleted_at: new Date().toISOString() }));
      bridge.options.setDeletedPrinciples?.([...deleted, ...(bridge.options.getDeletedPrinciples?.() || []).filter((item) => !removedIds.has(item.id))]);
      updateLayout((next) => {
        items.forEach((item) => {
          delete next.mainPositions[`principle:${item.id}`];
          delete next.mainPositions[`single:${item.id}`];
          if (item.group_id && next.groupPositions[item.group_id]) delete next.groupPositions[item.group_id][item.id];
        });
        Object.keys(next.groupOrders).forEach((groupId) => {
          next.groupOrders[groupId] = next.groupOrders[groupId].filter((id) => !removedIds.has(id));
          if (removedIds.has(next.leaders[groupId])) next.leaders[groupId] = next.groupOrders[groupId][0] || "";
        });
        return next;
      });
      if (openGroupId && !nextRows.some((row) => row.group_id === openGroupId)) setOpenGroupId("");
      setMenu(null);
    }

    function addEmptyGroup(title = "New group") {
      if (!ensureSignedIn()) return;
      const id = uuid();
      const center = mainFlow.current?.screenToFlowPosition?.({ x: window.innerWidth / 2, y: window.innerHeight / 2 }) || { x: 220, y: 180 };
      updateLayout((next) => {
        next.emptyGroups.push({ id, title: title || "New group" });
        next.mainPositions[`empty:${id}`] = { x: clamp(center.x, 0, 2100), y: clamp(center.y, 0, 1300) };
        return next;
      });
      setToolbarOpen(false);
      notify("Empty group created. Drag a principle into it when you are ready.");
    }

    function beginMemberCircleGesture(event, member, group) {
      event.preventDefault();
      event.stopPropagation();
      setMenu(null);
      const button = event.currentTarget;
      const pointerId = event.pointerId;
      const start = { x: event.clientX, y: event.clientY };
      const state = {
        pointerId,
        member,
        group,
        button,
        start,
        active: false,
        timer: null,
        move: null,
        up: null,
        cancel: null,
      };
      memberDrag.current = state;

      const cleanup = () => {
        clearTimeout(state.timer);
        window.removeEventListener("pointermove", state.move, true);
        window.removeEventListener("pointerup", state.up, true);
        window.removeEventListener("pointercancel", state.cancel, true);
        button.classList.remove("is-circle-dragging");
        setMemberGhost(null);
        memberDrag.current = null;
      };

      const activate = () => {
        if (memberDrag.current !== state) return;
        state.active = true;
        button.classList.add("is-circle-dragging");
        setMemberGhost({ number: member.principle_number, x: start.x, y: start.y });
        navigator.vibrate?.(12);
      };

      state.move = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const distance = Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y);
        if (!state.active && distance > 8) activate();
        if (state.active) {
          moveEvent.preventDefault();
          moveEvent.stopImmediatePropagation();
          setMemberGhost({ number: member.principle_number, x: moveEvent.clientX, y: moveEvent.clientY });
        }
      };

      state.up = async (upEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        clearTimeout(state.timer);
        if (!state.active) {
          cleanup();
          openGroupById(group.id, member.id);
          return;
        }
        upEvent.preventDefault();
        upEvent.stopImmediatePropagation();
        button.style.visibility = "hidden";
        const target = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
        button.style.visibility = "";
        const targetCircle = target?.closest?.(".tjm-rf-member-circle");
        const targetGroupNode = target?.closest?.("[data-rf-group-id]");
        const targetSingleNode = target?.closest?.("[data-rf-principle-id]");
        const targetEmptyNode = target?.closest?.("[data-rf-empty-group-id]");
        const pane = target?.closest?.(".react-flow__pane");
        cleanup();

        if (targetCircle && targetCircle.dataset.rfGroupId === group.id) {
          const ids = group.members.map((item) => item.id).filter((id) => id !== member.id);
          const targetId = targetCircle.dataset.rfMemberId;
          const targetIndex = ids.indexOf(targetId);
          ids.splice(targetIndex < 0 ? ids.length : targetIndex, 0, member.id);
          updateLayout((next) => {
            next.groupOrders[group.id] = ids;
            next.leaders[group.id] = ids[0];
            return next;
          });
          return;
        }

        if (targetGroupNode) {
          const destination = models.groups.find((item) => item.id === targetGroupNode.dataset.rfGroupId);
          if (destination && destination.id !== group.id) await movePrincipleToExistingGroup(member, destination);
          return;
        }

        if (targetSingleNode) {
          const targetPrinciple = principles.find((item) => item.id === targetSingleNode.dataset.rfPrincipleId);
          if (targetPrinciple && targetPrinciple.id !== member.id) {
            const targetNode = mainNodes.find((node) => node.id === `principle:${targetPrinciple.id}`);
            if (targetNode) await movePrincipleToNode(member, targetNode);
          }
          return;
        }

        if (targetEmptyNode) {
          const targetNode = mainNodes.find((node) => node.id === `empty:${targetEmptyNode.dataset.rfEmptyGroupId}`);
          if (targetNode) await movePrincipleToNode(member, targetNode);
          return;
        }

        if (pane) await makeStandalone(member);
      };

      state.cancel = () => cleanup();
      state.timer = setTimeout(activate, 260);
      window.addEventListener("pointermove", state.move, { capture: true, passive: false });
      window.addEventListener("pointerup", state.up, { capture: true, passive: false });
      window.addEventListener("pointercancel", state.cancel, { capture: true, passive: false });
    }

    const searchPrinciple = useCallback((event) => {
      event.preventDefault();
      const query = search.trim().toLowerCase();
      if (!query) return;
      const found = principles.find((principle) => String(principle.principle_number) === query || principle.body.toLowerCase().includes(query));
      if (!found) return notify(`No principle contains “${search}.”`, "error");
      if (found.group_id) {
        openGroupById(found.group_id, found.id);
      } else {
        setOpenGroupId("");
        setExpandedId(found.id);
        requestAnimationFrame(() => {
          const pos = layout.mainPositions[`principle:${found.id}`] || { x: 100, y: 100 };
          mainFlow.current?.setCenter?.(pos.x + 130, pos.y + 70, { zoom: 1.05, duration: 360 });
        });
      }
      setToolbarOpen(false);
    }, [search, principles, notify, openGroupById, layout]);

    if (!session) {
      return html`
        <section className="tjm-rf-signed-out">
          <p className="eyebrow">YOUR MIND MAP</p>
          <h2>Sign in to build your Mind Map.</h2>
          <p>Your principles, groups, and reading progress are private to your account.</p>
          <button type="button" onClick=${() => bridge.options.showSignIn?.()}>Continue with Google</button>
        </section>
      `;
    }

    const mapId = openGroup ? `group:${openGroup.id}` : "main";
    const mapViewport = layout.viewports[mapId] || null;

    return html`
      <section className="tjm-rf-app" aria-labelledby="tjm-rf-heading">
        <header className="tjm-rf-app-header">
          <div>
            ${openGroup && html`<button type="button" className="tjm-rf-back" onClick=${() => { setOpenGroupId(""); setExpandedId(""); }}>← Back to Mind Map</button>`}
            <p className="eyebrow">${openGroup ? `GROUP LED BY PRINCIPLE #${openGroup.leader?.principle_number}` : "YOUR DISCOVERIES"}</p>
            <h2 id="tjm-rf-heading">${openGroup ? openGroup.title : "Mind Map"}</h2>
            <p>${openGroup
              ? "Drag only the circled number to move a principle. Tap its text to open or close it."
              : "Move groups and principles anywhere. Drag the background to pan and use the controls or pinch to zoom."}</p>
          </div>
          <div className="tjm-rf-header-actions">
            ${openGroup && html`<button type="button" onClick=${() => setRenameGroup(openGroup)}>Rename group</button>`}
            <button type="button" className="tjm-rf-menu-toggle" aria-expanded=${String(toolbarOpen)}
              onClick=${() => setToolbarOpen((value) => !value)} aria-label="Mind Map tools">
              <span></span><span></span><span></span>
            </button>
          </div>
          ${toolbarOpen && html`
            <aside className="tjm-rf-toolbar">
              <header><strong>Mind Map tools</strong><button type="button" onClick=${() => setToolbarOpen(false)}>×</button></header>
              <button type="button" onClick=${() => { setEditor({ principle: null }); setToolbarOpen(false); }}>+ New principle</button>
              <button type="button" onClick=${() => addEmptyGroup()}>+ New group</button>
              <form onSubmit=${searchPrinciple}>
                <label>Find a principle
                  <div><input value=${search} onInput=${(event) => setSearch(event.currentTarget.value)} placeholder="Number or words" />
                    <button type="submit">Find</button></div>
                </label>
              </form>
              <p>Principle numbers never change when you move them.</p>
            </aside>
          `}
        </header>

        <${ReactFlowProvider}>
          ${openGroup
            ? html`<${MindMapFlow}
                key=${mapId}
                nodes=${groupNodes}
                onNodesChange=${onGroupNodesChange}
                nodeExtent=${GROUP_NODE_EXTENT}
                translateExtent=${GROUP_EXTENT}
                initialViewport=${mapViewport}
                onViewportEnd=${(viewport) => saveViewport(mapId, viewport)}
                onNodeDragStart=${handleNodeDragStart}
                onNodeDragStop=${handleGroupNodeDragStop}
                onInit=${(instance) => { groupFlow.current = instance; }}
                onPaneClick=${() => { setExpandedId(""); setMenu(null); }}
                emptyMessage="This group has no principles yet."
              />`
            : html`<${MindMapFlow}
                key="main"
                nodes=${mainNodes}
                onNodesChange=${onMainNodesChange}
                nodeExtent=${MAIN_NODE_EXTENT}
                translateExtent=${MAIN_EXTENT}
                initialViewport=${mapViewport}
                onViewportEnd=${(viewport) => saveViewport("main", viewport)}
                onNodeDragStart=${handleNodeDragStart}
                onNodeDragStop=${handleMainNodeDragStop}
                onInit=${(instance) => { mainFlow.current = instance; }}
                onPaneClick=${() => { setExpandedId(""); setMenu(null); }}
                emptyMessage="Create your first principle from the menu above."
              />`}
        </${ReactFlowProvider}>

        ${memberGhost && html`<div className="tjm-rf-circle-ghost" style=${{ left: memberGhost.x, top: memberGhost.y }}>${memberGhost.number}</div>`}

        <${EditorSheet}
          editor=${editor}
          principles=${principles}
          bridge=${bridge}
          busy=${busy}
          onClose=${() => !busy && setEditor(null)}
          onSaved=${savePrinciple}
        />
        <${NameGroupSheet}
          group=${renameGroup}
          busy=${busy}
          onClose=${() => !busy && setRenameGroup(null)}
          onSave=${(title) => renameGroup?.members ? renameExistingGroup(renameGroup, title) : renameLocalGroup(renameGroup, title)}
        />
        <${MoveSheet}
          principle=${movePrinciple}
          groups=${models.groups}
          busy=${busy}
          onClose=${() => !busy && setMovePrinciple(null)}
          onMove=${moveFromSheet}
        />
        <${ContextMenu}
          menu=${menu}
          onClose=${() => setMenu(null)}
          onEdit=${(principle) => { setMenu(null); setEditor({ principle }); }}
          onMove=${(principle) => { setMenu(null); setMovePrinciple(principle); }}
          onDelete=${deletePrinciples}
          onRename=${(group) => { setMenu(null); setRenameGroup(group); }}
          onDissolve=${dissolveGroup}
        />
      </section>
    `;
  }

  function unmountCurrent() {
    if (activeRoot) {
      try { activeRoot.unmount(); } catch (_error) {}
    }
    if (activeSourceSection?.isConnected) {
      activeSourceSection.classList.remove("tjm-rf-original-hidden");
      activeSourceSection.removeAttribute("aria-hidden");
    }
    activeRoot = null;
    activeHost = null;
    activeSourceSection = null;
  }

  function mountMindMap() {
    mountQueued = false;
    const bridge = window.TJMReactFlowBridge;
    const activeTab = document.querySelector('.journey-nav [data-view="principles"].active');
    const source = document.querySelector("#view-root .principles-view, #view-root .focused-principle-group");

    if (!activeTab || !source || !bridge?.options) {
      if (activeHost && !activeHost.isConnected) unmountCurrent();
      return;
    }

    if (activeSourceSection === source && activeHost?.isConnected) return;
    unmountCurrent();

    source.classList.add("tjm-rf-original-hidden");
    source.setAttribute("aria-hidden", "true");
    const host = document.createElement("div");
    host.className = "tjm-rf-host";
    host.dataset.planId = CONFIG.planId;
    source.before(host);
    const root = createRoot(host);
    roots.set(host, root);
    activeHost = host;
    activeRoot = root;
    activeSourceSection = source;
    window.__TJM_REACT_FLOW_ACTIVE = true;
    root.render(html`<${PrincipleMindMap} bridge=${bridge} />`);
  }

  function queueMount() {
    if (mountQueued) return;
    mountQueued = true;
    requestAnimationFrame(mountMindMap);
  }

  const observer = new MutationObserver(queueMount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("tjm-principles-bridge-ready", queueMount);
  window.addEventListener("DOMContentLoaded", queueMount, { once: true });
  queueMount();
}
