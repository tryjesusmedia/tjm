import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const paths = {
  module: "lib/principles-folders-flow.mjs",
  css: "lib/principles-folders-flow.css",
  conflictConfig: "bibleandconflictoftheages/config.js",
  chronConfig: "chronbible/config.js",
  conflictIndex: "bibleandconflictoftheages/index.html",
  chronIndex: "chronbible/index.html",
  conflictApp: "bibleandconflictoftheages/app.js",
  chronApp: "chronbible/app.js",
  namesMigration: "supabase/migrations/20260903190000_principle_names.sql",
  layoutMigration: "supabase/migrations/20260904210000_principles_map_layout.sql",
};

const source = Object.fromEntries(await Promise.all(
  Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
));

execFileSync(process.execPath, ["--check", paths.module], { stdio: "inherit" });

assert.match(source.module, /@xyflow\/react@12\.11\.3/);
assert.match(source.module, /New Folder #/);
assert.match(source.module, /Remove from Folder/);
assert.match(source.module, /Add to Folder/);
assert.match(source.module, /Hold to rename folder/);
assert.match(source.module, /Duplicate/);
assert.match(source.module, /Principle name/);
assert.match(source.module, /set_conflict_principle_name/);
assert.match(source.module, /tjmMindMapOverlay/);
assert.match(source.module, /New Folder/);
assert.match(source.module, /New Principle/);
assert.match(source.module, /Find a Principle/);
assert.match(source.module, /function ListView/);
assert.match(source.module, /function ViewSwitch/);
assert.match(source.module, /function useCompactLayout/);
assert.match(source.module, /Arrange Automatically/);
assert.match(source.module, /Fit All/);
assert.match(source.module, /Rename Folder/);
assert.match(source.module, /function ConfirmationSheet/);
assert.match(source.module, /function UndoBar/);
assert.match(source.module, /get_principle_map_layout/);
assert.match(source.module, /save_principle_map_layout/);
assert.doesNotMatch(source.module, /Related principle numbers/);
assert.match(source.namesMigration, /add column if not exists principle_name text/);
assert.match(source.namesMigration, /where id = p_principle_id and user_id = current_user_id/);
assert.match(source.layoutMigration, /create table if not exists public\.conflict_principle_map_layouts/);
assert.match(source.layoutMigration, /auth\.uid\(\) = user_id/);
assert.match(source.layoutMigration, /function public\.get_principle_map_layout/);
assert.match(source.layoutMigration, /function public\.save_principle_map_layout/);
assert.match(source.module, /Close Principles Map/);
assert.match(source.module, /Open Principles Map/);
assert.match(source.module, /mapOpen:\s*false/);
assert.match(source.module, /\.\.\.current,\s*mapOpen:\s*false/);
assert.match(source.module, /document\.body\.append\(host\)/);
assert.doesNotMatch(source.module, /aria-label="Close Principles Map"[^>]*>×/);
for (const index of [source.conflictIndex, source.chronIndex]) {
  assert.doesNotMatch(index, /data-view="principles"/);
}
for (const app of [source.conflictApp, source.chronApp]) {
  assert.match(app, /tjm-open-principles-map/);
  assert.match(app, /tjm-principles-updated/);
}
assert.match(source.module, /tjm-fm-persistent-toggle/);
assert.match(source.module, /tjm-fm-sticky-header/);
assert.match(source.module, /translateExtent=\$\{translateExtent\}/);
assert.match(source.module, /nodeExtent=\$\{nodeExtent\}/);
assert.match(source.module, /dragHandle: "\.fm-node-drag-handle"/);
assert.match(source.module, /dragHandle: "\.fm-folder-drag-handle"/);
assert.match(source.module, /item\.type === "folder" \|\| item\.type === "emptyFolder"/);
assert.doesNotMatch(source.module, /item\.type === "principle"\)\)/);
assert.doesNotMatch(source.module, />Make standalone</);
assert.doesNotMatch(source.module, />Edit<\/button>[\s\S]{0,300}tjm-fm-principle-bottom/);
assert.doesNotMatch(source.module, /Mind Map Arena/);
assert.doesNotMatch(source.module, /Group led by #/);
assert.doesNotMatch(source.module, /location\.reload\(|window\.location\.reload\(/);

for (const config of [source.conflictConfig, source.chronConfig]) {
  assert.match(config, /principles-folders-flow\.css/);
  assert.match(config, /principles-folders-flow\.mjs/);
  assert.match(config, /principles-react-flow-bridge\.js/);
  assert.doesNotMatch(config, /principles-react-flow\.mjs/);
}

assert.match(source.css, /\.tjm-fm-floating-layer[\s\S]*position:\s*fixed/);
assert.match(source.css, /\.tjm-fm-window[\s\S]*border:\s*2px solid/);
assert.match(source.css, /\.tjm-fm-sticky-header[\s\S]*position:\s*sticky/);
assert.match(source.css, /\.tjm-fm-floating-layer[\s\S]*pointer-events:\s*none/);
assert.match(source.css, /\.tjm-fm-window[\s\S]*pointer-events:\s*auto/);
assert.match(source.css, /\.tjm-fm-principle-bottom/);
assert.match(source.css, /\.tjm-fm-list-view/);
assert.match(source.css, /\.tjm-fm-view-switch/);
assert.match(source.css, /\.tjm-fm-context-menu[\s\S]*position:\s*fixed/);
assert.match(source.css, /@media \(max-width:\s*760px\)[\s\S]*\.tjm-fm-window[\s\S]*inset:\s*0/);
assert.match(source.css, /\.tjm-fm-window-actions button[\s\S]*min-width:\s*44px/);

console.log("Folder Mind Map source validation passed.");
