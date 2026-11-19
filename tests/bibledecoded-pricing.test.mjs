import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const paths = [
  "bibledecoded/index.html",
  "es/bibledecoded/index.html",
  "scripts/bd-app.js",
  "scripts/bd-app-es.js",
  "scripts/build-bibledecoded-pages.mjs",
  "bibledecoded/assets/app.js",
];

test("Bible Decoded pricing is $37 across its sales pages, purchase buttons, and source", () => {
  for (const path of paths) {
    const source = fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\\$97\\b/, path + " still advertises $97");
    assert.match(source, /\\$37\\b/, path + " must advertise $37");
    assert.match(source, /<s>\\$227<\\/s>\\s*\\$37/, path + " must retain the $227 strikethrough");
  }
});
