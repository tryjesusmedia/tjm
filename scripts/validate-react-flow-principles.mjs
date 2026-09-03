import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const paths = {
  module: "lib/principles-react-flow-folders.mjs",
  bridge: "lib/principles-react-flow-bridge.js",
  css: "lib/principles-react-flow-folders.css",
  overrides: "lib/principles-react-flow-folders-overrides.css",
  language: "lib/principles-folder-language.js",
  conflictConfig: "bibleandconflictoftheages/config.js",
  chronConfig: "chronbible/config.js",
  legacyDrag: "lib/principles-drag.js",
  legacyGuard: "lib/principles-drag-guard.js",
};

const entries = await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")]));
const source = Object.fromEntries(entries);

for (const path of [paths.module, paths.bridge, paths.language]) {
  execFileSync(process.execPath, ["--check", path], { stdio: "inherit" });
}

assert.match(source.module, /@xyflow\/react@12\.11\.3/);
assert.match(source.module, /translateExtent=\$\{translateExtent\}/);
assert.match(source.module, /nodeExtent=\$\{nodeExtent\}/);
assert.match(source.module, /dragHandle: "\.rf-principle-drag-handle"/);
assert.match(source.module, /dragHandle: "\.rf-folder-drag-handle"/);
assert.match(source.module, /className="tjm-folder-principle-preview nodrag nopan"/);
assert.match(source.module, /ReactFlowProvider/);
assert.match(source.module, /<\$\{Controls\}/);
assert.match(source.module, /<\$\{MiniMap\}/);
assert.match(source.module, /zoomOnPinch=\$\{true\}/);
assert.match(source.module, /onMoveEnd=/);
assert.match(source.module, /rename_conflict_principle_group/);
assert.match(source.module, /update_conflict_principle/);
assert.match(source.module, /move_conflict_principles/);
assert.match(source.module, /soft_delete_conflict_principles/);
assert.match(source.module, /dissolve_conflict_principle_group/);
assert.match(source.module, /New Folder #\$\{folderNumber\}/);
assert.match(source.module, /Remove from folder/);
assert.match(source.module, /Add principles/);
assert.match(source.module, /Close Mind Map/);
assert.match(source.module, /tjm-folder-map-overlay/);
assert.match(source.module, /tjm-folder-sticky-header/);
assert.match(source.module, /candidate\.type === "folder" \|\| candidate\.type === "emptyFolder"/);
assert.doesNotMatch(source.module, /candidate\.type === "principle"/);
assert.doesNotMatch(source.module, /Group led by/);
assert.doesNotMatch(source.module, /New group/);
assert.doesNotMatch(source.module, /Move to another group/);
assert.doesNotMatch(source.module, /Make standalone/);
assert.doesNotMatch(source.module, /location\.reload\(|window\.location\.reload\(/);

assert.match(source.bridge, /TJMReactFlowBridge/);
assert.match(source.bridge, /tjm-principles-updated/);
assert.match(source.bridge, /preserveMountedMindMap/);
assert.match(source.bridge, /tjm-rf-host/);

for (const config of [source.conflictConfig, source.chronConfig]) {
  assert.match(config, /@xyflow\/react@12\.11\.3\/dist\/style\.css/);
  assert.match(config, /principles-react-flow-folders\.css/);
  assert.match(config, /principles-react-flow-folders-overrides\.css/);
  assert.match(config, /principles-folder-language\.js/);
  assert.match(config, /principles-react-flow-bridge\.js/);
  assert.match(config, /type="module" src="\.\.\/lib\/principles-react-flow-folders\.mjs/);
  assert.doesNotMatch(config, /principles-react-flow\.mjs\?/);
}

assert.match(source.legacyDrag, /compatibility stub/);
assert.match(source.legacyGuard, /compatibility/);
assert.doesNotMatch(source.legacyDrag, /addEventListener\(/);
assert.doesNotMatch(source.legacyGuard, /addEventListener\(/);

for (const selector of [
  ".tjm-folder-map-overlay",
  ".tjm-folder-map-frame",
  ".tjm-folder-sticky-header",
  ".tjm-folder-map-toggle",
  ".tjm-folder-flow-wrap",
  ".tjm-folder-number",
  ".tjm-folder-principle-preview",
  ".tjm-folder-editor-sheet",
]) {
  assert.ok(source.css.includes(selector), `Missing folder Mind Map style ${selector}`);
}

assert.match(source.css, /\.tjm-folder-map-overlay\s*\{[\s\S]*?position:\s*fixed/);
assert.match(source.css, /\.tjm-folder-map-frame\s*\{[\s\S]*?border:\s*3px solid #311e33/);
const bodyBlocks = [...source.css.matchAll(/(?:^|})\s*body(?:[\s.#:[>+~][^{]*)?\{([^}]*)\}/gim)];
assert.equal(bodyBlocks.some((match) => /\boverflow\s*:\s*hidden\b/i.test(match[1])), false,
  "The page body must remain scrollable behind the fixed Mind Map.");
assert.match(source.overrides, /left:\s*50%/);
assert.match(source.overrides, /\.tjm-folder-sticky-header\s*\{[\s\S]*?position:\s*sticky/);
assert.ok(source.language.includes("/\\bgroups\\b/g"), "Fallback copy should replace plural group terminology.");
assert.ok(source.language.includes('"folders"'), "Fallback copy should use folder terminology.");

console.log("Folder-based React Flow Mind Map source validation passed.");
