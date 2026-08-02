import assert from "node:assert/strict";
import test from "node:test";

import { appAction, compareVersions, permissionGrants, renderMarkdown } from "./ui-model.mjs";

test("selects install, update, and open actions from durable state", () => {
  const app = { id: "com.example.app", availability: "registry", latestVersion: "2.0.0" };
  assert.equal(appAction(app, null, null).kind, "install");
  assert.equal(appAction(app, { version: "1.4.0" }, null).kind, "update");
  assert.equal(appAction(app, { version: "2.0.0" }, null).kind, "open");
  assert.equal(appAction(app, null, app.id).kind, "busy");
});

test("compares stable and prerelease semantic versions", () => {
  assert.ok(compareVersions("1.10.0", "1.9.9") > 0);
  assert.ok(compareVersions("2.0.0", "2.0.0-beta.2") > 0);
  assert.equal(compareVersions("v1.2.3", "1.2.3"), 0);
});

test("required permissions stay granted while optional selections remain explicit", () => {
  const permissions = [
    { permission: "network-fetch", required: true },
    { permission: "raw-socket", required: false },
    { permission: "process-spawn", required: false },
  ];
  assert.deepEqual(permissionGrants(permissions, { "raw-socket": "granted" }, { "process-spawn": false }), {
    "network-fetch": "granted",
    "raw-socket": "granted",
    "process-spawn": "denied",
  });
});

test("renders bounded Markdown without trusting raw HTML or unsafe links", () => {
  const html = renderMarkdown("# Hello\n\n- **Safe**\n\n[Docs](https://example.com)\n\n[Bad](javascript:alert(1))\n\n<script>alert(1)</script>");
  assert.match(html, /<h1>Hello<\/h1>/);
  assert.match(html, /<strong>Safe<\/strong>/);
  assert.match(html, /href="https:\/\/example.com"/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});
