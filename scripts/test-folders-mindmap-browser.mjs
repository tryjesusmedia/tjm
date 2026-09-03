import assert from "node:assert/strict";
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  try {
    const relative = normalize(decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/+/, ""));
    if (relative.startsWith("..")) throw new Error("Invalid path");
    let file = join(root, relative || "scripts/folders-mindmap-smoke.html");
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    response.writeHead(200, {
      "content-type": types[extname(file)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(await readFile(file));
  } catch (_error) {
    response.writeHead(404);
    response.end("Not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

try {
  await page.goto(`http://127.0.0.1:${address.port}/scripts/folders-mindmap-smoke.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".tjm-fm-window .react-flow", { timeout: 45_000 });

  const windowBox = await page.locator(".tjm-fm-window").boundingBox();
  assert.ok(windowBox && windowBox.x > 0 && windowBox.y > 0);
  assert.ok(windowBox.x + windowBox.width < 1280 && windowBox.y + windowBox.height < 900);
  assert.equal((await page.locator(".tjm-fm-title-row h2").textContent())?.trim(), "Principles Map");
  assert.equal(await page.getByRole("button", { name: "Principles", exact: true }).count(), 0);
  assert.equal(await page.getByText("Group led by", { exact: false }).count(), 0);
  assert.equal(await page.getByText("New Folder #1", { exact: true }).count(), 1);
  assert.equal(await page.locator('[data-fm-folder-id="g1"] .tjm-fm-node-menu').count(), 0);
  assert.equal(await page.locator('[data-fm-empty-folder-id] .tjm-fm-node-menu').count(), 0);

  // The fixed launcher and open map survive every page-tab change.
  const launcher = page.locator(".tjm-fm-persistent-toggle");
  await launcher.click();
  await page.waitForSelector(".tjm-fm-window", { state: "detached" });
  assert.equal((await launcher.textContent())?.trim(), "Open Principles Map");
  await page.getByRole("button", { name: "Journey", exact: true }).click();
  assert.equal(await launcher.count(), 1);
  await launcher.click();
  await page.waitForSelector(".tjm-fm-window");
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  assert.equal(await page.locator(".tjm-fm-window").count(), 1);
  await page.getByRole("button", { name: "Readings", exact: true }).click();
  assert.equal(await launcher.count(), 1);

  // The main menu has exactly the requested three actions and acts as a modal.
  await page.getByRole("button", { name: "Principles Map menu", exact: true }).click();
  assert.deepEqual(await page.locator('.tjm-fm-context-menu [role="menu"] button').allTextContents(), [
    "Create New Folder", "Create New Principle", "Find a Principle",
  ]);
  assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
  await page.goBack();
  await page.waitForSelector(".tjm-fm-context-menu", { state: "detached" });
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");

  // Search lists every matching folder and principle from the main map.
  await page.getByRole("button", { name: "Principles Map menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Find a Principle", exact: true }).click();
  await page.getByLabel("Search all folders and principles", { exact: true }).fill("grace");
  assert.equal(await page.getByRole("button", { name: /#12 · Principle #12/ }).count(), 1);
  await page.getByRole("button", { name: /#12 · Principle #12/ }).click();
  await page.waitForSelector('[data-fm-principle-id="p1"]');

  // A folder menu has only the requested actions; Back dismisses it first.
  await page.getByRole("button", { name: "Folder menu", exact: true }).click();
  assert.equal(await page.locator('.tjm-fm-window-actions [aria-label="Close Principles Map"]').count(), 0);
  assert.equal((await launcher.textContent())?.trim(), "Close Principles Map");
  assert.deepEqual(await page.locator('.tjm-fm-context-menu [role="menu"] button').allTextContents(), [
    "New Principle", "Delete Folder", "Find a Principle",
  ]);
  await page.goBack();
  await page.waitForSelector(".tjm-fm-context-menu", { state: "detached" });
  assert.equal(await page.getByRole("button", { name: "Folder menu", exact: true }).count(), 1);

  // F2 is the keyboard counterpart of the same long-press folder rename action.
  await page.locator('[data-fm-principle-id="p1"] .tjm-fm-principle-preview').click();
  await page.locator(".tjm-fm-folder-title").press("F2");
  assert.equal(await page.getByRole("dialog", { name: "Rename folder", exact: false }).count(), 1);
  await page.getByRole("button", { name: "×", exact: true }).click();

  // Duplicate copies body, reading, references, and folder, but requires a new number.
  const filed = page.locator('[data-fm-principle-id="p1"]');
  await filed.locator(".tjm-fm-node-menu").click();
  assert.deepEqual(await page.locator('.tjm-fm-context-menu [role="menu"] button').allTextContents(), [
    "Edit", "Duplicate", "Remove from Folder", "Delete",
  ]);
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  assert.equal(await page.getByLabel("Principle number", { exact: true }).inputValue(), "");
  assert.equal(await page.locator('textarea[name="principle-body"]').inputValue(), "Grace changes how we see both God and one another.");
  await page.getByLabel("Principle number", { exact: true }).fill("90");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(100);
  assert.match(await page.locator("#toast-region").textContent(), /already in use/i);
  await page.getByLabel("Principle number", { exact: true }).fill("55");
  await page.getByLabel("Principle name", { exact: true }).fill("Grace copied");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForSelector('[data-fm-principle-id] .tjm-fm-principle-preview strong:text-is("Grace copied")');
  const calls = await page.evaluate(() => window.__rpcCalls);
  const created = calls.find((call) => call.name === "create_conflict_principle" && call.args.p_principle_number === 55);
  assert.equal(created.args.p_reading_id, "r1");
  assert.deepEqual(created.args.p_cross_reference_numbers, []);
  assert.ok(calls.some((call) => call.name === "move_conflict_principles" && call.args.p_principle_ids.length === 1));
  assert.ok(calls.some((call) => call.name === "set_conflict_principle_name" && call.args.p_name === "Grace copied"));

  // An in-folder New Principle is moved into that folder after creation.
  await page.getByRole("button", { name: "Folder menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "New Principle", exact: true }).click();
  await page.getByLabel("Principle number", { exact: true }).fill("56");
  await page.getByLabel("Principle name", { exact: true }).fill("Created here");
  await page.locator('textarea[name="principle-body"]').fill("A new in-folder discovery.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForSelector('[data-fm-principle-id] .tjm-fm-principle-preview strong:text-is("Created here")');

  // Folder search excludes matching principles outside this folder.
  await page.getByRole("button", { name: "Folder menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Find a Principle", exact: true }).click();
  await page.getByLabel(/Search New Folder #1/).fill("prayer");
  assert.equal(await page.getByText("No matches found.", { exact: true }).count(), 1);
  await page.goBack();

  // A failed cloud name sync retains the name in device storage and reports it.
  await page.goto(`http://127.0.0.1:${address.port}/scripts/folders-mindmap-smoke.html?namefail`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-fm-principle-id="p3"]');
  await page.locator('[data-fm-principle-id="p3"] .tjm-fm-node-menu').click();
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  await page.getByLabel("Principle name", { exact: true }).fill("Prayer under pressure");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForSelector('[data-fm-principle-id="p3"] .tjm-fm-principle-preview strong:text-is("Prayer under pressure")');
  assert.match(await page.locator("#toast-region").textContent(), /saved on this device/i);

  // Deleting a folder dissolves it and keeps its principles on the main map.
  await page.locator('[data-fm-folder-id="g1"] .tjm-fm-folder-open').click();
  await page.getByRole("button", { name: "Folder menu", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("menuitem", { name: "Delete Folder", exact: true }).click();
  await page.waitForSelector('[data-fm-principle-id="p1"]');
  assert.equal(await page.locator('[data-fm-folder-id="g1"]').count(), 0);
  const dissolveCalls = await page.evaluate(() => window.__rpcCalls.filter((call) => call.name === "dissolve_conflict_principle_group"));
  assert.equal(dissolveCalls.length, 1);

  // The same interface initializes for the chronological journey.
  await page.goto(`http://127.0.0.1:${address.port}/scripts/folders-mindmap-smoke.html?chron=1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".tjm-fm-window .react-flow", { timeout: 45_000 });
  await page.getByRole("button", { name: "Principles Map menu", exact: true }).click();
  assert.equal(await page.getByRole("menuitem", { name: "Find a Principle", exact: true }).count(), 1);

  assert.deepEqual(errors, [], `Browser errors:\n${errors.join("\n")}`);
  console.log("Folder Mind Map browser smoke test passed.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}


