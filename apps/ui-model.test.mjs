import assert from "node:assert/strict";
import test from "node:test";

import {
  appAction,
  appIconSource,
  clearRegistryCaches,
  compareVersions,
  launcherApps,
  launcherContextMenuItems,
  launcherPermissionReview,
  isSideloadedApp,
  permissionGrants,
  registryVersionForApp,
  renderMarkdown,
  shouldShowOffline,
} from "./ui-model.mjs";

test("registry refresh invalidates cached release metadata and artifacts", () => {
  const registryDetails = new Map([["com.penkra.canvas", { latestVersion: "0.1.0" }]]);
  const readmes = new Map([["com.penkra.canvas", "old README"]]);
  const iconUrls = new Map([["com.penkra.canvas", "data:image/svg+xml,old"]]);

  clearRegistryCaches({ registryDetails, readmes, iconUrls });

  assert.equal(registryDetails.size, 0);
  assert.equal(readmes.size, 0);
  assert.equal(iconUrls.size, 0);
});

test("prefers the verified installed-package icon and falls back to registry artwork", () => {
  assert.equal(
    appIconSource({ installed: { iconDataUrl: "data:image/svg+xml,installed" } }, "https://registry/icon.svg"),
    "data:image/svg+xml,installed",
  );
  assert.equal(
    appIconSource({ installed: { iconDataUrl: null } }, "https://registry/icon.svg"),
    "https://registry/icon.svg",
  );
});

test("selects install, update, and open actions from durable state", () => {
  const app = { id: "com.example.app", availability: "registry", latestVersion: "2.0.0" };
  assert.equal(appAction(app, null, null).kind, "install");
  assert.equal(appAction(app, { version: "1.4.0" }, null).kind, "update");
  assert.equal(appAction(app, { version: "2.0.0" }, null).kind, "open");
  assert.deepEqual(appAction(app, { version: "2.0.0" }, null, null, false), {
    kind: "enable",
    label: "Install",
    disabled: false,
  });
  assert.equal(appAction(app, null, app.id).kind, "busy");
  assert.equal(appAction(app, null, app.id, "open").label, "Opening…");
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

test("offline startup keeps installed Apps available and shows the empty offline state only without local Apps", () => {
  assert.equal(shouldShowOffline(new Error("offline"), 0, 0), true);
  assert.equal(shouldShowOffline(new Error("offline"), 0, 2), false);
  assert.equal(shouldShowOffline(new Error("offline"), 3, 0), false);
  assert.equal(shouldShowOffline(null, 0, 0), false);
});

test("launcher contains only Apps installed and enabled in the current Space", () => {
  const installedEnabled = {
    id: "com.example.ready",
    installed: { version: "1.0.0" },
    enabled: true,
  };
  const installedDisabled = {
    id: "com.example.disabled",
    installed: { version: "1.0.0" },
    enabled: false,
  };
  const registryOnly = { id: "com.example.registry", installed: null, enabled: false };

  assert.deepEqual(launcherApps([installedEnabled, installedDisabled, registryOnly]), [
    installedEnabled,
  ]);
});

test("launcher derives sideload status only from the trusted installed package source", () => {
  assert.equal(isSideloadedApp({ installed: { source: "sideload" } }), true);
  assert.equal(isSideloadedApp({ installed: { source: "registry" } }), false);
  assert.equal(isSideloadedApp({ source: "sideload", installed: null }), false);
});

test("launcher context menus uninstall installed Apps but never Apps itself", () => {
  assert.deepEqual(
    launcherContextMenuItems({ id: "com.penkra.explorer", installed: { version: "1.0.0" } }),
    [{ id: "uninstall", label: "Uninstall", destructive: true }],
  );
  assert.deepEqual(
    launcherContextMenuItems({ id: "com.penkra.apps", installed: { version: "1.0.0" } }),
    [],
  );
  assert.deepEqual(launcherContextMenuItems({ id: "com.penkra.browser", installed: null }), []);
});

test("launcher permission review follows the trusted compatible-update snapshot", () => {
  const app = {
    id: "com.example.canvas",
    installed: { version: "1.0.0" },
    enabled: true,
  };
  const update = {
    appId: app.id,
    installedVersion: "1.0.0",
    availableVersion: "1.2.0",
    permissions: ["network-fetch"],
  };
  assert.deepEqual(launcherPermissionReview(app, [update]), update);
  assert.equal(launcherPermissionReview({ ...app, enabled: false }, [update]), null);
  assert.equal(
    launcherPermissionReview({ ...app, installed: { version: "1.2.0" } }, [update]),
    null,
  );
  assert.equal(launcherPermissionReview(app, []), null);
});

test("permission review selects the exact compatible version chosen by the host", () => {
  const app = {
    id: "com.example.canvas",
    installed: { version: "1.0.0" },
    enabled: true,
  };
  const detail = {
    versions: [
      { version: "2.0.0", compatibilityRange: ">=9.0.0" },
      { version: "1.2.0", compatibilityRange: ">=0.8.0" },
    ],
  };
  assert.equal(
    registryVersionForApp(app, detail, [{
      appId: app.id,
      installedVersion: "1.0.0",
      availableVersion: "1.2.0",
      permissions: ["network-fetch"],
    }]).version,
    "1.2.0",
  );
});
