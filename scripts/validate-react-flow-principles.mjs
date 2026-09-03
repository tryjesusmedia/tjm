import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const paths = {
  module: "lib/principles-react-flow.mjs",
  bridge: "lib/principles-react-flow-bridge.js",
  css: "lib/principles-react-flow.css",
  conflictConfig: "bibleandconflictoftheages/config.js",
  chronConfig: "chronbible/config.js",
  legacyDrag: "lib/principles-drag.js",
  legacyGuard: "lib/principles-drag-guard.js",
};

const entries = await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")]));
const source = Object.fromEntries(entries);

execFileSync(process.execPath, ["--check", paths.module], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", paths.bridge], { stdio: "inherit" });

assert.match(source.module, /@xyflow\/react@12\.11\.3/);
assert.match(source.module, /translateExtent=\$\{translateExtent\}/);
assert.match(source.module, /nodeExtent=\$\{nodeExtent\}/);
assert.match(source.module, /dragHandle: "\.rf-node-drag-handle"/);
assert.match(source.module, /className="tjm-rf-preview nodrag nopan"/);
assert.match(source.module, /ReactFlowProvider/);
assert.match(source.module, /<\$\{Controls\}/);
assert.match(source.module, /<\$\{MiniMap\}/);
assert.match(source.module, /zoomOnPinch=\$\{true\}/);
assert.match(source.module, /onMoveEnd=/);
assert.match(source.module, /rename_conflict_principle_group/);
assert.match(source.module, /update_conflict_principle/);
assert.match(source.module, /move_conflict_principles/);
assert.match(source.module, /soft_delete_conflict_principles/);
assert.match(source.module, /Group led by #/);
assert.match(source.module, /tjm-rf-editor-sheet/);
assert.match(source.module, /tjm-rf-compact-single|tjm-rf-principle-node/);
assert.doesNotMatch(source.module, /location\.reload\(|window\.location\.reload\(/);

assert.match(source.bridge, /TJMReactFlowBridge/);
assert.match(source.bridge, /tjm-principles-updated/);
assert.match(source.bridge, /preserveMountedMindMap/);
assert.match(source.bridge, /tjm-rf-host/);

for (const config of [source.conflictConfig, source.chronConfig]) {
  assert.match(config, /@xyflow\/react@12\.11\.3\/dist\/style\.css/);
  assert.match(config, /principles-react-flow\.css/);
  assert.match(config, /principles-react-flow-bridge\.js/);
  assert.match(config, /type="module" src="\.\.\/lib\/principles-react-flow\.mjs/);
  assert.doesNotMatch(config, /principles-mindmap-v4-part/);
}

assert.match(source.legacyDrag, /compatibility stub/);
assert.match(source.legacyGuard, /compatibility/);
assert.doesNotMatch(source.legacyDrag, /addEventListener\(/);
assert.doesNotMatch(source.legacyGuard, /addEventListener\(/);

for (const selector of [
  ".tjm-rf-flow-wrap",
  ".tjm-rf-number-handle",
  ".tjm-rf-preview",
  ".tjm-rf-editor-sheet",
  ".tjm-rf-dialog-backdrop",
]) {
  assert.ok(source.css.includes(selector), `Missing React Flow style ${selector}`);
}

console.log("React Flow Principles Mind Map source validation passed.");
