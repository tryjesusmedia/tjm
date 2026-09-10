import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const files = {
  conflictIndex: "bibleandconflictoftheages/index.html",
  chronIndex: "chronbible/index.html",
  globalCss: "assets/readability.css",
  heroCss: "bibleandconflictoftheages/hero-readability.css",
  textCss: "lib/principles-text-size.css",
  textJs: "lib/principles-text-size.js",
  conflictConfig: "bibleandconflictoftheages/config.js",
  chronConfig: "chronbible/config.js",
};

const source = Object.fromEntries(await Promise.all(
  Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
));

execFileSync(process.execPath, ["--check", files.textJs], { stdio: "inherit" });

assert.match(source.conflictIndex, /hero-readability\.css\?v=20260908-1/);
assert.match(source.conflictIndex, /config\.js\?v=20260910-5/);
assert.match(source.conflictIndex, /readability\.css\?v=20260910-1/);
assert.match(source.conflictIndex, /class="hero-intro-lead"/);
assert.match(source.conflictIndex, /<details class="hero-intro-more">/);
assert.match(source.conflictIndex, /<summary>Read more about this journey<\/summary>/);
assert.doesNotMatch(source.conflictIndex, /<details class="hero-intro-more"\s+open/);
assert.match(source.conflictIndex, /class="hero-intro-more-content"/);
assert.match(source.chronIndex, /config\.js\?v=20260910-5/);
assert.match(source.chronIndex, /readability\.css\?v=20260910-1/);

assert.match(source.globalCss, /:not\(\.tjm-fm-principle-body-text\)/);

assert.match(source.heroCss, /\.journey-hero \.hero-intro > \.hero-intro-lead/);
assert.match(source.heroCss, /font-size:\s*clamp\(1\.15rem/);
assert.match(source.heroCss, /\.hero-intro-more\[open\]/);
assert.match(source.heroCss, /min-height:\s*58px/);

for (const config of [source.conflictConfig, source.chronConfig]) {
  assert.match(config, /principles-folders-flow\.css\?v=20260910-1/);
  assert.match(config, /principles-folders-flow\.mjs\?v=20260910-4/);
  assert.match(config, /principles-text-size\.css\?v=20260910-3/);
  assert.match(config, /principles-text-size\.js\?v=20260910-3/);
}

assert.match(source.textJs, /tjm-principles-text-size/);
assert.match(source.textJs, /tjm-guide-text-size/);
assert.match(source.textJs, /const STEP_COUNT = 40/);
assert.match(source.textJs, /const MAX_STEP = STEP_COUNT - 1/);
assert.match(source.textJs, /principlesTextStep/);
assert.match(source.textJs, /MutationObserver/);
assert.match(source.textJs, /data-principles-text-action="decrease"/);
assert.match(source.textJs, /data-principles-text-action="increase"/);
assert.doesNotMatch(source.textJs, /data-principles-text-action="reset"/);
assert.doesNotMatch(source.textJs, /data-principles-text-status/);
assert.match(source.textJs, /decrease\.disabled = step <= MIN_STEP/);
assert.match(source.textJs, /increase\.disabled = step >= MAX_STEP/);
assert.match(source.textJs, /tjm-principles-text-size-change/);
assert.match(source.textJs, /small: 3, default: DEFAULT_STEP, large: 10/);
assert.match(source.textJs, /saved !== String\(step\)/);
assert.match(source.textJs, /A−/);
assert.match(source.textJs, /A\+/);

assert.match(source.textCss, /--tjm-principles-node-width/);
assert.match(source.textCss, /--tjm-principles-expanded-width/);
assert.match(source.textCss, /flex-wrap:\s*nowrap/);
assert.match(source.textCss, /\.tjm-fm-view-switch button[\s\S]*min-height:\s*44px/);
assert.match(source.textCss, /\.tjm-fm-principle-body > p/);
assert.match(source.textCss, /\.tjm-fm-list-principle-detail > p/);
assert.match(source.textCss, /\.tjm-fm-principle-summary-text/);
assert.match(source.textCss, /\.tjm-fm-principle-body-text/);
assert.match(source.textCss, /\.tjm-fm-principle-bottom button/);
assert.match(source.textCss, /\.tjm-fm-reading-link/);
assert.doesNotMatch(source.textCss, /\.tjm-fm-list-section h3/);
assert.doesNotMatch(source.textCss, /\.tjm-fm-workspace-toolbar > span/);
assert.match(source.textCss, /\.tjm-fm-editor textarea/);
assert.match(source.textCss, /\.tjm-fm-folder-open strong/);
assert.doesNotMatch(source.textCss, /\.tjm-fm-text-controls button\[aria-pressed="true"\]/);
assert.match(source.textCss, /\.tjm-fm-text-controls button:disabled/);
assert.match(source.textCss, /--tjm-principles-card-max-height/);
assert.match(source.textCss, /overflow-y:\s*auto/);
assert.match(source.textCss, /touch-action:\s*pan-y/);

console.log("Readable journey introduction and adjustable Principles typography validation passed.");
