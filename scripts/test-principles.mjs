import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../lib/principles.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../lib/principles.css", import.meta.url), "utf8");
const storage = new Map();
const context = vm.createContext({
  console,
  crypto,
  setTimeout,
  FormData: class {
    constructor(form) { this.form = form; }
    get(name) { return this.form.values?.[name] ?? null; }
  },
  window: {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    setTimeout,
  },
  document: {
    getElementById: () => null,
    querySelector: () => null,
  },
});
vm.runInContext(source, context);

let principles = [
  { id: "p40", reading_id: "r4", principle_number: 40, body: "Fourth principle", group_id: "g1", cross_reference_numbers: [1] },
  { id: "p20", reading_id: "r2", principle_number: 20, body: "Second principle", group_id: null, cross_reference_numbers: [] },
  { id: "p1", reading_id: "r1", principle_number: 1, body: "First line of principle one\nMore detail", group_id: "g1", cross_reference_numbers: [] },
  { id: "p30", reading_id: "r3", principle_number: 30, body: "Third principle", group_id: null, cross_reference_numbers: [] },
];
const rpcCalls = [];
const toasts = [];
const controller = context.window.TJMPrinciples.createController({
  planId: "bible-conflict-ages-v1",
  exportFilename: "test",
  getDb: () => ({ rpc: async (name, args) => {
    rpcCalls.push({ name, args });
    return { data: [{ id: "p50", reading_id: "r1", principle_number: 50, body: args.p_body, group_id: null, cross_reference_numbers: args.p_cross_reference_numbers }], error: null };
  } }),
  getSession: () => ({ user: { id: "user-1" } }),
  getPrinciples: () => principles,
  setPrinciples: (value) => { principles = value; },
  getReadings: () => [1, 2, 3, 4].map((number) => ({ id: `r${number}`, title: `Reading ${number}` })),
  escapeHTML: (value = "") => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"),
  toast: (message, type = "") => toasts.push({ message, type }),
  setSync: () => {},
  showSignIn: () => {},
  rerender: () => {},
  showPrinciples: () => {},
  goToReadingById: () => {},
  readingLabel: (reading) => reading.title,
});

let html = controller.renderTab();
assert.equal((html.match(/data-principle-group-window=/g) || []).length, 3, "Two grouped and two single principles should render as three windows");
assert.equal((html.match(/class="principle-circle"/g) || []).length, 4);
assert.match(html, /GROUP · LED BY PRINCIPLE #1/);
assert.match(html, /First line of principle one/);
assert.match(html, /aria-label="Principles 1, 40"/);
assert.ok(html.indexOf('data-principle-group-window="group:g1"') < html.indexOf('data-principle-group-window="single:p20"'), "The group led by #1 must be first");
assert.match(html, /Open Principles tools/);
assert.doesNotMatch(html, /Download spreadsheet/);

controller.handleClick({ dataset: {}, hasAttribute: (name) => name === "data-principles-toolbar" });
html = controller.renderTab();
assert.match(html, /Any word, phrase, or number/);
assert.match(html, /Download spreadsheet/);
assert.match(html, /Upload spreadsheet/);
assert.match(html, /principle numbers in column 1/i);

controller.handleClick({ dataset: { principleGroup: "group:g1" }, hasAttribute: () => false });
html = controller.renderTab();
assert.equal((html.match(/class="principle-detail-card"/g) || []).length, 2);
assert.match(html, /More detail/);
assert.match(styles, /\.principle-detail-card[^}]+background: #eadbe8/s);
assert.match(styles, /\.principle-circles[^}]+flex-wrap: wrap/s);

controller.handleClick({ dataset: { principleMenu: "p1" }, hasAttribute: () => false });
html = controller.renderTab();
for (const action of ["Edit", "Go to reading", "Move"]) assert.match(html, new RegExp(`>${action}<`));

controller.handleSubmit({ matches: (selector) => selector === ".principle-search-form", values: { "principle-search": "principle" } });
html = controller.renderTab();
assert.match(html, /1 of 4 matches/);
assert.match(html, /principle-detail-card is-search-match/);
controller.handleClick({ dataset: {}, hasAttribute: (name) => name === "data-principle-search-next" });
html = controller.renderTab();
assert.match(html, /2 of 4 matches/);

function creationForm(number, body, crossReferences = "") {
  const fields = {
    '[name="principle-number"]': { value: String(number) },
    "#principle-body": { value: body },
    "#cross-references": { value: crossReferences },
  };
  return { querySelector: (selector) => fields[selector] };
}

await controller.createFromForm(creationForm(20, "Duplicate"), "r1");
assert.equal(rpcCalls.length, 0);
assert.match(toasts.at(-1).message, /already in use/);

await controller.createFromForm(creationForm(50, "A newly numbered principle", "1"), "r1");
assert.equal(rpcCalls.length, 1);
assert.equal(rpcCalls[0].name, "create_conflict_principle");
assert.equal(rpcCalls[0].args.p_principle_number, 50);
assert.equal(Array.from(rpcCalls[0].args.p_cross_reference_numbers).join(","), "1");

console.log("Principle manager validated: grouping, remembered open windows, three-option menus, editable unique numbers, and numbered creation.");
