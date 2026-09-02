import fs from "node:fs";
import vm from "node:vm";

const context = { window: {} };
vm.createContext(context);

for (let index = 1; index <= 7; index += 1) {
  const suffix = String(index).padStart(2, "0");
  const file = `lib/principles-mindmap-v4-part-${suffix}.js`;
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

const parts = context.window.__TJM_MINDMAP_V4_PARTS;
if (!Array.isArray(parts) || parts.length !== 7 || parts.some((part) => typeof part !== "string")) {
  throw new Error("Mind Map v4 source parts are incomplete.");
}

const source = parts.join("");
new vm.Script(source, { filename: "principles-mindmap-v4.js" });

for (const marker of [
  "window.__TJM_MINDMAP_V4_LOADED",
  "Group led by #",
  "tjm-v4-single-preview",
  "data-v4-zoom",
  "startPinch",
  "suspendClickActions",
]) {
  if (!source.includes(marker)) throw new Error(`Missing required Mind Map behavior: ${marker}`);
}

console.log(`Mind Map v4 validated: ${source.length} characters across ${parts.length} source parts.`);
