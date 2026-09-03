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
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useUpdateNodeInternals,
} from "https://esm.sh/@xyflow/react@12.11.3?deps=react@18.3.1,react-dom@18.3.1";

const html = htm.bind(React.createElement);
const CONFIG = window.TJM_CONFLICT_CONFIG || window.TJM_CHRONBIBLE_CONFIG;

if (!CONFIG) {
  console.warn("Folder Mind Map: reading-plan configuration was not found.");
} else {
  const MAIN_TRANSLATE_EXTENT = [[0, 0], [2700, 1800]];
  const MAIN_NODE_EXTENT = [[30, 30], [2260, 1480]];
  const FOLDER_TRANSLATE_EXTENT = [[0, 0], [2050, 1450]];
  const FOLDER_NODE_EXTENT = [[30, 30], [1630, 1110]];
  const SENTINEL_READING_ID = CONFIG.planId === "bible-conflict-ages-v1" ? "coa-000" : "chron-000-00";
  const STORAGE_VERSION = 2;

  let activeHost = null;
  let activeRoot = null;
  let mountQueued = false;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const uuid = () => globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const activeRows = (rows = []) => rows.filter((row) => !row.deleted_at);
  const byNumber = (rows = []) => [...rows].sort((left, right) => Number(left.principle_number) - Number(right.principle_number));
  const principleName = (principle) => String(principle?.principle_name || "").trim() || `Principle #${principle?.principle_number || ""}`;
  const firstLine = (value = "") => String(value).split(/\r?\n/).find((line) => line.trim())?.trim() || "Untitled principle";
  const firstWords = (value = "", count = 8) => {
    const words = firstLine(value).split(/\s+/);
    return words.length > count ? `${words.slice(0, count).join(" ")}…` : words.join(" ");
  };

  function safeJSON(value, fallback) {
    try {
      const parsed = JSON.parse(value);
      return parsed ?? fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function defaultLayout() {
    return {
      version: STORAGE_VERSION,
      mainPositions: {},
      folderPositions: {},
      viewports: {},
      folderNumbers: {},
      folderOrders: {},
      emptyFolders: [],
      pendingNames: {},
      mapOpen: true,
    };
  }

  function createStorage(planId, userId) {
    const key = `tjm-folder-mindmap:${planId}:${userId || "guest"}`;
    const previousKey = `tjm-react-flow-mindmap:${planId}:${userId || "guest"}`;

    function migrate() {
      const previous = safeJSON(localStorage.getItem(previousKey), null);
      if (!previous || typeof previous !== "object") return defaultLayout();
      return {
        ...defaultLayout(),
        mainPositions: previous.mainPositions || {},
        folderPositions: previous.groupPositions || {},
        viewports: previous.viewports || {},
        folderOrders: previous.groupOrders || {},
        emptyFolders: (previous.emptyGroups || []).map((folder) => ({
          id: folder.id,
          title: String(folder.title || "").replace(/^New group$/i, ""),
          number: null,
        })),
      };
    }

    function read() {
      try {
        const current = safeJSON(localStorage.getItem(key), null);
        if (current && typeof current === "object") return { ...defaultLayout(), ...current };
        const migrated = migrate();
        localStorage.setItem(key, JSON.stringify(migrated));
        return migrated;
      } catch (_error) {
        return defaultLayout();
      }
    }

    function write(layout) {
      try {
        localStorage.setItem(key, JSON.stringify({ ...layout, version: STORAGE_VERSION }));
      } catch (_error) {
        // The Mind Map remains usable for this visit when storage is blocked.
      }
    }

    return { read, write };
  }

  function usePersistentLayout(planId, userId) {
    const storage = useMemo(() => createStorage(planId, userId), [planId, userId]);
    const [layout, setLayoutState] = useState(() => storage.read());

    useEffect(() => setLayoutState(storage.read()), [storage]);

    const setLayout = useCallback((updater) => {
      setLayoutState((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        storage.write(next);
        return next;
      });
    }, [storage]);

    return [layout, setLayout];
  }

  function cloneLayout(layout) {
    return {
      ...layout,
      mainPositions: { ...(layout.mainPositions || {}) },
      folderPositions: Object.fromEntries(Object.entries(layout.folderPositions || {}).map(([key, value]) => [key, { ...value }])),
      viewports: { ...(layout.viewports || {}) },
      folderNumbers: { ...(layout.folderNumbers || {}) },
      folderOrders: Object.fromEntries(Object.entries(layout.folderOrders || {}).map(([key, value]) => [key, [...value]])),
      emptyFolders: [...(layout.emptyFolders || [])],
      pendingNames: { ...(layout.pendingNames || {}) },
    };
  }

  function useBridgeRows(bridge) {
    const [rows, setRows] = useState(() => activeRows(bridge.options.getPrinciples?.() || []));

    useEffect(() => {
      const update = (event) => {
        if (event.detail?.planId === CONFIG.planId) setRows(activeRows(event.detail.rows || []));
      };
      window.addEventListener("tjm-principles-updated", update);
      return () => window.removeEventListener("tjm-principles-updated", update);
    }, []);

    const applyRows = useCallback((nextRows) => {
      const normalized = activeRows(nextRows || []);
      setRows(normalized);
      bridge.options.setPrinciples?.(normalized);
      return normalized;
    }, [bridge]);

    return [rows, applyRows];
  }

  function buildFolderModels(principles, layout) {
    const membersByFolder = new Map();
    const unfiled = [];

    for (const principle of activeRows(principles)) {
      if (!principle.group_id) {
        unfiled.push(principle);
        continue;
      }
      if (!membersByFolder.has(principle.group_id)) membersByFolder.set(principle.group_id, []);
      membersByFolder.get(principle.group_id).push(principle);
    }

    const folders = [...membersByFolder.entries()].map(([id, members]) => {
      const ids = members.map((member) => member.id);
      const savedOrder = Array.isArray(layout.folderOrders[id]) ? layout.folderOrders[id] : [];
      const orderedIds = [
        ...savedOrder.filter((item) => ids.includes(item)),
        ...byNumber(members).map((member) => member.id).filter((item) => !savedOrder.includes(item)),
      ];
      const orderedMembers = orderedIds.map((item) => members.find((member) => member.id === item)).filter(Boolean);
      const rawTitle = String(members.find((member) => String(member.group_title || "").trim())?.group_title || "").trim();
      const customTitle = /^(?:group led by|new group)(?:\s*#?\d+)?$/i.test(rawTitle) ? "" : rawTitle;
      const number = Number(layout.folderNumbers[`folder:${id}`]) || null;
      return {
        id,
        members: orderedMembers,
        customTitle,
        number,
        title: customTitle || (number ? `New Folder #${number}` : "New Folder"),
      };
    });

    return { folders, unfiled: byNumber(unfiled) };
  }

  function useDialogFocus(open, ref) {
    useEffect(() => {
      if (!open) return undefined;
      const previous = document.activeElement;
      const focusable = () => [
        ...(ref.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)') || []),
        document.querySelector('.tjm-fm-persistent-toggle'),
      ].filter(Boolean);
      const frame = requestAnimationFrame(() => focusable()[0]?.focus());
      const keydown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          ref.current?.querySelector('[data-close-dialog]')?.click();
        }
        if (event.key === 'Tab') {
          const items = focusable();
          if (!items.length) return;
          const index = items.indexOf(document.activeElement);
          const next = (index + (event.shiftKey ? -1 : 1) + items.length) % items.length;
          event.preventDefault();
          items[next]?.focus();
        }
      };
      document.addEventListener('keydown', keydown);
      return () => {
        cancelAnimationFrame(frame);
        document.removeEventListener('keydown', keydown);
        if (previous?.isConnected) previous.focus?.();
      };
    }, [open, ref]);
  }

  function FolderName({ folder, onOpen, onRename, className, children }) {
    const press = useRef(null);
    const held = useRef(false);
    const cancel = () => { clearTimeout(press.current?.timer); press.current = null; };
    useEffect(() => cancel, []);
    return html`<button type="button" className=${className}
      title="Hold to rename folder (or press F2)"
      onPointerDown=${(event) => {
        if (event.button !== 0) return;
        cancel(); held.current = false;
        press.current = { x: event.clientX, y: event.clientY, timer: setTimeout(() => {
          held.current = true; onRename(folder);
        }, 600) };
      }}
      onPointerMove=${(event) => {
        if (press.current && Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > 10) cancel();
      }}
      onPointerUp=${cancel} onPointerCancel=${cancel} onPointerLeave=${cancel}
      onContextMenu=${(event) => { event.preventDefault(); cancel(); held.current = true; onRename(folder); }}
      onKeyDown=${(event) => {
        if (event.key === 'F2' || (!onOpen && event.key === 'Enter')) {
          event.preventDefault(); onRename(folder);
        }
      }}
      onClick=${() => { if (!held.current) onOpen?.(folder.id); held.current = false; }}>${children}</button>`;
  }

  const PrincipleNode = memo(function PrincipleNode({ id, data, selected }) {
    const updateNodeInternals = useUpdateNodeInternals();
    useEffect(() => {
    const frame = requestAnimationFrame(() => updateNodeInternals(id));
    return () => cancelAnimationFrame(frame);
  }, [id, data.expanded, updateNodeInternals]);
    const principle = data.principle;

    return html`
      <article className=${`tjm-fm-node tjm-fm-principle ${data.expanded ? "is-expanded" : ""} ${selected ? "is-selected" : ""}`}
        data-fm-principle-id=${principle.id}>
        <div className="tjm-fm-principle-row">
          <button type="button" className="tjm-fm-number-handle fm-node-drag-handle"
            title="Drag to move" aria-label=${`Move principle ${principle.principle_number}`}
            onClick=${(event) => event.stopPropagation()}>
            ${principle.principle_number}
          </button>
          <button type="button" className="tjm-fm-principle-preview nodrag nopan"
            aria-expanded=${String(data.expanded)} onClick=${() => data.onToggle(principle.id)}>
            <small>Principle name</small>
            <strong>${principleName(principle)}</strong>
          </button>
          <button type="button" className="tjm-fm-node-menu nodrag nopan"
            aria-label=${`Options for principle ${principle.principle_number}`}
            onClick=${(event) => data.onMenu(event, principle)}>⋮</button>
        </div>
        ${data.expanded && html`
          <div className="tjm-fm-principle-body nodrag nopan">
            <p>${principle.body}</p>
            ${(principle.cross_reference_numbers || []).length > 0 && html`
              <div className="tjm-fm-reference-row">
                ${(principle.cross_reference_numbers || []).map((number) => html`
                  <button type="button" onClick=${() => data.onReference(number)}>#${number}</button>
                `)}
              </div>
            `}
            ${data.readingLabel && html`<small>${data.readingLabel}</small>`}
            ${principle.reading_id && principle.reading_id !== SENTINEL_READING_ID && html`
              <div className="tjm-fm-principle-bottom">
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
      <article className=${`tjm-fm-node tjm-fm-folder ${data.dropTarget ? "is-drop-target" : ""} ${selected ? "is-selected" : ""}`}
        data-fm-folder-id=${folder.id}>
        <div className="tjm-fm-folder-row">
          <button type="button" className="tjm-fm-folder-handle fm-folder-drag-handle"
            title="Drag to move folder" aria-label=${`Move ${folder.title}`}
            onClick=${(event) => event.stopPropagation()}>⠿</button>
          <${FolderName} className="tjm-fm-folder-open nodrag nopan" folder=${folder} onOpen=${data.onOpen} onRename=${data.onRename}>
            <strong>${folder.title}</strong>
            <span>${folder.members.length} ${folder.members.length === 1 ? "principle" : "principles"}</span>
          </${FolderName}>
        </div>
      </article>
    `;
  });

  const EmptyFolderNode = memo(function EmptyFolderNode({ data, selected }) {
    const folder = data.folder;
    return html`
      <article className=${`tjm-fm-node tjm-fm-folder tjm-fm-empty-folder ${data.dropTarget ? "is-drop-target" : ""} ${selected ? "is-selected" : ""}`}
        data-fm-empty-folder-id=${folder.id}>
        <div className="tjm-fm-folder-row">
          <button type="button" className="tjm-fm-folder-handle fm-folder-drag-handle"
            title="Drag to move folder" aria-label=${`Move ${folder.title}`}>⠿</button>
          <${FolderName} className="tjm-fm-folder-open nodrag nopan" folder=${folder} onOpen=${data.onOpen} onRename=${data.onRename}>
            <strong>${folder.title}</strong>
            <span>Empty folder</span>
          </${FolderName}>
        </div>
      </article>
    `;
  });

  const nodeTypes = { principle: PrincipleNode, folder: FolderNode, emptyFolder: EmptyFolderNode };

  function EditorSheet({ editor, principles, bridge, busy, onClose, onSave }) {
    const ref = useRef(null);
    useDialogFocus(Boolean(editor), ref);
    if (!editor) return null;
    const principle = editor.principle || null;
    const source = principle || editor.duplicate || null;
    const nextNumber = [...principles, ...(bridge.options.getDeletedPrinciples?.() || [])]
      .reduce((maximum, item) => Math.max(maximum, Number(item.principle_number) || 0), 0) + 1;

    return html`
      <div className="tjm-fm-dialog-layer" role="presentation" onMouseDown=${(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}>
        <section className="tjm-fm-editor" role="dialog" aria-modal="true" aria-labelledby="tjm-fm-editor-title" ref=${ref}>
          <header>
            <div><small>${editor.duplicate ? "DUPLICATE PRINCIPLE" : principle ? "EDIT PRINCIPLE" : "NEW PRINCIPLE"}</small>
              <h3 id="tjm-fm-editor-title">${editor.duplicate ? "Choose a new number" : principle ? principleName(principle) : "Capture a discovery"}</h3></div>
            <button type="button" data-close-dialog onClick=${onClose} disabled=${busy}>×</button>
          </header>
          <form onSubmit=${(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            onSave({
              principle,
              number: Number(form.get("principle-number")),
              body: String(form.get("principle-body") || "").trim(),
              name: String(form.get("principle-name") || "").trim(),
              source: editor.duplicate,
              folder: editor.folder,
              references: source?.cross_reference_numbers || [],
            });
          }}>
            <div className="tjm-fm-identity-fields">
              <label>Principle number
                <input name="principle-number" type="number" min="1" max="2147483647" step="1" required readOnly=${Boolean(principle)}
                  defaultValue=${principle?.principle_number || (editor.duplicate ? "" : nextNumber)} />
              </label>
              <label>Principle name
                <input name="principle-name" maxLength="120" defaultValue=${editor.duplicate && source?.principle_name === `Principle #${source.principle_number}` ? "" : source?.principle_name || ""}
                  placeholder=${principle ? principleName(principle) : editor.duplicate ? "Principle # (new number)" : `Principle #${nextNumber}`} />
              </label>
            </div>
            <label>Principle
              <textarea name="principle-body" maxLength="2000" required defaultValue=${source?.body || ""}
                placeholder="Write the principle in your own words."></textarea>
            </label>
            <div className="tjm-fm-form-actions">
              <button type="submit" className="is-primary" disabled=${busy}>${busy ? "Saving…" : "Save"}</button>
              <button type="button" onClick=${onClose} disabled=${busy}>Cancel</button>
            </div>
          </form>
        </section>
      </div>
    `;
  }

  function RenameFolderSheet({ folder, busy, onClose, onSave }) {
    const ref = useRef(null);
    useDialogFocus(Boolean(folder), ref);
    if (!folder) return null;
    return html`
      <div className="tjm-fm-dialog-layer" role="presentation" onMouseDown=${(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}>
        <section className="tjm-fm-small-dialog" role="dialog" aria-modal="true" aria-labelledby="tjm-fm-folder-title" ref=${ref}>
          <header><div><small>FOLDER NAME</small><h3 id="tjm-fm-folder-title">Rename folder</h3></div>
            <button type="button" data-close-dialog onClick=${onClose} disabled=${busy}>×</button></header>
          <form onSubmit=${(event) => {
            event.preventDefault();
            onSave(String(new FormData(event.currentTarget).get("folder-title") || "").trim());
          }}>
            <label>Folder name
              <input name="folder-title" maxLength="80" defaultValue=${folder.customTitle || ""} placeholder=${folder.autoTitle} />
            </label>
            <p>Leave it blank to use “${folder.autoTitle}.”</p>
            <div className="tjm-fm-form-actions">
              <button type="submit" className="is-primary" disabled=${busy}>${busy ? "Saving…" : "Save name"}</button>
              <button type="button" onClick=${onClose} disabled=${busy}>Cancel</button>
            </div>
          </form>
        </section>
      </div>
    `;
  }

  function FolderPicker({ principle, folders, emptyFolders, busy, onClose, onChoose }) {
    const ref = useRef(null);
    useDialogFocus(Boolean(principle), ref);
    if (!principle) return null;
    const choices = [
      ...folders.map((folder) => ({ kind: "existing", id: folder.id, title: folder.title, count: folder.members.length })),
      ...emptyFolders.map((folder) => ({ kind: "empty", id: folder.id, title: folder.title, count: 0 })),
    ];
    return html`
      <div className="tjm-fm-dialog-layer" role="presentation" onMouseDown=${(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}>
        <section className="tjm-fm-small-dialog" role="dialog" aria-modal="true" aria-labelledby="tjm-fm-picker-title" ref=${ref}>
          <header><div><small>ADD TO FOLDER</small><h3 id="tjm-fm-picker-title">Principle #${principle.principle_number}</h3></div>
            <button type="button" data-close-dialog onClick=${onClose} disabled=${busy}>×</button></header>
          ${choices.length ? html`
            <div className="tjm-fm-choice-list">
              ${choices.map((choice) => html`
                <button type="button" disabled=${busy} onClick=${() => onChoose(choice)}>
                  <strong>${choice.title}</strong><span>${choice.count ? `${choice.count} principles` : "Empty folder"}</span>
                </button>
              `)}
            </div>
          ` : html`<p>Create a folder first, then add this principle to it.</p>`}
        </section>
      </div>
    `;
  }

  function AddPrinciplesSheet({ target, unfiled, busy, onClose, onAdd }) {
    const ref = useRef(null);
    const [selected, setSelected] = useState(new Set());
    useDialogFocus(Boolean(target), ref);
    useEffect(() => setSelected(new Set()), [target]);
    if (!target) return null;

    return html`
      <div className="tjm-fm-dialog-layer" role="presentation" onMouseDown=${(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}>
        <section className="tjm-fm-small-dialog" role="dialog" aria-modal="true" aria-labelledby="tjm-fm-add-title" ref=${ref}>
          <header><div><small>ADD PRINCIPLES</small><h3 id="tjm-fm-add-title">${target.title}</h3></div>
            <button type="button" data-close-dialog onClick=${onClose} disabled=${busy}>×</button></header>
          ${unfiled.length ? html`
            <form onSubmit=${(event) => { event.preventDefault(); onAdd([...selected]); }}>
              <div className="tjm-fm-check-list">
                ${unfiled.map((principle) => html`
                  <label><input type="checkbox" checked=${selected.has(principle.id)} onChange=${(event) => {
                    setSelected((current) => {
                      const next = new Set(current);
                      if (event.currentTarget.checked) next.add(principle.id); else next.delete(principle.id);
                      return next;
                    });
                  }} />
                    <span className="tjm-fm-mini-number">${principle.principle_number}</span>
                    <span>${firstWords(principle.body, 12)}</span>
                  </label>
                `)}
              </div>
              <div className="tjm-fm-form-actions">
                <button type="submit" className="is-primary" disabled=${busy || selected.size === 0}>${busy ? "Adding…" : `Add ${selected.size || ""}`}</button>
                <button type="button" onClick=${onClose} disabled=${busy}>Cancel</button>
              </div>
            </form>
          ` : html`<p>Every principle is already in a folder.</p>`}
        </section>
      </div>
    `;
  }

  function ContextMenu({ menu, busy, onClose, onEdit, onDuplicate, onAddToFolder, onRemoveFromFolder, onDelete,
    onNewPrinciple, onNewFolder, onFind, onDeleteFolder }) {
    const ref = useRef(null);
    useDialogFocus(Boolean(menu), ref);
    if (!menu) return null;
    return html`
      <div className="tjm-fm-dialog-layer tjm-fm-menu-layer">
        <section className="tjm-fm-context-menu" role="dialog" aria-modal="true"
          aria-label=${menu.kind === 'folder' ? 'Folder menu' : menu.kind === 'principle' ? 'Principle menu' : 'Principles Map menu'} ref=${ref}>
          <button type="button" data-close-dialog onClick=${onClose} disabled=${busy}>Close menu</button>
          <div role="menu">
            ${menu.kind === "principle" ? html`
              <button type="button" role="menuitem" disabled=${busy} onClick=${() => onEdit(menu.item)}>Edit</button>
              <button type="button" role="menuitem" disabled=${busy} onClick=${() => onDuplicate(menu.item)}>Duplicate</button>
              ${menu.item.group_id
                ? html`<button type="button" role="menuitem" disabled=${busy} onClick=${() => onRemoveFromFolder(menu.item)}>Remove from Folder</button>`
                : html`<button type="button" role="menuitem" disabled=${busy} onClick=${() => onAddToFolder(menu.item)}>Add to Folder</button>`}
              <button type="button" role="menuitem" disabled=${busy} className="is-danger" onClick=${() => onDelete([menu.item])}>Delete</button>
            ` : menu.kind === "folder" ? html`
              <button type="button" role="menuitem" disabled=${busy} onClick=${() => onNewPrinciple(menu.item)}>New Principle</button>
              <button type="button" role="menuitem" disabled=${busy} className="is-danger" onClick=${() => onDeleteFolder(menu.item)}>Delete Folder</button>
              <button type="button" role="menuitem" disabled=${busy} onClick=${() => onFind(menu.item)}>Find a Principle</button>
            ` : html`
              <button type="button" role="menuitem" onClick=${onNewFolder}>Create New Folder</button>
              <button type="button" role="menuitem" onClick=${() => onNewPrinciple(null)}>Create New Principle</button>
              <button type="button" role="menuitem" onClick=${() => onFind(null)}>Find a Principle</button>
            `}
          </div>
        </section>
      </div>`;
  }

  function SearchSheet({ searchScope, principles, folders, onClose, onChoose }) {
    const ref = useRef(null);
    const [query, setQuery] = useState('');
    useDialogFocus(Boolean(searchScope), ref);
    useEffect(() => setQuery(''), [searchScope]);
    if (!searchScope) return null;
    const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const matches = (value) => words.length && words.every((word) => value.toLocaleLowerCase().includes(word));
    const foundFolders = searchScope.folder ? [] : folders.filter((folder) => matches(folder.title));
    const foundPrinciples = byNumber(principles).filter((item) =>
      (!searchScope.folder || item.group_id === searchScope.folder.id) &&
      matches(`${item.principle_number} ${principleName(item)} ${item.body}`));
    return html`<div className="tjm-fm-dialog-layer">
      <section className="tjm-fm-small-dialog" role="dialog" aria-modal="true" aria-label="Find a Principle" ref=${ref}>
        <header><h3>Find a Principle</h3><button type="button" data-close-dialog onClick=${onClose} aria-label="Close search">×</button></header>
        <label>Search ${searchScope.folder?.title || 'all folders and principles'}
          <input value=${query} onInput=${(event) => setQuery(event.currentTarget.value)} placeholder="Number, name, or words" />
        </label>
        <div className="tjm-fm-choice-list tjm-fm-search-results" aria-live="polite">
          ${foundFolders.map((folder) => html`<button type="button" onClick=${() => onChoose({ folder })}><strong>${folder.title}</strong><span>Folder</span></button>`)}
          ${foundPrinciples.map((principle) => html`<button type="button" onClick=${() => onChoose({ principle })}>
            <strong>#${principle.principle_number} · ${principleName(principle)}</strong><span>${firstWords(principle.body, 16)}</span>
          </button>`)}
          ${words.length > 0 && !foundFolders.length && !foundPrinciples.length && html`<p>No matches found.</p>`}
        </div>
      </section>
    </div>`;
  }

  function FlowCanvas({ nodes, onNodesChange, mapId, nodeExtent, translateExtent, viewport, onViewport, onInit, onNodeDrag, onNodeDragStop, onPaneClick, emptyMessage }) {
    return html`
      <div className="tjm-fm-flow">
        <${ReactFlow}
          nodes=${nodes}
          edges=${[]}
          nodeTypes=${nodeTypes}
          onNodesChange=${onNodesChange}
          onInit=${onInit}
          onNodeDrag=${onNodeDrag}
          onNodeDragStop=${onNodeDragStop}
          onPaneClick=${onPaneClick}
          onMoveEnd=${(_, nextViewport) => onViewport(mapId, nextViewport)}
          defaultViewport=${viewport || { x: 0, y: 0, zoom: 0.78 }}
          minZoom=${0.42}
          maxZoom=${2.25}
          translateExtent=${translateExtent}
          nodeExtent=${nodeExtent}
          panOnDrag=${true}
          panOnScroll=${false}
          zoomOnScroll=${true}
          zoomOnPinch=${true}
          zoomOnDoubleClick=${false}
          preventScrolling=${true}
          selectionOnDrag=${false}
          nodesConnectable=${false}
          fitView=${!viewport}
          fitViewOptions=${{ padding: 0.18, minZoom: 0.5, maxZoom: 1 }}>
          <${Background} gap=${28} size=${1} color="#d8c9d4" />
          <${Controls} position="bottom-right" showInteractive=${false} />
          <${MiniMap} position="bottom-left" pannable=${true} zoomable=${true}
            nodeColor=${(node) => node.type === "folder" || node.type === "emptyFolder" ? "#6f4868" : "#d1a33c"} />
          ${nodes.length === 0 && html`<div className="tjm-fm-empty-message">${emptyMessage}</div>`}
        </${ReactFlow}>
      </div>
    `;
  }

  function FolderMindMap({ bridge }) {
    const session = bridge.options.getSession?.();
    const userId = session?.user?.id || "guest";
    const [storedPrinciples, applyRows] = useBridgeRows(bridge);
    const [layout, setLayout] = usePersistentLayout(CONFIG.planId, userId);
    const principles = useMemo(() => storedPrinciples.map((item) => ({ ...item,
      principle_name: Object.prototype.hasOwnProperty.call(layout.pendingNames || {}, item.id)
        ? layout.pendingNames[item.id] : item.principle_name,
    })), [storedPrinciples, layout.pendingNames]);
    const [mainNodes, setMainNodes, onMainNodesChange] = useNodesState([]);
    const [folderNodes, setFolderNodes, onFolderNodesChange] = useNodesState([]);
    const [openFolderId, setOpenFolderId] = useState("");
    const [expandedId, setExpandedId] = useState("");
    const [menu, setMenu] = useState(null);
    const [editor, setEditor] = useState(null);
    const [renameFolder, setRenameFolder] = useState(null);
    const [folderPickerPrinciple, setFolderPickerPrinciple] = useState(null);
    const [addTarget, setAddTarget] = useState(null);
    const [searchScope, setSearchScope] = useState(null);
    const [mutating, setBusy] = useState(false);
    const [saving, setSaving] = useState(false);
    const saveLock = useRef(false);
    const busy = mutating || saving;
    const [dropTargetId, setDropTargetId] = useState("");
    const mainFlow = useRef(null);
    const folderFlow = useRef(null);
    const models = useMemo(() => buildFolderModels(principles, layout), [principles, layout]);

    const expandedPrinciple = principles.find((principle) => principle.id === expandedId) || null;

    const mutateLayout = useCallback((updater) => {
      setLayout((current) => updater(cloneLayout(current)));
    }, [setLayout]);

    useEffect(() => {
      const open = () => mutateLayout((next) => { next.mapOpen = true; return next; });
      window.addEventListener('tjm-open-principles-map', open);
      return () => window.removeEventListener('tjm-open-principles-map', open);
    }, [mutateLayout]);

    useEffect(() => {
      mutateLayout((next) => {
        let changed = false;
        let maximum = Math.max(0, ...Object.values(next.folderNumbers).map(Number).filter(Number.isFinite));
        for (const folder of models.folders) {
          const key = `folder:${folder.id}`;
          if (!Number(next.folderNumbers[key])) {
            next.folderNumbers[key] = ++maximum;
            changed = true;
          }
        }
        next.emptyFolders = next.emptyFolders.map((folder) => {
          const key = `empty:${folder.id}`;
          let number = Number(folder.number || next.folderNumbers[key]);
          if (!number) {
            number = ++maximum;
            next.folderNumbers[key] = number;
            changed = true;
          }
          return folder.number === number ? folder : { ...folder, number };
        });
        return changed ? next : next;
      });
    }, [models.folders.map((folder) => folder.id).join("|")]);

    const folderNumber = useCallback((folderId, empty = false) => Number(layout.folderNumbers[`${empty ? "empty" : "folder"}:${folderId}`]) || 0, [layout.folderNumbers]);
    const existingFolders = useMemo(() => models.folders.map((folder) => {
      const number = folderNumber(folder.id);
      return { ...folder, number, autoTitle: `New Folder #${number || ""}`, title: folder.customTitle || `New Folder #${number || ""}` };
    }), [models.folders, folderNumber]);
    const emptyFolders = useMemo(() => (layout.emptyFolders || []).map((folder) => {
      const number = Number(folder.number) || folderNumber(folder.id, true);
      const customTitle = String(folder.title || "").trim();
      return { ...folder, number, customTitle, autoTitle: `New Folder #${number || ""}`, title: customTitle || `New Folder #${number || ""}` };
    }), [layout.emptyFolders, folderNumber]);
    const currentFolder = existingFolders.find((folder) => folder.id === openFolderId)
      || emptyFolders.find((folder) => folder.id === openFolderId) || null;

    const notify = useCallback((message, type = "") => bridge.options.toast?.(message, type), [bridge]);
    const sync = useCallback((message, mode = "") => bridge.options.setSync?.(message, mode), [bridge]);
    const ensureSignedIn = useCallback(() => {
      if (bridge.options.getSession?.()) return true;
      bridge.options.showSignIn?.();
      return false;
    }, [bridge]);

    function applyMutationData(data, existing = principles) {
      if (Array.isArray(data)) return applyRows(activeRows(data));
      if (data?.id) return applyRows([...existing.filter((item) => item.id !== data.id), data]);
      return existing;
    }

    async function runMutation(label, task, success) {
      if (!ensureSignedIn()) return null;
      setBusy(true);
      sync(label, "saving");
      try {
        const result = await task();
        if (result?.error) throw result.error;
        if (success) notify(success);
        sync("Synced across devices", "synced");
        return result;
      } catch (error) {
        sync("Sync failed", "error");
        notify(error?.message || "That change could not be saved.", "error");
        return null;
      } finally {
        setBusy(false);
      }
    }

    const readingLabel = useCallback((principle) => {
      const reading = bridge.options.getReadings?.().find((item) => item.id === principle.reading_id);
      return reading ? bridge.options.readingLabel?.(reading) || reading.title || "Reading" : "Not attached to a reading";
    }, [bridge]);

    const overlayOpen = Boolean(menu || editor || renameFolder || folderPickerPrinciple || addTarget || searchScope);
    const overlayRef = useRef(false);
    overlayRef.current = overlayOpen;
    const historyToken = useRef(uuid());
    const dismissingOverlay = useRef(false);
    const clearOverlays = useCallback(() => {
      setMenu(null); setEditor(null); setRenameFolder(null); setFolderPickerPrinciple(null); setAddTarget(null); setSearchScope(null);
    }, []);

    // One history entry belongs to the entire overlay flow, including menu -> editor.
    useEffect(() => {
      if (overlayOpen && history.state?.tjmMindMapOverlay !== historyToken.current) {
        history.pushState({ ...history.state, tjmMindMapOverlay: historyToken.current }, '');
      } else if (!overlayOpen && history.state?.tjmMindMapOverlay === historyToken.current) {
        dismissingOverlay.current = true;
        history.back();
      }
    }, [overlayOpen]);

    useEffect(() => {
      const popstate = (event) => {
        if (dismissingOverlay.current) { dismissingOverlay.current = false; return; }
        if (overlayRef.current) { clearOverlays(); return; }
        setOpenFolderId(event.state?.tjmFolderMindMap || '');
        setExpandedId('');
      };
      window.addEventListener('popstate', popstate);
      return () => window.removeEventListener('popstate', popstate);
    }, [clearOverlays]);

    useEffect(() => {
      if (!overlayOpen) return;
      const allowed = (target) => target.closest?.('.tjm-fm-dialog-layer, .tjm-fm-persistent-toggle');
      const block = (event) => {
        if (!allowed(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); }
      };
      const focus = (event) => {
        if (!allowed(event.target)) document.querySelector('.tjm-fm-dialog-layer button')?.focus();
      };
      const overflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const events = ['pointerdown', 'pointerup', 'click', 'dblclick', 'contextmenu', 'keydown'];
      events.forEach((name) => document.addEventListener(name, block, true));
      document.addEventListener('focusin', focus, true);
      return () => {
        document.body.style.overflow = overflow;
        events.forEach((name) => document.removeEventListener(name, block, true));
        document.removeEventListener('focusin', focus, true);
      };
    }, [overlayOpen]);

    const openMenu = useCallback((event, kind, item) => {
      event.preventDefault(); event.stopPropagation(); setMenu({ kind, item });
    }, []);

    const openFolderMap = useCallback((folderId) => {
      setOpenFolderId(folderId); setExpandedId(''); clearOverlays();
      const next = { ...history.state, tjmFolderMindMap: folderId };
      delete next.tjmMindMapOverlay;
      if (history.state?.tjmMindMapOverlay === historyToken.current) history.replaceState(next, '');
      else if (history.state?.tjmFolderMindMap !== folderId) history.pushState(next, '');
    }, [clearOverlays]);

    const togglePrinciple = useCallback((id) => {
      setExpandedId((current) => current === id ? "" : id);
      setMenu(null);
    }, []);

    const findReference = useCallback((number) => {
      const principle = principles.find((item) => Number(item.principle_number) === Number(number));
      if (!principle) return notify(`Principle #${number} could not be found.`, "error");
      openFolderMap(principle.group_id || '');
      setExpandedId(principle.id);
    }, [principles, notify, openFolderMap]);

    const callbacks = useCallback(() => ({
      expanded: false,
      onToggle: togglePrinciple,
      onReference: findReference,
      onGoToReading: (principle) => bridge.options.goToReadingById?.(principle.reading_id),
      onMenu: (event, principle) => openMenu(event, "principle", principle),
    }), [togglePrinciple, findReference, bridge, openMenu]);

    const buildMainNodes = useCallback(() => {
      const base = callbacks();
      let index = 0;
      const nextPosition = () => ({ x: 70 + (index % 4) * 500, y: 70 + Math.floor(index++ / 4) * 250 });
      const positions = layout.mainPositions || {};
      const nodes = [];

      for (const folder of existingFolders) {
        const id = `folder:${folder.id}`;
        nodes.push({
          id,
          type: "folder",
          position: positions[id] || positions[`group:${folder.id}`] || nextPosition(),
          dragHandle: ".fm-folder-drag-handle",
          data: {
            folder,
            dropTarget: dropTargetId === id,
            onOpen: openFolderMap,
            onRename: setRenameFolder,
          },
        });
      }

      for (const principle of models.unfiled) {
        const id = `principle:${principle.id}`;
        nodes.push({
          id,
          type: "principle",
          position: positions[id] || positions[`single:${principle.id}`] || nextPosition(),
          dragHandle: ".fm-node-drag-handle",
          data: { ...base, principle, expanded: expandedId === principle.id, readingLabel: readingLabel(principle) },
        });
      }

      for (const folder of emptyFolders) {
        const id = `empty:${folder.id}`;
        nodes.push({
          id,
          type: "emptyFolder",
          position: positions[id] || nextPosition(),
          dragHandle: ".fm-folder-drag-handle",
          data: {
            folder,
            dropTarget: dropTargetId === id,
            onOpen: openFolderMap,
            onRename: setRenameFolder,
          },
        });
      }
      return nodes;
    }, [callbacks, existingFolders, emptyFolders, models.unfiled, layout.mainPositions, expandedId, dropTargetId, readingLabel, openFolderMap, openMenu]);

    const buildFolderNodes = useCallback(() => {
      if (!currentFolder) return [];
      const base = callbacks();
      const positions = layout.folderPositions[currentFolder.id] || {};
      let index = 0;
      return (currentFolder.members || []).map((principle) => ({
        id: `principle:${principle.id}`,
        type: "principle",
        position: positions[principle.id] || { x: 70 + (index % 4) * 410, y: 70 + Math.floor(index++ / 4) * 240 },
        dragHandle: ".fm-node-drag-handle",
        data: { ...base, principle, expanded: expandedId === principle.id, readingLabel: readingLabel(principle) },
      }));
    }, [currentFolder, callbacks, layout.folderPositions, expandedId, readingLabel]);

    useEffect(() => setMainNodes(buildMainNodes()), [buildMainNodes, setMainNodes]);
    useEffect(() => setFolderNodes(buildFolderNodes()), [buildFolderNodes, setFolderNodes]);

    useEffect(() => {
      if (!expandedId) return;
      const frame = requestAnimationFrame(() => {
        const flow = currentFolder ? folderFlow.current : mainFlow.current;
        flow?.fitView({ nodes: [{ id: `principle:${expandedId}` }], padding: 0.4, maxZoom: 1, duration: 180 });
      });
      return () => cancelAnimationFrame(frame);
    }, [expandedId, openFolderId, mainNodes.length, folderNodes.length]);

    const saveViewport = useCallback((mapId, viewport) => {
      mutateLayout((next) => {
        next.viewports[mapId] = viewport;
        return next;
      });
    }, [mutateLayout]);

    const saveNode = useCallback((mapId, node) => {
      mutateLayout((next) => {
        if (mapId === "main") next.mainPositions[node.id] = node.position;
        else {
          const folderId = mapId.slice(7);
          next.folderPositions[folderId] = { ...(next.folderPositions[folderId] || {}), [node.id.replace(/^principle:/, "")]: node.position };
        }
        return next;
      });
    }, [mutateLayout]);

    const recomputeFolderOrder = useCallback((folderId, nodes) => {
      const ids = [...nodes].sort((left, right) => {
        if (Math.abs(left.position.y - right.position.y) > 24) return left.position.y - right.position.y;
        return left.position.x - right.position.x;
      }).map((node) => node.id.replace(/^principle:/, ""));
      mutateLayout((next) => {
        next.folderOrders[folderId] = ids;
        return next;
      });
    }, [mutateLayout]);

    async function saveName(principle, name) {
      const cleanName = name.trim() || null;
      // Retain unsynced names through reloads and background row refreshes.
      mutateLayout((next) => { next.pendingNames[principle.id] = cleanName; return next; });
      try {
        const result = await bridge.options.getDb().rpc('set_conflict_principle_name', {
          p_principle_id: principle.id, p_name: cleanName,
        });
        if (result?.error) throw result.error;
        applyMutationData(result.data);
        mutateLayout((next) => { delete next.pendingNames[principle.id]; return next; });
      } catch (error) {
        sync('Principle name saved on this device', 'error');
        notify('Principle saved. Its name is saved on this device; cloud name sync is not available yet.', 'error');
      }
    }

    async function savePrinciple({ principle, source, folder, number, name, body, references }) {
      if (busy || saveLock.current) return;
      if (!Number.isInteger(number) || number < 1 || number > 2147483647) return notify('Choose a whole principle number greater than zero.', 'error');
      if (principle && number !== Number(principle.principle_number)) return notify('The saved principle number cannot be changed.', 'error');
      if (!body) return notify('Write a principle before saving it.', 'error');
      const reserved = [...principles, ...(bridge.options.getDeletedPrinciples?.() || [])];
      if (reserved.some((item) => item.id !== principle?.id && Number(item.principle_number) === number)) {
        return notify(`Principle #${number} is already in use. Choose a new, unused number.`, 'error');
      }
      const db = bridge.options.getDb();
      saveLock.current = true;
      setSaving(true);
      try {
      if (principle) {
        const result = await runMutation('Saving changes…', () => db.rpc('update_conflict_principle', {
          p_principle_id: principle.id, p_principle_number: number, p_body: body, p_cross_reference_numbers: references,
        }), `Principle #${number} updated.`);
        if (!result) return;
        applyMutationData(result.data);
        await saveName(principle, name);
        setEditor(null); setExpandedId(principle.id);
        return;
      }

      const result = await runMutation('Saving principle…', () => db.rpc('create_conflict_principle', {
        p_plan_id: CONFIG.planId, p_reading_id: source?.reading_id || SENTINEL_READING_ID,
        p_body: body, p_cross_reference_numbers: references, p_principle_number: number,
      }), `Principle #${number} saved.`);
      if (!result) return;
      const created = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!created) return;
      const nextRows = byNumber([...principles, created]);
      applyRows(nextRows);
      mutateLayout((next) => {
        next.mainPositions[`principle:${created.id}`] = { x: 160, y: 150 };
        return next;
      });
      const target = folder || existingFolders.find((item) => item.id === source?.group_id);
      if (target) await addPrinciplesToFolder(target, [created.id], nextRows);
      await saveName(created, name);
      // Close even when the secondary folder/name save failed: the principle was created.
      setEditor(null);
      setExpandedId(created.id);
      } finally {
        saveLock.current = false;
        setSaving(false);
      }
    }

    async function renameExistingFolder(folder, title) {
      const db = bridge.options.getDb();
      const result = await runMutation("Saving folder name…", () => db.rpc("rename_conflict_principle_group", {
        p_group_id: folder.id,
        p_title: title || null,
      }), title ? "Folder name updated." : `${folder.autoTitle} is active.`);
      if (!result) return false;
      applyMutationData(result.data);
      setRenameFolder(null);
    }

    function renameEmptyFolder(folder, title) {
      mutateLayout((next) => {
        next.emptyFolders = next.emptyFolders.map((item) => item.id === folder.id ? { ...item, title } : item);
        return next;
      });
      setRenameFolder(null);
    }

    async function addPrinciplesToFolder(target, ids, currentRows = principles) {
      if (!ids.length) return;
      const db = bridge.options.getDb();
      const isEmpty = !target.members;
      const mode = isEmpty ? "new" : "existing";
      const targetPrincipleId = isEmpty ? null : target.members[0]?.id;
      const title = isEmpty ? target.title : null;
      const result = await runMutation("Adding principles…", () => db.rpc("move_conflict_principles", {
        p_principle_ids: ids,
        p_target_principle_id: targetPrincipleId,
        p_mode: mode,
        p_group_title: title,
      }), ids.length === 1 ? "Principle added to folder." : `${ids.length} principles added to folder.`);
      if (!result) return;
      const nextRows = applyMutationData(result.data, currentRows);
      const firstMoved = nextRows.find((item) => ids.includes(item.id));
      const folderId = firstMoved?.group_id || target.id;
      mutateLayout((next) => {
        const oldOrder = next.folderOrders[folderId] || (target.members || []).map((item) => item.id);
        next.folderOrders[folderId] = [...oldOrder.filter((item) => !ids.includes(item)), ...ids];
        ids.forEach((id) => {
          delete next.mainPositions[`principle:${id}`];
          delete next.mainPositions[`single:${id}`];
        });
        if (isEmpty && folderId) {
          const emptyKey = `empty:${target.id}`;
          const folderKey = `folder:${folderId}`;
          next.folderNumbers[folderKey] = target.number;
          next.mainPositions[folderKey] = next.mainPositions[emptyKey] || { x: 160, y: 150 };
          delete next.mainPositions[emptyKey];
          delete next.folderNumbers[emptyKey];
          next.emptyFolders = next.emptyFolders.filter((item) => item.id !== target.id);
        }
        return next;
      });
      if (openFolderId === target.id && folderId !== target.id) {
        setOpenFolderId(folderId);
        history.replaceState({ ...history.state, tjmFolderMindMap: folderId }, '');
      }
      setAddTarget(null);
      setFolderPickerPrinciple(null);
    }

    async function removeFromFolder(principle) {
      const folderId = principle.group_id;
      const db = bridge.options.getDb();
      const result = await runMutation("Removing from folder…", () => db.rpc("move_conflict_principles", {
        p_principle_ids: [principle.id],
        p_target_principle_id: null,
        p_mode: "standalone",
        p_group_title: null,
      }), `Principle #${principle.principle_number} moved to the main Principles Map.`);
      if (!result) return;
      applyMutationData(result.data);
      mutateLayout((next) => {
        next.folderOrders[folderId] = (next.folderOrders[folderId] || []).filter((item) => item !== principle.id);
        if (next.folderPositions[folderId]) delete next.folderPositions[folderId][principle.id];
        const folderPosition = next.mainPositions[`folder:${folderId}`] || { x: 120, y: 120 };
        next.mainPositions[`principle:${principle.id}`] = { x: folderPosition.x + 330, y: folderPosition.y + 30 };
        return next;
      });
      openFolderMap('');
      setExpandedId(principle.id);
    }

    async function removeFolderKeepPrinciples(folder) {
      if (!window.confirm(`Delete “${folder.title}”? Every principle inside will be kept on the main Principles Map.`)) return;
      const db = bridge.options.getDb();
      const result = await runMutation("Removing folder…", () => db.rpc("dissolve_conflict_principle_group", {
        p_group_id: folder.id,
      }), "Folder removed. Every principle was kept.");
      if (!result) return;
      applyMutationData(result.data);
      mutateLayout((next) => {
        const origin = next.mainPositions[`folder:${folder.id}`] || { x: 100, y: 100 };
        folder.members.forEach((principle, index) => {
          next.mainPositions[`principle:${principle.id}`] = {
            x: origin.x + (index % 2) * 340,
            y: origin.y + Math.floor(index / 2) * 135,
          };
        });
        delete next.mainPositions[`folder:${folder.id}`];
        delete next.folderPositions[folder.id];
        delete next.folderOrders[folder.id];
        delete next.folderNumbers[`folder:${folder.id}`];
        return next;
      });
      openFolderMap('');
    }

    async function deletePrinciples(items, options = {}) {
      if (!items.length) return false;
      const label = items.length === 1 ? `principle #${items[0].principle_number}` : `${items.length} principles`;
      if (options.confirm !== false && !window.confirm(`Move ${label} to Recently Deleted?`)) return false;
      const ids = new Set(items.map((item) => item.id));
      const db = bridge.options.getDb();
      const result = await runMutation("Moving to Recently Deleted…", () => db.rpc("soft_delete_conflict_principles", {
        p_principle_ids: [...ids],
      }), `${label} moved to Recently Deleted.`);
      if (!result) return false;
      applyMutationData(result.data);
      const deleted = items.map((item) => ({ ...item, deleted_at: new Date().toISOString() }));
      bridge.options.setDeletedPrinciples?.([...deleted, ...(bridge.options.getDeletedPrinciples?.() || []).filter((item) => !ids.has(item.id))]);
      mutateLayout((next) => {
        items.forEach((item) => {
          delete next.mainPositions[`principle:${item.id}`];
          delete next.mainPositions[`single:${item.id}`];
          if (item.group_id && next.folderPositions[item.group_id]) delete next.folderPositions[item.group_id][item.id];
        });
        Object.keys(next.folderOrders).forEach((folderId) => {
          next.folderOrders[folderId] = next.folderOrders[folderId].filter((item) => !ids.has(item));
        });
        return next;
      });
      setMenu(null);
      if (expandedId && ids.has(expandedId)) setExpandedId("");
      return true;
    }

    async function deleteFolder(folder) {
      if (folder.members) return removeFolderKeepPrinciples(folder);
      if (!window.confirm(`Delete “${folder.title}”?`)) return;
      mutateLayout((next) => {
        next.emptyFolders = next.emptyFolders.filter((item) => item.id !== folder.id);
        delete next.mainPositions[`empty:${folder.id}`];
        delete next.folderNumbers[`empty:${folder.id}`];
        return next;
      });
      openFolderMap('');
    }

    function createFolder() {
      if (!ensureSignedIn()) return;
      mutateLayout((next) => {
        const maximum = Math.max(0, ...Object.values(next.folderNumbers).map(Number).filter(Number.isFinite));
        const number = maximum + 1;
        const id = uuid();
        next.emptyFolders.push({ id, title: "", number });
        next.folderNumbers[`empty:${id}`] = number;
        next.mainPositions[`empty:${id}`] = { x: 160, y: 150 };
        return next;
      });
      setMenu(null);
      notify("New folder created. Add principles when you are ready.");
    }

    const onMainNodeDrag = useCallback((_, node) => {
      if (node.type !== "principle") return setDropTargetId("");
      const target = (mainFlow.current?.getIntersectingNodes?.(node, true) || [])
        .find((item) => item.id !== node.id && (item.type === "folder" || item.type === "emptyFolder"));
      setDropTargetId(target?.id || "");
    }, []);

    const onMainNodeDragStop = useCallback(async (_, node) => {
      saveNode("main", node);
      setDropTargetId("");
      if (node.type !== "principle") return;
      const target = (mainFlow.current?.getIntersectingNodes?.(node, true) || [])
        .find((item) => item.id !== node.id && (item.type === "folder" || item.type === "emptyFolder"));
      if (!target) return;
      const principle = principles.find((item) => `principle:${item.id}` === node.id);
      if (!principle) return;
      const folder = target.type === "folder"
        ? existingFolders.find((item) => `folder:${item.id}` === target.id)
        : emptyFolders.find((item) => `empty:${item.id}` === target.id);
      if (folder) await addPrinciplesToFolder(folder, [principle.id]);
    }, [saveNode, principles, existingFolders, emptyFolders]);

    const onFolderNodeDragStop = useCallback((_, node) => {
      if (!currentFolder) return;
      saveNode(`folder:${currentFolder.id}`, node);
      setFolderNodes((current) => {
        const updated = current.map((item) => item.id === node.id ? { ...item, position: node.position } : item);
        recomputeFolderOrder(currentFolder.id, updated);
        return updated;
      });
    }, [currentFolder, saveNode, setFolderNodes, recomputeFolderOrder]);

    const mapOpen = layout.mapOpen !== false;
    const mapId = currentFolder ? `folder:${currentFolder.id}` : "main";
    const panelTitle = expandedPrinciple
      ? principleName(expandedPrinciple)
      : currentFolder?.title || "Principles Map";
    const displayedNodes = currentFolder ? folderNodes : mainNodes;
    const displayedChanges = currentFolder ? onFolderNodesChange : onMainNodesChange;

    return html`
      <div className="tjm-fm-shell">
        <button type="button" className=${`tjm-fm-persistent-toggle ${mapOpen ? "is-open" : ""}`}
          onClick=${() => { clearOverlays(); mutateLayout((next) => { next.mapOpen = !mapOpen; return next; }); }}>
          ${mapOpen ? "Close Principles Map" : "Open Principles Map"}
        </button>

        ${mapOpen && html`
          <div className="tjm-fm-floating-layer">
            <section className="tjm-fm-window" aria-label=${panelTitle}>
              <header className="tjm-fm-sticky-header">
                <div className="tjm-fm-title-row">
                  ${currentFolder && html`
                    <button type="button" className="tjm-fm-back" aria-label="Back to Principles Map"
                      onClick=${() => { if (history.state?.tjmFolderMindMap) history.back(); else { setOpenFolderId(""); setExpandedId(""); } }}>←</button>
                  `}
                  <h2 title=${panelTitle}>${currentFolder && !expandedPrinciple
                    ? html`<${FolderName} className="tjm-fm-folder-title" folder=${currentFolder} onRename=${setRenameFolder}>${panelTitle}</${FolderName}>`
                    : panelTitle}</h2>
                </div>
                <div className="tjm-fm-window-actions">
                  <button type="button" aria-label=${currentFolder ? 'Folder menu' : 'Principles Map menu'}
                    onClick=${(event) => openMenu(event, currentFolder ? 'folder' : 'main', currentFolder)} aria-expanded=${String(Boolean(menu))}>☰</button>
                  ${!currentFolder && html`<button type="button" onClick=${() => { clearOverlays(); mutateLayout((next) => { next.mapOpen = false; return next; }); }} aria-label="Close Principles Map">×</button>`}
                </div>
              </header>

              <main className="tjm-fm-map-body">
                ${!session ? html`<div className="tjm-fm-page-placeholder">
                  <h2>Principles Map</h2><p>Sign in to organize your principles into folders.</p>
                  <button type="button" onClick=${() => bridge.options.showSignIn?.()}>Continue with Google</button>
                </div>` : html`
                <${ReactFlowProvider}>
                  <${FlowCanvas}
                    key=${mapId}
                    nodes=${displayedNodes}
                    onNodesChange=${displayedChanges}
                    mapId=${mapId}
                    nodeExtent=${currentFolder ? FOLDER_NODE_EXTENT : MAIN_NODE_EXTENT}
                    translateExtent=${currentFolder ? FOLDER_TRANSLATE_EXTENT : MAIN_TRANSLATE_EXTENT}
                    viewport=${layout.viewports[mapId] || null}
                    onViewport=${saveViewport}
                    onInit=${(instance) => { if (currentFolder) folderFlow.current = instance; else mainFlow.current = instance; }}
                    onNodeDrag=${currentFolder ? undefined : onMainNodeDrag}
                    onNodeDragStop=${currentFolder ? onFolderNodeDragStop : onMainNodeDragStop}
                    onPaneClick=${() => { setExpandedId(""); setMenu(null); }}
                    emptyMessage=${currentFolder ? "This folder is empty." : "Create a principle or folder from the menu."}
                  />
                </${ReactFlowProvider}>
                `}
              </main>
            </section>
          </div>
        `}

        <${EditorSheet} editor=${editor} principles=${principles} bridge=${bridge} busy=${busy}
          onClose=${() => !busy && setEditor(null)} onSave=${savePrinciple} />
        <${RenameFolderSheet} folder=${renameFolder} busy=${busy}
          onClose=${() => !busy && setRenameFolder(null)}
          onSave=${(title) => renameFolder?.members ? renameExistingFolder(renameFolder, title) : renameEmptyFolder(renameFolder, title)} />
        <${FolderPicker} principle=${folderPickerPrinciple} folders=${existingFolders} emptyFolders=${emptyFolders} busy=${busy}
          onClose=${() => !busy && setFolderPickerPrinciple(null)}
          onChoose=${(choice) => {
            const folder = choice.kind === "existing" ? existingFolders.find((item) => item.id === choice.id) : emptyFolders.find((item) => item.id === choice.id);
            if (folder && folderPickerPrinciple) addPrinciplesToFolder(folder, [folderPickerPrinciple.id]);
          }} />
        <${AddPrinciplesSheet} target=${addTarget} unfiled=${models.unfiled} busy=${busy}
          onClose=${() => !busy && setAddTarget(null)} onAdd=${(ids) => addPrinciplesToFolder(addTarget, ids)} />
        <${SearchSheet} searchScope=${searchScope} principles=${principles} folders=${[...existingFolders, ...emptyFolders]}
          onClose=${() => setSearchScope(null)} onChoose=${({ folder, principle }) => {
            openFolderMap(folder?.id || principle?.group_id || '');
            if (principle) setExpandedId(principle.id);
          }} />
        <${ContextMenu} menu=${menu} busy=${busy} onClose=${() => !busy && setMenu(null)}
          onEdit=${(principle) => { setMenu(null); setEditor({ principle }); }}
          onDuplicate=${(principle) => { setMenu(null); setEditor({ duplicate: principle }); }}
          onAddToFolder=${(principle) => { setMenu(null); setFolderPickerPrinciple(principle); }}
          onRemoveFromFolder=${removeFromFolder} onDelete=${deletePrinciples}
          onNewPrinciple=${(folder) => { setMenu(null); setEditor({ principle: null, folder }); }}
          onNewFolder=${createFolder} onDeleteFolder=${deleteFolder}
          onFind=${(folder) => { setMenu(null); setSearchScope({ folder }); }} />
      </div>
    `;
  }

  function unmountCurrent() {
    if (activeRoot) {
      try { activeRoot.unmount(); } catch (_error) {}
    }
    activeHost?.remove();
    activeRoot = null;
    activeHost = null;
  }

  function mount() {
    mountQueued = false;
    const bridge = window.TJMReactFlowBridge;
    if (!bridge?.options) {
      if (activeHost && !activeHost.isConnected) unmountCurrent();
      return;
    }
    if (activeHost?.isConnected) return;

    unmountCurrent();
    const host = document.createElement("div");
    host.className = "tjm-rf-host tjm-fm-host";
    document.body.append(host);
    const root = createRoot(host);
    activeHost = host;
    activeRoot = root;
    root.render(html`<${FolderMindMap} bridge=${bridge} />`);
  }

  function queueMount() {
    if (mountQueued) return;
    mountQueued = true;
    requestAnimationFrame(mount);
  }

  const observer = new MutationObserver(queueMount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("tjm-principles-bridge-ready", queueMount);
  window.addEventListener("DOMContentLoaded", queueMount, { once: true });
  queueMount();
}
