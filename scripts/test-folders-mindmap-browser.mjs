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
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const errors = [];

async function openCleanPage(viewport, suffix = "") {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`${origin}/scripts/folders-mindmap-smoke.html${suffix}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".tjm-fm-window", { timeout: 45_000 });
  return { context, page };
}

async function assertMenuItems(page, names) {
  const items = page.locator('.tjm-fm-context-menu [role="menu"] [role="menuitem"]');
  assert.equal(await items.count(), names.length);
  for (const name of names) assert.equal(await page.getByRole("menuitem", { name, exact: true }).count(), 1);
}

try {
  const desktop = await openCleanPage({ width: 1280, height: 900 });
  const page = desktop.page;
  await page.waitForSelector(".tjm-fm-window .react-flow", { timeout: 45_000 });

  const windowBox = await page.locator(".tjm-fm-window").boundingBox();
  assert.ok(windowBox && windowBox.x > 0 && windowBox.y > 0);
  assert.ok(windowBox.x + windowBox.width < 1280 && windowBox.y + windowBox.height < 900);
  assert.equal((await page.locator(".tjm-fm-title-row h2").textContent())?.trim(), "Principles Map");
  assert.equal(await page.getByRole("button", { name: "Principles", exact: true }).count(), 0);
  assert.equal(await page.getByText("Group led by", { exact: false }).count(), 0);
  await page.waitForFunction(() =>
    document.querySelector('[data-fm-folder-id="g1"] strong')?.textContent?.trim() === "New Folder #1");
  assert.equal((await page.locator('[data-fm-folder-id="g1"] strong').textContent())?.trim(), "New Folder #1");
  assert.equal(await page.locator('[data-fm-folder-id="g1"] .tjm-fm-node-menu').count(), 0);
  assert.equal(await page.locator('[data-fm-empty-folder-id] .tjm-fm-node-menu').count(), 0);
  assert.equal(await page.locator('.tjm-fm-window-actions [aria-label="Close Principles Map"]').count(), 0);

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

  // The toolbar keeps frequent actions visible; the overflow menu holds map tools.
  await page.getByRole("button", { name: "Principles Map menu", exact: true }).click();
  await assertMenuItems(page, ["Arrange Automatically", "Fit All"]);
  assert.equal((await page.locator(".tjm-fm-menu-cancel").textContent())?.trim(), "Cancel");
  assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
  await page.goBack();
  await page.waitForSelector(".tjm-fm-context-menu", { state: "detached" });
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await assertMenuItems(page, ["New Principle", "New Folder"]);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  // Search is direct and searches folder titles, names, numbers, and principle text.
  await page.getByRole("button", { name: "Search all principles and folders", exact: true }).click();
  await page.getByLabel("Search all folders and principles", { exact: true }).fill("grace");
  assert.equal(await page.getByRole("button", { name: /#12 · Principle #12/ }).count(), 1);
  await page.getByRole("button", { name: /#12 · Principle #12/ }).click();
  await page.waitForSelector('[data-fm-principle-id="p1"].is-expanded');
  assert.equal((await page.locator(".tjm-fm-title-row h2").textContent())?.trim(), "New Folder #1");

  // Principle detail and folder are separate back-navigation levels.
  await page.getByRole("button", { name: "Back to New Folder #1", exact: true }).click();
  await page.waitForSelector('[data-fm-principle-id="p1"].is-expanded', { state: "detached" });
  assert.equal((await page.locator(".tjm-fm-title-row h2").textContent())?.trim(), "New Folder #1");

  // Folder actions include discoverable rename and layout controls.
  await page.getByRole("button", { name: "Folder menu", exact: true }).click();
  await assertMenuItems(page, ["New Principle", "Find a Principle", "Rename Folder", "Arrange Automatically", "Fit All", "Delete Folder"]);
  assert.equal((await launcher.textContent())?.trim(), "Close Principles Map");
  await page.goBack();
  await page.waitForSelector(".tjm-fm-context-menu", { state: "detached" });

  // F2 remains a keyboard counterpart to the visible Rename Folder action.
  await page.locator(".tjm-fm-folder-title").press("F2");
  assert.equal(await page.getByRole("dialog", { name: "Rename folder", exact: false }).count(), 1);
  await page.getByRole("button", { name: "×", exact: true }).click();

  // Duplicate copies the source but requires a new, unused number.
  const filed = page.locator('[data-fm-principle-id="p1"]');
  await filed.locator(".tjm-fm-node-menu").click();
  await assertMenuItems(page, ["Edit", "Duplicate", "Remove from Folder", "Delete"]);
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

  // Dirty editors prompt before Back discards work.
  await page.locator('[data-fm-principle-id="p1"] .tjm-fm-node-menu').click();
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  await page.getByLabel("Principle name", { exact: true }).fill("Unsaved draft");
  await page.goBack();
  const discardDialog = page.getByRole("alertdialog", { name: "Discard your changes?", exact: true });
  assert.equal(await discardDialog.count(), 1);
  await discardDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await page.getByLabel("Principle name", { exact: true }).inputValue(), "Unsaved draft");
  await page.getByRole("button", { name: "×", exact: true }).click();
  await page.getByRole("button", { name: "Discard Changes", exact: true }).click();

  // Folder search is scoped and deletion uses an in-app confirmation plus Undo.
  await page.getByRole("button", { name: "Folder menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Find a Principle", exact: true }).click();
  await page.getByRole("dialog", { name: "Find a Principle", exact: true }).getByRole("textbox").fill("prayer");
  assert.equal(await page.getByText("No matches found.", { exact: true }).count(), 1);
  await page.goBack();
  await page.getByRole("button", { name: "Folder menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete Folder", exact: true }).click();
  const deleteDialog = page.getByRole("alertdialog", { name: "Delete New Folder #1?", exact: true });
  assert.equal(await deleteDialog.count(), 1);
  await deleteDialog.getByRole("button", { name: "Delete Folder", exact: true }).click();
  await page.waitForSelector('[data-fm-principle-id="p1"]');
  assert.equal(await page.locator('[data-fm-folder-id="g1"]').count(), 0);
  assert.equal(await page.getByRole("button", { name: "Undo", exact: true }).count(), 1);
  const dissolveCalls = await page.evaluate(() => window.__rpcCalls.filter((call) => call.name === "dissolve_conflict_principle_group"));
  assert.equal(dissolveCalls.length, 1);
  await page.waitForTimeout(950);
  assert.ok((await page.evaluate(() => window.__rpcCalls)).some((call) => call.name === "save_principle_map_layout"));
  await desktop.context.close();

  // iPhone: list default, full-screen canvas, 44px controls, and bottom action sheet.
  const mobile = await openCleanPage({ width: 390, height: 844 });
  const phone = mobile.page;
  await phone.waitForSelector("[data-fm-list-view]", { timeout: 45_000 });
  assert.equal(await phone.locator(".react-flow").count(), 0);
  const phoneWindow = await phone.locator(".tjm-fm-window").boundingBox();
  assert.ok(phoneWindow && phoneWindow.x <= 1 && phoneWindow.y <= 1);
  assert.ok(phoneWindow.width >= 388 && phoneWindow.height >= 842);
  for (const name of ["Add", "Search all principles and folders", "Principles Map menu"]) {
    const box = await phone.getByRole("button", { name, exact: true }).boundingBox();
    assert.ok(box && box.width >= 44 && box.height >= 44, `${name} should be a 44px touch target`);
  }
  assert.equal(await phone.getByText("Prayer makes room to listen", { exact: false }).count(), 1);
  await phone.getByRole("button", { name: "Principles Map menu", exact: true }).click();
  const actionSheet = await phone.locator(".tjm-fm-context-menu").boundingBox();
  assert.ok(actionSheet && actionSheet.width >= 368 && actionSheet.y + actionSheet.height >= 760);
  await phone.getByRole("button", { name: "Cancel", exact: true }).click();
  await phone.locator(".tjm-fm-folder-list-row").filter({ hasText: "New Folder #1" }).click();
  await phone.locator('[data-fm-list-principle-id="p1"] .tjm-fm-list-principle-open').click();
  assert.equal((await phone.locator(".tjm-fm-title-row h2").textContent())?.trim(), "New Folder #1");
  const phoneBack = phone.getByRole("button", { name: "Back to New Folder #1", exact: true });
  const backBox = await phoneBack.boundingBox();
  assert.ok(backBox && backBox.width >= 44 && backBox.height >= 44);
  await phoneBack.click();
  assert.equal((await phone.locator(".tjm-fm-title-row h2").textContent())?.trim(), "New Folder #1");
  await phone.getByRole("button", { name: "Back to Principles Map", exact: true }).click();
  assert.equal((await phone.locator(".tjm-fm-title-row h2").textContent())?.trim(), "Principles Map");
  await phone.getByRole("button", { name: "Map", exact: true }).click();
  await phone.waitForSelector(".react-flow");
  await mobile.context.close();

  // A failed cloud name sync retains the name in device storage and reports it.
  const nameFailure = await openCleanPage({ width: 1280, height: 900 }, "?namefail");
  const failing = nameFailure.page;
  await failing.waitForSelector('[data-fm-principle-id="p3"]');
  await failing.locator('[data-fm-principle-id="p3"] .tjm-fm-node-menu').click();
  await failing.getByRole("menuitem", { name: "Edit", exact: true }).click();
  await failing.getByLabel("Principle name", { exact: true }).fill("Prayer under pressure");
  await failing.getByRole("button", { name: "Save", exact: true }).click();
  await failing.waitForSelector('[data-fm-principle-id="p3"] .tjm-fm-principle-preview strong:text-is("Prayer under pressure")');
  assert.match(await failing.locator("#toast-region").textContent(), /saved on this device/i);
  await nameFailure.context.close();

  // The same interface initializes for the chronological journey.
  const chronological = await openCleanPage({ width: 1280, height: 900 }, "?chron=1");
  const chron = chronological.page;
  await chron.waitForSelector(".tjm-fm-window .react-flow", { timeout: 45_000 });
  await chron.getByRole("button", { name: "Search all principles and folders", exact: true }).click();
  assert.equal(await chron.getByRole("dialog", { name: "Find a Principle", exact: true }).count(), 1);
  await chronological.context.close();

  assert.deepEqual(errors, [], `Browser errors:\n${errors.join("\n")}`);
  console.log("Folder Mind Map browser smoke test passed.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
