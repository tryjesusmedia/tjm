import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const files = {
  script: "lib/reading-plan-copy-mobile-map-fix.js",
  css: "lib/reading-plan-copy-mobile-map-fix.css",
  conflict: "bibleandconflictoftheages/config.js",
  chron: "chronbible/config.js",
  conflictIndex: "bibleandconflictoftheages/index.html",
  chronIndex: "chronbible/index.html",
};

const source = Object.fromEntries(await Promise.all(
  Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
));

execFileSync(process.execPath, ["--check", files.script], { stdio: "inherit" });

for (const config of [source.conflict, source.chron]) {
  assert.match(config, /reading-plan-copy-mobile-map-fix\.css\?v=20260910-2/);
  assert.match(config, /reading-plan-copy-mobile-map-fix\.js\?v=20260909-1/);
}

assert.match(source.conflictIndex, /config\.js\?v=20260910-7/);
assert.match(source.chronIndex, /config\.js\?v=20260910-8/);

assert.match(source.script, /Use any available whole number/);
assert.match(source.script, /Write one principle at a time/);
assert.match(source.script, /Give this principle a short, memorable name/);
assert.match(source.script, /"Write one principle at a time\."/);
assert.match(source.script, /visualViewport/);
assert.match(source.script, /react-flow__controls-fitview/);
assert.match(source.script, /mobileCameraRepairScheduled/);

assert.match(source.css, /\.principle-number-field small/);
assert.match(source.css, /\.principle-name-field small/);
assert.match(source.css, /--tjm-map-visual-width/);
assert.match(source.css, /overflow-x:\s*clip/);
assert.match(source.css, /\.tjm-fm-text-controls/);
assert.match(source.css, /Keep List, Map, A−, and A\+ together as one compact control row/);
assert.match(source.css, /display:\s*flex\s*!important/);
assert.match(source.css, /width:\s*44px\s*!important/);
assert.match(source.css, /\.react-flow__pane/);
assert.match(source.css, /pointer-events:\s*all\s*!important/);

console.log("Reading-plan copy and mobile Principles Map fix validation passed.");
