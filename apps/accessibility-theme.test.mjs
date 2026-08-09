import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [html, styles, app] = await Promise.all([
  readFile(new URL("./app.html", import.meta.url), "utf8"),
  readFile(new URL("./styles.css", import.meta.url), "utf8"),
  readFile(new URL("./app.js", import.meta.url), "utf8"),
]);

test("adapts to Penkra appearance tokens and reduced motion", () => {
  assert.match(html, /<meta name="color-scheme" content="light dark"/);
  assert.match(styles, /color-scheme:\s*light dark/);
  assert.match(styles, /var\(--penkra-color-background/);
  assert.match(styles, /var\(--penkra-color-text-primary/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("keeps navigation and stateful controls keyboard and screen-reader accessible", () => {
  assert.match(html, /<html lang="en">/);
  assert.match(styles, /:focus-visible/);
  assert.match(app, /aria-label="App navigation"/);
  assert.match(app, /aria-label="Search apps"/);
  assert.match(app, /role="tab" aria-selected=/);
  assert.match(app, /role="switch" aria-checked=/);
  assert.match(app, /role="alert"/);
  assert.match(app, /data-review-update=/);
  assert.match(app, /aria-label="Review permissions for/);
  assert.match(app, /title="Sideloaded"/);
  assert.match(app, /— Sideloaded/);
  assert.match(app, /binding\?\.onState/);
  assert.match(styles, /background:\s*var\(--apps-text\)/);
  assert.match(styles, /color:\s*var\(--apps-bg\)/);
});
