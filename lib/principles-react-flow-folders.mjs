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
  const FOLDER_EXTENT = [[0, 0], [1900, 1300]];
  const MAIN_NODE_EXTENT = [[0, 0], [2180, 1380]];
  const FOLDER_NODE_EXTENT = [[0, 0], [1480, 980]];
  const SENTINEL_READING_ID = CONFIG.planId === "bible-conflict-ages-v1" ? "coa-000" : "chron-000-00";
  const STORAGE_VERSION = 2;

  let activeHost = null;
  let activeRoot = null;
  let activeSourceSection = null;
  let mountQueued = false;

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const uuid = () => globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const firstLine = (value = "") => String(value).split(/\r?\n/).find((line) => line.trim())?.trim() || "Untitled principle";
  const firstWords = (value = "", count = 8) => {
    const words = firstLine(value).split(/\s+/);
    return words.length > count ? `${words.slice(0, count).join(" ")}…` : words.join(" ");
  };
  const activeRows = (rows = []) => rows.filter((row) => !row.deleted_at);
  const sortByNumber = (rows = []) => [...rows].sort((left, right) => Number(left.principle_number) - Number(right.principle_number));

  function parseReferences(value) {
    return Array.from(new Set(String(value || "")
      .split(/[^0-9]+/)
      .filter(Boolean)
      .map(Number)
      .filter((number) => Number.isInteger(number) && number > 0)))
      .sort((left, right) => left - right);
  }

  function safeJSON(value, fallback) {
    try {
      const parsed = JSON.parse(value);
      return parsed ?? fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function remapKeys(source, prefixFrom, prefixTo) {
    return Object.fromEntries(Object.entries(source || {}).map(([key, value]) => [
      key.startsWith(prefixFrom) ? `${prefixTo}${key.slice(prefixFrom.length)}` : key,
      value,
    ]));
  }

  function createStorage(planId, userId) {
    const key = `tjm-react-flow-folders:${planId}:${userId || "guest"}`;
    const previousKey = `tjm-react-flow-mindmap:${planId}:${userId || "guest"}`;

    const defaultState = () => ({
      version: STORAGE_VERSION,
      mainPositions: {},
      folderPositions: {},
      viewports: {},
      leaders: {},
      folderOrders: {},
      emptyFolders: [],
      folderNumbers: {},
      mapOpen: true,
    });

    function migratePrevious() {
      const next = defaultState();
      try {
        const previous = safeJSON(localStorage.getItem(previousKey), null);
        if (!previous || typeof previous !== "object") return next;
        next.mainPositions = remapKeys(previous.mainPositions || {}, "group:", "folder:");
        next.folderPositions = previous.groupPositions || {};
        next.viewports = remapKeys(previous.viewports || {}, "group:", "folder:");
        next.leaders = previous.leaders || {};
        next.folderOrders = previous.groupOrders || {};
        next.emptyFolders = (previous.emptyGroups || []).map((folder) => ({
          id: folder.id,
          customTitle: folder.title && !/^new group$/i.test(folder.title) ? folder.title : "",
        }));
        next.mapOpen = previous.mapOpen !== false;
      } catch (_error) {
        return next;
      }
      return next;
    }

    function read() {
      try {
        const existing = safeJSON(localStorage.getItem(key), null);
        if (existing && typeof existing === "object") return { ...defaultState(), ...existing };
        const migrated = migratePrevious();
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
        // The Mind Map remains usable for this visit if local storage is unavailable.
      }
    }

    return { read, write };
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
        if (next === current) return current;
        storage.write(next);
        return next;
      });
    }, [storage]);

    return [layout, setLayout];
  }

  function copyLayout(current) {
    return {
      ...current,
      mainPositions: { ...(current.mainPositions || {}) },
      folderPositions: Object.fromEntries(Object.entries(current.folderPositions || {}).map(([key, value]) => [key, { ...value }])),
      viewports: { ...(current.viewports || {}) },
      leaders: { ...(current.leaders || {}) },
      folderOrders: Object.fromEntries(Object.entries(current.folderOrders || {}).map(([key, value]) => [key, [...value]])),
      emptyFolders: [...(current.emptyFolders || [])],
      folderNumbers: { ...(current.folderNumbers || {}) },
    };
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

    return [rows, applyRows];
  }

  function folderModels(principles, layout) {
    const folders = new Map();
    const rootPrinciples = [];

    for (const principle of activeRows(principles)) {
      if (!principle.group_id) {
        rootPrinciples.push(principle);
        continue;
      }
      if (!folders.has(principle.group_id)) folders.set(principle.group_id, []);
      folders.get(principle.group_id).push(principle);
    }

    const models = [...folders.entries()].map(([folderId, members]) => {
      const memberIds = members.map((member) => member.id);
      const savedOrder = Array.isArray(layout.folderOrders?.[folderId]) ? layout.folderOrders[folderId] : [];
      const order = [
        ...savedOrder.filter((id) => memberIds.includes(id)),
        ...sortByNumber(members).map((member) => member.id).filter((id) => !savedOrder.includes(id)),
      ];
      const savedLeader = layout.leaders?.[folderId];
      const leaderId = savedLeader && memberIds.includes(savedLeader) ? savedLeader : order[0];
      const leader = members.find((member) => member.id === leaderId) || members[0];
      const customTitle = String(members.find((member) => String(member.group_title || "").trim())?.group_title || "").trim();
      const folderNumber = Number(layout.folderNumbers?.[folderId]) || Number(leader?.principle_number) || 1;
      return {
        id: folderId,
        number: folderNumber,
        members: order.map((id) => members.find((member) => member.id === id)).filter(Boolean),
        leader,
        customTitle,
        title: customTitle || `New Folder #${folderNumber}`,
        isPlaceholder: false,
      };
    });

    const placeholders = (layout.emptyFolders || []).map((folder) => {
      const number = Number(layout.folderNumbers?.[folder.id]) || 1;
      return {
        id: folder.id,
        number,
        members: [],
        leader: null,
        customTitle: String(folder.customTitle || "").trim(),
        title: String(folder.customTitle || "").trim() || `New Folder #${number}`,
        isPlaceholder: true,
      };
    });

    return {
      folders: models,
      placeholders,
      rootPrinciples: sortByNumber(rootPrinciples),
    };
  }

  function readingFor(bridge, readingId) {
    return bridge.options.getReadings?.().find((reading) => reading.id === readingId) || null;
  }

  function readingLabel(bridge, principle) {
    const reading = readingFor(bridge, principle.reading_id);
    return reading ? bridge.options.readingLabel?.(reading) || reading.title || principle.reading_id : "Not attached to a reading";
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
    const principle = data.principle;

    useEffect(() => {
      requestAnimationFrame(() => updateNodeInternals(id));
    }, [id, data.expanded, updateNodeInternals]);

    return html`
      <article className=${`tjm-folder-node tjm-folder-principle-node ${data.expanded ? "is-expanded" : "is-compact"} ${selected ? "is-selected" : ""}`}
        data-folder-principle-id=${principle.id}>
        <div className="tjm-folder-principle-row">
          <button type="button" className="tjm-folder-number rf-principle-drag-handle"
            aria-label=${`Move principle ${principle.principle_number}`}
            title="Drag to move" onClick=${(event) => event.stopPropagation()}>
            ${principle.principle_number}
          </button>
          <button type="button" className="tjm-folder-principle-preview nodrag nopan"
            onClick=${() => data.onToggle(principle.id)} aria-expanded=${String(data.expanded)}>
            ${firstWords(principle.body, data.expanded ? 14 : 8)}
          </button>
          <button type="button" className="tjm-folder-node-menu nodrag nopan"
            aria-label=${`Options for principle ${principle.principle_number}`}
            onClick=${(event) => data.onPrincipleMenu(principle, event)}>⋮</button>
        </div>
        ${data.expanded && html`
          <div className="tjm-folder-expanded-body nodrag nopan">
            <p>${principle.body}</p>
            ${(principle.cross_reference_numbers || []).length > 0 && html`
              <div className="tjm-folder-reference-row" aria-label="Cross-referenced principles">
                ${(principle.cross_reference_numbers || []).map((number) => html`
                  <button type="button" onClick=${() => data.onFindReference(number)}>#${number}</button>
                `)}
              </div>
            `}
            <small>${readingLabel(data.bridge, principle)}</small>
            ${principle.reading_id && principle.reading_id !== SENTINEL_READING_ID && html`
              <div className="tjm-folder-reading-action">
                <button type="button" onClick=${() => data.onGoToReading(principle)}>Go to reading</button>
              </div>
            `}
          </div>
        `}
      </article>
    `;
  });

  const FolderNode = memo(function FolderNode({ data, selected }) {
    const folder = data.folder;
    return html`
      <article className=${`tjm-folder-node tjm-folder-folder-node ${selected ? "is-selected" : ""}`}
        data-folder-id=${folder.id}>
        <header>
          <button type="button" className="tjm-folder-grip rf-folder-drag-handle"
            aria-label=${`Move ${folder.title}`} title="Drag to move folder"
            onClick=${(event) => event.stopPropagation()}>⠿</button>
          <button type="button" className="tjm-folder-open nodrag nopan"
            onClick=${() => data.onOpenFolder(folder.id)}>
            <strong>${folder.title}</strong>
            <span>${folder.members.length} ${folder.members.length === 1 ? "principle" : "principles"}</span>
          </button>
          <button type="button" className="tjm-folder-node-menu nodrag nopan"
            aria-label=${`Options for ${folder.title}`}
            onClick=${(event) => data.onFolderMenu(folder, event)}>⋮</button>
        </header>
        <div className="tjm-folder-member-circles nodrag nopan" aria-label=${`Principles in ${folder.title}`}>
          ${folder.members.map((member) => html`
            <button type="button" className=${`tjm-folder-member-circle ${member.id === folder.leader?.id ? "is-first" : ""}`}
              aria-label=${`Open principle ${member.principle_number}`}
              onClick=${() => data.onOpenFolder(folder.id, member.id)}>
              ${member.principle_number}
            </button>
          `)}
        </div>
      </article>
    `;
  });

  const EmptyFolderNode = memo(function EmptyFolderNode({ data, selected }) {
    const folder = data.folder;
    return html`
      <article className=${`tjm-folder-node tjm-folder-folder-node tjm-folder-empty-node ${selected ? "is-selected" : ""}`}
        data-empty-folder-id=${folder.id}>
        <header>
          <button type="button" className="tjm-folder-grip rf-folder-drag-handle"
            aria-label=${`Move ${folder.title}`} title="Drag to move folder"
            onClick=${(event) => event.stopPropagation()}>⠿</button>
          <button type="button" className="tjm-folder-open nodrag nopan"
            onClick=${() => data.onAddPrinciples(folder)}>
            <strong>${folder.title}</strong>
            <span>Empty folder · tap to add principles</span>
          </button>
          <button type="button" className="tjm-folder-node-menu nodrag nopan"
            aria-label=${`Options for ${folder.title}`}
            onClick=${(event) => data.onFolderMenu(folder, event)}>⋮</button>
        </header>
      </article>
    `;
  });

  const nodeTypes = {
    principle: PrincipleNode,
    folder: FolderNode,
    emptyFolder: EmptyFolderNode,
  };

  function EditorSheet({ editor, principles, bridge, busy, onClose, onSaved }) {
    const dialogRef = useRef(null);
    useDialogFocus(Boolean(editor), dialogRef);
    if (!editor) return null;

    const principle = editor.principle || null;
    const nextNumber = [...principles, ...(bridge.options.getDeletedPrinciples?.() || [])]
      .reduce((maximum, row) => Math.max(maximum, Number(row.principle_number) || 0), 0) + 1;

    const submit = async (event) => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      const number = Number(values.get("principle-number"));
      const body = String(values.get("principle-body") || "").trim();
      const references = parseReferences(values.get("cross-references"));

      if (!Number.isInteger(number) || number < 1) return bridge.options.toast?.("Choose a whole principle number greater than zero.", "error");
      if (!body) return bridge.options.toast?.("Write a principle before saving it.", "error");
      if (body.length > 2000) return bridge.options.toast?.("Keep the principle under 2,000 characters.", "error");
      if (principles.some((row) => row.id !== principle?.id && Number(row.principle_number) === number)) {
        return bridge.options.toast?.(`Principle #${number} is already in use.`, "error");
      }
      const available = new Set(principles.filter((row) => row.id !== principle?.id).map((row) => Number(row.principle_number)));
      if (principle) available.add(number);
      const unknown = references.filter((reference) => !available.has(reference));
      if (unknown.length) return bridge.options.toast?.(`Principle ${unknown.map((value) => `#${value}`).join(", ")} does not exist yet.`, "error");

      await onSaved({ principle, number, body, references });
    };

    return html`
      <div className="tjm-folder-dialog-layer" role="presentation"
        onMouseDown=${(event) => event.target === event.currentTarget && !busy && onClose()}>
        <section className="tjm-folder-editor-sheet" role="dialog" aria-modal="true"
          aria-labelledby="tjm-folder-editor-title" ref=${dialogRef}>
          <header>
            <div><small>${principle ? "EDIT PRINCIPLE" : "NEW PRINCIPLE"}</small>
              <h3 id="tjm-folder-editor-title">${principle ? `Principle #${principle.principle_number}` : "Capture a discovery"}</h3></div>
            <button type="button" data-close-dialog onClick=${onClose} disabled=${busy} aria-label="Close">×</button>
          </header>
          <form onSubmit=${submit}>
            <label>Principle number
              <input name="principle-number" type="number" min="1" step="1" required
                defaultValue=${principle?.principle_number || nextNumber} />
            </label>
            <label>Principle
              <textarea name="principle-body" maxLength="2000" required
                defaultValue=${principle?.body || ""} placeholder="Write the principle in your own words."></textarea>
            </label>
            <label>Related principle numbers
              <input name="cross-references" inputMode="numeric"
                defaultValue=${(principle?.cross_reference_numbers || []).join(", ")}
                placeholder="10, 20, 30" />
              <small>Separate principle numbers with commas.</small>
            </label>
            <div className="tjm-folder-sheet-actions">
              <button type="submit" className="is-primary" disabled=${busy}>${busy ? "Saving…" : "Save"}</button>
              <button type="button" onClick=${onClose} disabled=${busy}>Cancel</button>
            </div>
          </form>
        </section>
      </div>
    `;
  }

  function NameFolderSheet({ folder, busy, onClose, onSave }) {
    const dialogRef = useRef(null);
    useDialogFocus(Boolean(folder), dialogRef);
    if (!folder) return null;

    return html`
      <div className="tjm-folder-dialog-layer" role="presentation"
        onMouseDown=${(event) => event.target === event.currentTarget && !busy && onClose()}>
        <section className="tjm-folder-small-dialog" role="dialog" aria-modal="true"
          aria-labelledby="tjm-folder-name-title" ref=${dialogRef}>
          <header><div><small>FOLDER NAME</small><h3 id="tjm-folder-name-title">Rename folder</h3></div>
            <button type="button" data-close-dialog onClick=${onClose} disabled=${busy} aria-label="Close">×</button></header>
          <form onSubmit=${(event) => {
            event.preventDefault();
            onSave(String(new FormData(event.currentTarget).get("folder-title") || "").trim());
          }}>
            <label>Folder name
              <input name="folder-title" maxLength="80" defaultValue=${folder.customTitle || ""}
                placeholder=${`New Folder #${folder.number}`} />
            </label>
            <p>Leave the name blank to use “New Folder #${folder.number}.”</p>
            <div className="tjm-folder-sheet-actions">
              <button type="submit" className="is-primary" disabled=${busy}>${busy ? "Saving…" : "Save name"}</button>
              <button type="button" onClick=${onClose} disabled=${busy}>Cancel</button>
            </div>
          </form>
        </section>
      </div>
    `;
  }

  function AddPrinciplesSheet({ folder, candidates, busy, onClose, onAdd }) {
    const dialogRef = useRef(null);
    const [selected, setSelected] = useState(() => new Set());
    useDialogFocus(Boolean(folder), dialogRef);

    useEffect(() => {
      setSelected(new Set());
    }, [folder?.id]);

    if (!folder) return null;
    const toggle = (id) => setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

    return html`
      <div className="tjm-folder-dialog-layer" role="presentation"
        onMouseDown=${(event) => event.target === event.currentTarget && !busy && onClose()}>
        <section className="tjm-folder-small-dialog tjm-folder-add-dialog" role="dialog" aria-modal="true"
          aria-labelledby="tjm-folder-add-title" ref=${dialogRef}>
          <header><div><small>ADD PRINCIPLES</small><h3 id="tjm-folder-add-title">${folder.title}</h3></div>
            <button type="button" data-close-dialog onClick=${onClose} disabled=${busy} aria-label="Close">×</button></header>
          ${candidates.length
            ? html`<div className="tjm-folder-candidate-list">
                ${candidates.map((principle) => html`
                  <label>
                    <input type="checkbox" checked=${selected.has(principle.id)} onChange=${() => toggle(principle.id)} />
                    <span className="tjm-folder-number">${principle.principle_number}</span>
                    <span>${firstWords(principle.body, 12)}</span>
                  </label>
                `)}
              </div>
              <div className="tjm-folder-sheet-actions">
                <button type="button" className="is-primary" disabled=${busy || selected.size === 0}
                  onClick=${() => onAdd([...selected])}>${busy ? "Adding…" : `Add ${selected.size || "selected"}`}</button>
                <button type="button" onClick=${onClose} disabled=${busy}>Cancel</button>
              </div>`
            : html`<p className="tjm-folder-no-candidates">There are no principles on the main Mind Map to add right now. Remove a principle from another folder first, or create a new principle.</p>
              <div className="tjm-folder-sheet-actions"><button type="button" onClick=${onClose}>Close</button></div>`}
        </section>
      </div>
    `;
  }

  function ContextMenu({ menu, onClose, onEdit, onRemove, onDelete, onRename, onAdd, onRemoveFolder }) {
    useEffect(() => {
      if (!menu) return undefined;
      const close = (event) => {
        if (!event.target.closest?.(".tjm-folder-context-menu")) onClose();
      };
      const timer = setTimeout(() => document.addEventListener("pointerdown", close, true), 0);
      return () => {
        clearTimeout(timer);
        document.removeEventListener("pointerdown", close, true);
      };
    }, [menu, onClose]);

    if (!menu) return null;
    const width = 220;
    const estimatedHeight = 210;
    const style = {
      left: `${clamp(menu.x, 8, window.innerWidth - width - 8)}px`,
      top: `${clamp(menu.y, 8, window.innerHeight - estimatedHeight - 8)}px`,
    };

    return html`
      <div className="tjm-folder-context-menu" style=${style} role="menu">
        ${menu.kind === "principle" && html`
          <button type="button" role="menuitem" onClick=${() => onEdit(menu.item)}>Edit</button>
          ${menu.item.group_id && html`
            <button type="button" role="menuitem" onClick=${() => onRemove(menu.item)}>Remove from folder</button>
          `}
          <button type="button" role="menuitem" className="is-danger" onClick=${() => onDelete([menu.item])}>Delete</button>
        `}
        ${(menu.kind === "folder" || menu.kind === "emptyFolder") && html`
          <button type="button" role="menuitem" onClick=${() => onRename(menu.item)}>Rename folder</button>
          <button type="button" role="menuitem" onClick=${() => onAdd(menu.item)}>Add principles</button>
          ${menu.kind === "folder" && html`
            <button type="button" role="menuitem" onClick=${() => onRemoveFolder(menu.item)}>Remove folder, keep principles</button>
            <button type="button" role="menuitem" className="is-danger" onClick=${() => onDelete(menu.item.members)}>Delete folder and principles</button>
          `}
          ${menu.kind === "emptyFolder" && html`
            <button type="button" role="menuitem" className="is-danger" onClick=${() => onDelete([])}>Delete folder</button>
          `}
        `}
      </div>
    `;
  }

  function MapFlow({
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
      <div className="tjm-folder-flow-wrap">
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
          fitViewOptions=${{ padding: 0.18, minZoom: 0.5, maxZoom: 1 }}>
          <${Background} gap=${28} size=${1} color="#d8c9d4" />
          <${Controls} position="bottom-right" showInteractive=${false} />
          <${MiniMap} position="bottom-left" pannable=${true} zoomable=${true}
            nodeColor=${(node) => node.type === "folder" || node.type === "emptyFolder" ? "#6f4868" : "#d1a33c"} />
          <${Panel} position="top-left" className="tjm-folder-boundary-note">Drag the background to pan · pinch or scroll to zoom</${Panel}>
          ${nodes.length === 0 && html`<${Panel} position="top-center" className="tjm-folder-empty-message">${emptyMessage}</${Panel}>`}
        </${ReactFlow}>
      </div>
    `;
  }

  function FolderMindMap({ bridge }) {
    const session = bridge.options.getSession?.();
    const userId = session?.user?.id || "guest";
    const [principles, applyRows] = useBridgeRows(bridge);
    const [layout, setLayout] = usePersistentLayout(CONFIG.planId, userId);
    const [openFolderId, setOpenFolderId] = useState("");
    const [expandedId, setExpandedId] = useState("");
    const [editor, setEditor] = useState(null);
    const [renameFolder, setRenameFolder] = useState(null);
    const [addToFolder, setAddToFolder] = useState(null);
    const [menu, setMenu] = useState(null);
    const [busy, setBusy] = useState(false);
    const [toolsOpen, setToolsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [mainNodes, setMainNodes, onMainNodesChange] = useNodesState([]);
    const [folderNodes, setFolderNodes, onFolderNodesChange] = useNodesState([]);
    const mainFlow = useRef(null);
    const folderFlow = useRef(null);

    const models = useMemo(() => folderModels(principles, layout), [principles, layout]);
    const openFolder = models.folders.find((folder) => folder.id === openFolderId) || null;
    const expandedPrinciple = principles.find((principle) => principle.id === expandedId) || null;
    const mapOpen = layout.mapOpen !== false;

    const updateLayout = useCallback((mutator) => {
      setLayout((current) => {
        const next = copyLayout(current);
        const result = mutator(next) || next;
        return JSON.stringify(result) === JSON.stringify(current) ? current : result;
      });
    }, [setLayout]);

    const notify = useCallback((message, type = "") => bridge.options.toast?.(message, type), [bridge]);
    const notifySync = useCallback((label, mode = "") => bridge.options.setSync?.(label, mode), [bridge]);

    const ensureSignedIn = useCallback(() => {
      if (bridge.options.getSession?.()) return true;
      bridge.options.showSignIn?.();
      return false;
    }, [bridge]);

    useEffect(() => {
      updateLayout((next) => {
        const used = new Set(Object.values(next.folderNumbers || {}).map(Number).filter((number) => Number.isInteger(number) && number > 0));
        let maximum = Math.max(0, ...used);
        let changed = false;
        const actualFolders = [...new Set(principles.map((principle) => principle.group_id).filter(Boolean))];
        for (const folderId of actualFolders) {
          if (Number(next.folderNumbers[folderId]) > 0) continue;
          const members = sortByNumber(principles.filter((principle) => principle.group_id === folderId));
          const candidate = Number(members[0]?.principle_number);
          const number = candidate > 0 && !used.has(candidate) ? candidate : ++maximum;
          next.folderNumbers[folderId] = number;
          used.add(number);
          maximum = Math.max(maximum, number);
          changed = true;
        }
        for (const folder of next.emptyFolders) {
          if (Number(next.folderNumbers[folder.id]) > 0) continue;
          const number = ++maximum;
          next.folderNumbers[folder.id] = number;
          used.add(number);
          changed = true;
        }
        return changed ? next : null;
      });
    }, [principles, layout.emptyFolders?.length, updateLayout]);

    useEffect(() => {
      const onPopState = () => {
        if (openFolderId) {
          setOpenFolderId("");
          setExpandedId("");
          setMenu(null);
        }
      };
      window.addEventListener("popstate", onPopState);
      return () => window.removeEventListener("popstate", onPopState);
    }, [openFolderId]);

    function commitReturnedRows(data, successLabel = "Saved") {
      const nextRows = activeRows(Array.isArray(data) ? data : data ? [data] : []);
      if (nextRows.length || (Array.isArray(data) && data.length === 0)) applyRows(nextRows);
      notifySync(successLabel, "synced");
      return nextRows;
    }

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

    const nextFolderNumber = useCallback(() => {
      return Math.max(0, ...Object.values(layout.folderNumbers || {}).map(Number).filter(Number.isFinite)) + 1;
    }, [layout.folderNumbers]);

    function openPrincipleMenu(principle, event) {
      const rect = event.currentTarget.getBoundingClientRect();
      setMenu({ kind: "principle", item: principle, x: rect.right - 210, y: rect.bottom + 6 });
    }

    function openFolderMenu(folder, event) {
      const rect = event.currentTarget.getBoundingClientRect();
      setMenu({ kind: folder.isPlaceholder ? "emptyFolder" : "folder", item: folder, x: rect.right - 210, y: rect.bottom + 6 });
    }

    function openFolderById(folderId, principleId = "") {
      setOpenFolderId(folderId);
      setExpandedId(principleId);
      setMenu(null);
      setToolsOpen(false);
      history.pushState({ ...(history.state || {}), tjmFolderMindMap: folderId }, "");
    }

    function closeFolder() {
      if (history.state?.tjmFolderMindMap) history.back();
      else {
        setOpenFolderId("");
        setExpandedId("");
      }
    }

    function toggleMap() {
      updateLayout((next) => {
        next.mapOpen = !mapOpen;
        return next;
      });
      setMenu(null);
      setToolsOpen(false);
    }

    const nodeCallbacks = useCallback(() => ({
      bridge,
      onToggle: (principleId) => setExpandedId((current) => current === principleId ? "" : principleId),
      onPrincipleMenu: openPrincipleMenu,
      onFindReference: (number) => {
        const principle = principles.find((row) => Number(row.principle_number) === Number(number));
        if (!principle) return notify(`Principle #${number} could not be found.`, "error");
        if (principle.group_id) openFolderById(principle.group_id, principle.id);
        else {
          setOpenFolderId("");
          setExpandedId(principle.id);
          requestAnimationFrame(() => {
            const position = layout.mainPositions[`principle:${principle.id}`] || { x: 100, y: 100 };
            mainFlow.current?.setCenter?.(position.x + 150, position.y + 80, { zoom: 1, duration: 320 });
          });
        }
      },
      onGoToReading: (principle) => bridge.options.goToReadingById?.(principle.reading_id),
      onOpenFolder: openFolderById,
      onFolderMenu: openFolderMenu,
      onAddPrinciples: (folder) => setAddToFolder(folder),
    }), [bridge, principles, notify, layout]);

    const buildMainNodes = useCallback(() => {
      const callbacks = nodeCallbacks();
      const positions = layout.mainPositions || {};
      const nodes = [];
      let index = 0;
      const defaultPosition = () => ({ x: 80 + (index % 4) * 480, y: 80 + Math.floor(index++ / 4) * 260 });

      for (const folder of models.folders) {
        const id = `folder:${folder.id}`;
        nodes.push({
          id,
          type: "folder",
          position: positions[id] || positions[`group:${folder.id}`] || defaultPosition(),
          dragHandle: ".rf-folder-drag-handle",
          data: { ...callbacks, folder },
        });
      }

      for (const principle of models.rootPrinciples) {
        const id = `principle:${principle.id}`;
        nodes.push({
          id,
          type: "principle",
          position: positions[id] || positions[`single:${principle.id}`] || defaultPosition(),
          dragHandle: ".rf-principle-drag-handle",
          data: { ...callbacks, principle, expanded: expandedId === principle.id },
        });
      }

      for (const folder of models.placeholders) {
        const id = `empty:${folder.id}`;
        nodes.push({
          id,
          type: "emptyFolder",
          position: positions[id] || defaultPosition(),
          dragHandle: ".rf-folder-drag-handle",
          data: { ...callbacks, folder },
        });
      }
      return nodes;
    }, [layout.mainPositions, models, expandedId, nodeCallbacks]);

    const buildFolderNodes = useCallback((folder) => {
      if (!folder) return [];
      const callbacks = nodeCallbacks();
      const positions = layout.folderPositions?.[folder.id] || {};
      let index = 0;
      return folder.members.map((principle) => ({
        id: `principle:${principle.id}`,
        type: "principle",
        position: positions[principle.id] || { x: 80 + (index % 4) * 400, y: 80 + Math.floor(index++ / 4) * 240 },
        dragHandle: ".rf-principle-drag-handle",
        data: { ...callbacks, principle, expanded: expandedId === principle.id },
      }));
    }, [layout.folderPositions, expandedId, nodeCallbacks]);

    useEffect(() => {
      setMainNodes(buildMainNodes());
    }, [buildMainNodes, setMainNodes]);

    useEffect(() => {
      setFolderNodes(buildFolderNodes(openFolder));
    }, [buildFolderNodes, openFolder, setFolderNodes]);

    function saveViewport(mapId, viewport) {
      updateLayout((next) => {
        next.viewports[mapId] = viewport;
        return next;
      });
    }

    function saveNodePosition(mapId, node) {
      updateLayout((next) => {
        if (mapId === "main") next.mainPositions[node.id] = node.position;
        else {
          const folderId = mapId.slice(7);
          next.folderPositions[folderId] = {
            ...(next.folderPositions[folderId] || {}),
            [node.id.replace(/^principle:/, "")]: node.position,
          };
        }
        return next;
      });
    }

    function updateLeader(folderId, nodes) {
      if (!folderId || !nodes.length) return;
      const sorted = [...nodes].sort((left, right) => {
        if (Math.abs(left.position.y - right.position.y) > 24) return left.position.y - right.position.y;
        return left.position.x - right.position.x;
      });
      const ids = sorted.map((node) => node.id.replace(/^principle:/, ""));
      updateLayout((next) => {
        next.folderOrders[folderId] = ids;
        next.leaders[folderId] = ids[0];
        return next;
      });
    }

    function handleMainNodeDragStart() {
      setMenu(null);
      navigator.vibrate?.(8);
    }

    async function handleMainNodeDragStop(_event, node) {
      saveNodePosition("main", node);
      navigator.vibrate?.(10);
      if (node.type !== "principle") return;

      const targets = mainFlow.current?.getIntersectingNodes?.(node, true) || [];
      const target = targets.find((candidate) => candidate.id !== node.id && (candidate.type === "folder" || candidate.type === "emptyFolder"));
      if (!target) return;

      const principle = principles.find((row) => `principle:${row.id}` === node.id);
      if (!principle) return;
      const folder = target.type === "folder"
        ? models.folders.find((item) => `folder:${item.id}` === target.id)
        : models.placeholders.find((item) => `empty:${item.id}` === target.id);
      if (folder) await addPrinciples(folder, [principle.id]);
    }

    function handleFolderNodeDragStop(_event, node) {
      if (!openFolder) return;
      saveNodePosition(`folder:${openFolder.id}`, node);
      setFolderNodes((current) => {
        const updated = current.map((item) => item.id === node.id ? { ...item, position: node.position } : item);
        updateLeader(openFolder.id, updated);
        return updated;
      });
      navigator.vibrate?.(10);
    }

    async function savePrinciple({ principle, number, body, references }) {
      const database = bridge.options.getDb();
      if (principle) {
        const result = await runMutation("Saving changes…", () => database.rpc("update_conflict_principle", {
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

      const result = await runMutation("Saving principle…", () => database.rpc("create_conflict_principle", {
        p_plan_id: CONFIG.planId,
        p_reading_id: SENTINEL_READING_ID,
        p_body: body,
        p_cross_reference_numbers: references,
        p_principle_number: number,
      }), `Principle #${number} saved.`);
      if (!result) return;
      const created = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!created) return;
      applyRows(sortByNumber([...principles, created]));
      const center = mainFlow.current?.screenToFlowPosition?.({ x: window.innerWidth / 2, y: window.innerHeight / 2 }) || { x: 180, y: 180 };
      updateLayout((next) => {
        next.mainPositions[`principle:${created.id}`] = { x: clamp(center.x, 0, 2100), y: clamp(center.y, 0, 1300) };
        return next;
      });
      setEditor(null);
      setExpandedId(created.id);
    }

    function createFolder() {
      if (!ensureSignedIn()) return;
      const id = uuid();
      const number = nextFolderNumber();
      const center = mainFlow.current?.screenToFlowPosition?.({ x: window.innerWidth / 2, y: window.innerHeight / 2 }) || { x: 220, y: 180 };
      updateLayout((next) => {
        next.emptyFolders.push({ id, customTitle: "" });
        next.folderNumbers[id] = number;
        next.mainPositions[`empty:${id}`] = { x: clamp(center.x, 0, 2100), y: clamp(center.y, 0, 1300) };
        return next;
      });
      setToolsOpen(false);
      notify(`New Folder #${number} created. Add principles from its menu.`);
    }

    async function renameExistingFolder(folder, title) {
      const database = bridge.options.getDb();
      const result = await runMutation("Saving folder name…", () => database.rpc("rename_conflict_principle_group", {
        p_group_id: folder.id,
        p_title: title,
      }), title ? "Folder name updated." : `The folder is now New Folder #${folder.number}.`);
      if (!result) return;
      commitReturnedRows(result.data, "Folder name saved");
      setRenameFolder(null);
    }

    function renamePlaceholder(folder, title) {
      updateLayout((next) => {
        next.emptyFolders = next.emptyFolders.map((item) => item.id === folder.id ? { ...item, customTitle: title } : item);
        return next;
      });
      setRenameFolder(null);
      notify(title ? "Folder name updated." : `The folder is now New Folder #${folder.number}.`);
    }

    async function addPrinciples(folder, principleIds) {
      if (!principleIds.length) return;
      const database = bridge.options.getDb();
      const selected = models.rootPrinciples.filter((principle) => principleIds.includes(principle.id));
      if (!selected.length) return;

      const result = await runMutation("Adding principles…", () => database.rpc("move_conflict_principles", {
        p_principle_ids: selected.map((principle) => principle.id),
        p_target_principle_id: folder.isPlaceholder ? null : folder.members[0]?.id,
        p_mode: folder.isPlaceholder ? "new" : "existing",
        p_group_title: folder.isPlaceholder && folder.customTitle ? folder.customTitle : null,
      }), `${selected.length} ${selected.length === 1 ? "principle added" : "principles added"} to ${folder.title}.`);
      if (!result) return;

      const nextRows = commitReturnedRows(result.data, "Folder updated");
      const moved = nextRows.find((row) => selected.some((principle) => principle.id === row.id));
      const destinationId = moved?.group_id || folder.id;

      updateLayout((next) => {
        if (folder.isPlaceholder) {
          const oldPosition = next.mainPositions[`empty:${folder.id}`] || { x: 120, y: 120 };
          next.emptyFolders = next.emptyFolders.filter((item) => item.id !== folder.id);
          delete next.mainPositions[`empty:${folder.id}`];
          delete next.folderNumbers[folder.id];
          next.folderNumbers[destinationId] = folder.number;
          next.mainPositions[`folder:${destinationId}`] = oldPosition;
          next.folderOrders[destinationId] = selected.map((principle) => principle.id);
          next.leaders[destinationId] = selected[0].id;
        } else {
          const currentOrder = next.folderOrders[destinationId] || folder.members.map((member) => member.id);
          next.folderOrders[destinationId] = [
            ...currentOrder.filter((id) => !principleIds.includes(id)),
            ...selected.map((principle) => principle.id),
          ];
          if (!next.leaders[destinationId]) next.leaders[destinationId] = next.folderOrders[destinationId][0];
        }
        for (const principle of selected) {
          delete next.mainPositions[`principle:${principle.id}`];
          delete next.mainPositions[`single:${principle.id}`];
        }
        return next;
      });
      setAddToFolder(null);
    }

    async function removeFromFolder(principle) {
      const folder = models.folders.find((item) => item.id === principle.group_id);
      if (!folder) return;
      const database = bridge.options.getDb();
      const result = await runMutation("Removing from folder…", () => database.rpc("move_conflict_principles", {
        p_principle_ids: [principle.id],
        p_target_principle_id: null,
        p_mode: "standalone",
        p_group_title: null,
      }), `Principle #${principle.principle_number} moved to the main Mind Map.`);
      if (!result) return;

      commitReturnedRows(result.data, "Principle removed from folder");
      const lastPrinciple = folder.members.length === 1;
      const placeholderId = lastPrinciple ? uuid() : "";
      const folderPosition = layout.mainPositions[`folder:${folder.id}`] || { x: 140, y: 140 };

      updateLayout((next) => {
        next.folderOrders[folder.id] = (next.folderOrders[folder.id] || folder.members.map((member) => member.id)).filter((id) => id !== principle.id);
        if (next.leaders[folder.id] === principle.id) next.leaders[folder.id] = next.folderOrders[folder.id][0] || "";
        if (next.folderPositions[folder.id]) delete next.folderPositions[folder.id][principle.id];
        next.mainPositions[`principle:${principle.id}`] = { x: clamp(folderPosition.x + 330, 0, 2100), y: clamp(folderPosition.y + 70, 0, 1300) };

        if (lastPrinciple) {
          next.emptyFolders.push({ id: placeholderId, customTitle: folder.customTitle });
          next.folderNumbers[placeholderId] = folder.number;
          next.mainPositions[`empty:${placeholderId}`] = folderPosition;
          delete next.mainPositions[`folder:${folder.id}`];
          delete next.folderPositions[folder.id];
          delete next.folderOrders[folder.id];
          delete next.leaders[folder.id];
          delete next.folderNumbers[folder.id];
        }
        return next;
      });

      setMenu(null);
      setExpandedId(principle.id);
      if (openFolderId === folder.id) setOpenFolderId("");
    }

    async function removeFolderKeepPrinciples(folder) {
      if (!window.confirm(`Remove “${folder.title}” and place every principle on the main Mind Map?`)) return;
      const database = bridge.options.getDb();
      const result = await runMutation("Removing folder…", () => database.rpc("dissolve_conflict_principle_group", {
        p_group_id: folder.id,
      }), "Folder removed. Every principle was kept.");
      if (!result) return;

      commitReturnedRows(result.data, "Principles kept");
      const folderPosition = layout.mainPositions[`folder:${folder.id}`] || { x: 100, y: 100 };
      updateLayout((next) => {
        folder.members.forEach((principle, index) => {
          next.mainPositions[`principle:${principle.id}`] = {
            x: clamp(folderPosition.x + (index % 2) * 340, 0, 2100),
            y: clamp(folderPosition.y + Math.floor(index / 2) * 170, 0, 1300),
          };
        });
        delete next.mainPositions[`folder:${folder.id}`];
        delete next.folderPositions[folder.id];
        delete next.folderOrders[folder.id];
        delete next.leaders[folder.id];
        delete next.folderNumbers[folder.id];
        return next;
      });
      setOpenFolderId("");
      setExpandedId("");
      setMenu(null);
    }

    async function deleteItems(items) {
      if (menu?.kind === "emptyFolder" && items.length === 0) {
        const folder = menu.item;
        if (!window.confirm(`Delete “${folder.title}”?`)) return;
        updateLayout((next) => {
          next.emptyFolders = next.emptyFolders.filter((item) => item.id !== folder.id);
          delete next.mainPositions[`empty:${folder.id}`];
          delete next.folderNumbers[folder.id];
          return next;
        });
        setMenu(null);
        return;
      }

      if (!items.length) return;
      const isFolder = items.length > 1 || Boolean(menu?.kind === "folder");
      const label = isFolder ? menu.item.title : `principle #${items[0].principle_number}`;
      if (!window.confirm(`Move ${label} to Recently Deleted?`)) return;
      const database = bridge.options.getDb();
      const result = await runMutation("Moving to Recently Deleted…", () => database.rpc("soft_delete_conflict_principles", {
        p_principle_ids: items.map((item) => item.id),
      }), `${label} moved to Recently Deleted.`);
      if (!result) return;

      const nextRows = commitReturnedRows(result.data, "Moved to Recently Deleted");
      const removedIds = new Set(items.map((item) => item.id));
      const deleted = items.map((item) => ({ ...item, deleted_at: new Date().toISOString() }));
      bridge.options.setDeletedPrinciples?.([
        ...deleted,
        ...(bridge.options.getDeletedPrinciples?.() || []).filter((item) => !removedIds.has(item.id)),
      ]);

      updateLayout((next) => {
        for (const principle of items) {
          delete next.mainPositions[`principle:${principle.id}`];
          delete next.mainPositions[`single:${principle.id}`];
          if (principle.group_id && next.folderPositions[principle.group_id]) delete next.folderPositions[principle.group_id][principle.id];
        }
        for (const folderId of Object.keys(next.folderOrders)) {
          next.folderOrders[folderId] = next.folderOrders[folderId].filter((id) => !removedIds.has(id));
          if (removedIds.has(next.leaders[folderId])) next.leaders[folderId] = next.folderOrders[folderId][0] || "";
        }
        if (menu?.kind === "folder") {
          const folderId = menu.item.id;
          delete next.mainPositions[`folder:${folderId}`];
          delete next.folderPositions[folderId];
          delete next.folderOrders[folderId];
          delete next.leaders[folderId];
          delete next.folderNumbers[folderId];
        }
        return next;
      });

      if (openFolderId && !nextRows.some((row) => row.group_id === openFolderId)) setOpenFolderId("");
      if (removedIds.has(expandedId)) setExpandedId("");
      setMenu(null);
    }

    function searchPrinciple(event) {
      event.preventDefault();
      const query = search.trim().toLowerCase();
      if (!query) return;
      const principle = principles.find((row) => String(row.principle_number) === query || row.body.toLowerCase().includes(query));
      if (!principle) return notify(`No principle contains “${search}.”`, "error");
      updateLayout((next) => { next.mapOpen = true; return next; });
      if (principle.group_id) openFolderById(principle.group_id, principle.id);
      else {
        setOpenFolderId("");
        setExpandedId(principle.id);
        requestAnimationFrame(() => {
          const position = layout.mainPositions[`principle:${principle.id}`] || { x: 100, y: 100 };
          mainFlow.current?.setCenter?.(position.x + 150, position.y + 80, { zoom: 1.05, duration: 360 });
        });
      }
      setToolsOpen(false);
    }

    if (!session) {
      return html`
        <section className="tjm-folder-signed-out">
          <p className="eyebrow">YOUR MIND MAP</p>
          <h2>Sign in to build your Mind Map.</h2>
          <p>Your principles, folders, and reading progress are private to your account.</p>
          <button type="button" onClick=${() => bridge.options.showSignIn?.()}>Continue with Google</button>
        </section>
      `;
    }

    const mapId = openFolder ? `folder:${openFolder.id}` : "main";
    const viewport = layout.viewports?.[mapId] || null;
    const stickyTitle = expandedPrinciple ? firstWords(expandedPrinciple.body, 10) : openFolder?.title || "Mind Map";
    const stickyKicker = expandedPrinciple ? `PRINCIPLE #${expandedPrinciple.principle_number}` : "";

    return html`
      <section className="tjm-folder-page-summary" aria-labelledby="tjm-folder-page-title">
        <p className="eyebrow">YOUR DISCOVERIES</p>
        <h2 id="tjm-folder-page-title">Principles</h2>
        <p>Open the Mind Map to arrange your principles and folders. Closing it leaves the rest of this page free to scroll.</p>
        <div className="tjm-folder-summary-stats">
          <span><strong>${principles.length}</strong> principles</span>
          <span><strong>${models.folders.length + models.placeholders.length}</strong> folders</span>
        </div>
        <button type="button" onClick=${() => updateLayout((next) => { next.mapOpen = true; return next; })}>Open Mind Map</button>
      </section>

      <button type="button" className=${`tjm-folder-map-toggle ${mapOpen ? "is-open" : "is-closed"}`}
        onClick=${toggleMap} aria-expanded=${String(mapOpen)}>
        <span aria-hidden="true">${mapOpen ? "×" : "⌘"}</span>${mapOpen ? "Close Mind Map" : "Open Mind Map"}
      </button>

      ${mapOpen && html`
        <div className="tjm-folder-map-overlay" aria-label="Mind Map window">
          <section className="tjm-folder-map-frame">
            <header className="tjm-folder-sticky-header">
              <div className="tjm-folder-title-block">
                ${openFolder && html`<button type="button" className="tjm-folder-back" onClick=${closeFolder}>← Mind Map</button>`}
                ${stickyKicker && html`<small>${stickyKicker}</small>`}
                <h2 title=${stickyTitle}>${stickyTitle}</h2>
              </div>
              <div className="tjm-folder-header-actions">
                ${openFolder && html`
                  <button type="button" onClick=${() => setAddToFolder(openFolder)}>Add principles</button>
                  <button type="button" onClick=${() => setRenameFolder(openFolder)}>Rename</button>
                `}
                <button type="button" className="tjm-folder-tools-toggle" aria-expanded=${String(toolsOpen)}
                  onClick=${() => setToolsOpen((current) => !current)} aria-label="Mind Map tools">⋮</button>
              </div>
              ${toolsOpen && html`
                <aside className="tjm-folder-toolbar">
                  <header><strong>Mind Map tools</strong><button type="button" onClick=${() => setToolsOpen(false)}>×</button></header>
                  <button type="button" onClick=${() => { setEditor({ principle: null }); setToolsOpen(false); }}>+ New principle</button>
                  <button type="button" onClick=${createFolder}>+ New folder</button>
                  <form onSubmit=${searchPrinciple}>
                    <label>Find a principle
                      <div><input value=${search} onInput=${(event) => setSearch(event.currentTarget.value)} placeholder="Number or words" />
                        <button type="submit">Find</button></div>
                    </label>
                  </form>
                  <p>Drag a principle onto an existing folder to add it. Dropping principles on one another never creates a folder.</p>
                </aside>
              `}
            </header>

            <${ReactFlowProvider}>
              ${openFolder
                ? html`<${MapFlow}
                    key=${mapId}
                    nodes=${folderNodes}
                    onNodesChange=${onFolderNodesChange}
                    nodeExtent=${FOLDER_NODE_EXTENT}
                    translateExtent=${FOLDER_EXTENT}
                    initialViewport=${viewport}
                    onViewportEnd=${(nextViewport) => saveViewport(mapId, nextViewport)}
                    onNodeDragStart=${handleMainNodeDragStart}
                    onNodeDragStop=${handleFolderNodeDragStop}
                    onInit=${(instance) => { folderFlow.current = instance; }}
                    onPaneClick=${() => { setExpandedId(""); setMenu(null); }}
                    emptyMessage="This folder has no principles yet."
                  />`
                : html`<${MapFlow}
                    key="main"
                    nodes=${mainNodes}
                    onNodesChange=${onMainNodesChange}
                    nodeExtent=${MAIN_NODE_EXTENT}
                    translateExtent=${MAIN_EXTENT}
                    initialViewport=${viewport}
                    onViewportEnd=${(nextViewport) => saveViewport("main", nextViewport)}
                    onNodeDragStart=${handleMainNodeDragStart}
                    onNodeDragStop=${handleMainNodeDragStop}
                    onInit=${(instance) => { mainFlow.current = instance; }}
                    onPaneClick=${() => { setExpandedId(""); setMenu(null); }}
                    emptyMessage="Create your first principle or folder from the tools menu."
                  />`}
            </${ReactFlowProvider}>
          </section>
        </div>
      `}

      <${EditorSheet} editor=${editor} principles=${principles} bridge=${bridge} busy=${busy}
        onClose=${() => !busy && setEditor(null)} onSaved=${savePrinciple} />
      <${NameFolderSheet} folder=${renameFolder} busy=${busy}
        onClose=${() => !busy && setRenameFolder(null)}
        onSave=${(title) => renameFolder?.isPlaceholder ? renamePlaceholder(renameFolder, title) : renameExistingFolder(renameFolder, title)} />
      <${AddPrinciplesSheet} folder=${addToFolder} candidates=${models.rootPrinciples} busy=${busy}
        onClose=${() => !busy && setAddToFolder(null)} onAdd=${(ids) => addPrinciples(addToFolder, ids)} />
      <${ContextMenu} menu=${menu} onClose=${() => setMenu(null)}
        onEdit=${(principle) => { setMenu(null); setEditor({ principle }); }}
        onRemove=${removeFromFolder}
        onDelete=${deleteItems}
        onRename=${(folder) => { setMenu(null); setRenameFolder(folder); }}
        onAdd=${(folder) => { setMenu(null); setAddToFolder(folder); }}
        onRemoveFolder=${removeFolderKeepPrinciples} />
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
    window.__TJM_REACT_FLOW_ACTIVE = false;
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
    activeHost = host;
    activeRoot = createRoot(host);
    activeSourceSection = source;
    window.__TJM_REACT_FLOW_ACTIVE = true;
    activeRoot.render(html`<${FolderMindMap} bridge=${bridge} />`);
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
