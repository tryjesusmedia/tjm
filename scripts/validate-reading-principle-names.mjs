import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const files = {
  script: "lib/reading-principle-names.js",
  css: "lib/reading-principle-names.css",
  conflictConfig: "bibleandconflictoftheages/config.js",
  chronConfig: "chronbible/config.js",
  principles: "lib/principles.js",
  conflictApp: "bibleandconflictoftheages/app.js",
  chronApp: "chronbible/app.js",
};

const source = Object.fromEntries(await Promise.all(
  Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
));

execFileSync(process.execPath, ["--check", files.script], { stdio: "inherit" });

for (const config of [source.conflictConfig, source.chronConfig]) {
  assert.match(config, /reading-principle-names\.css\?v=20260909-1/);
  assert.match(config, /reading-principle-names\.js\?v=20260909-1/);
  assert.ok(
    config.indexOf("principles-react-flow-bridge.js") < config.indexOf("reading-principle-names.js"),
    "The name enhancer must load after the Principles bridge.",
  );
}

for (const app of [source.conflictApp, source.chronApp]) {
  assert.match(app, /principleManager\.renderCreateNumberField\(\)/);
  assert.match(app, /principleManager\.renderReadingPrinciple/);
}

assert.match(source.principles, /data-principle-context="\$\{context\}"/);
assert.match(source.script, /Principle name/);
assert.match(source.script, /name="principle-name"/);
assert.match(source.script, /Principle #\$\{Number\(number\)/);
assert.match(source.script, /set_conflict_principle_name/);
assert.match(source.script, /create_conflict_principle/);
assert.match(source.script, /update_conflict_principle/);
assert.match(source.script, /data-principle-context="reading"/);
assert.match(source.script, /principle-mini-identity/);
assert.match(source.script, /pendingCreates/);
assert.match(source.script, /pendingUpdates/);

assert.match(source.css, /\.principle-name-field/);
assert.match(source.css, /\.principle-mini-identity/);
assert.match(source.css, /min-height:\s*54px/);
assert.match(source.css, /@media \(max-width:\s*700px\)/);

console.log("Reading-assignment principle name source validation passed.");
