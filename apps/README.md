# Apps

The required Penkra-published App for discovering, inspecting, installing, and restoring Apps.

The package slug and user-facing name are **Apps**.

Canonical App ID: `com.penkra.apps`. Stable command slug: `apps`.

Apps owns its complete web surface. It may render or omit the standard App Bar on
each page through the public UI contract. Penkra owns only the trusted panel-tab
chrome around the App.

Apps uses the ordinary public UI and Node-controller runtimes. Its Apps-specific surface is a
narrow binding to the trusted installation service and account-authenticated registry client; it
does not receive account cookies, signed object URLs, registry signing keys, or general host-control
authority.

Discovery combines validated registry responses with the trusted local installation snapshot.
The App presents one launcher, a state-aware search list, and one detail surface with Description,
Permissions, and Developer tabs. Description renders the complete bounded registry `README.md` as
sanitized Markdown; raw HTML and unsafe links are never trusted. Install and update use the compact
stateful action control rather than separate review or progress screens. Apps, Explorer, Browser,
and Canvas are active independently versioned first-party Apps. A registry release becomes
installable only after the trusted installer verifies its package, signatures, compatibility, and
current security policy.

The Open action uses a user-initiated Apps-only host bridge. The host derives the originating Space
and Thread from the calling renderer; the App supplies only the installed target App ID.

Launcher tiles expose a platform-native right-click menu. Uninstall removes the App from the
current Space while retaining its App data, so a later reinstall can restore that state. Apps does
not offer self-uninstall, and Space bootstrap installs it through the same verified registry
path as every other registry App. Optional default Apps preserve the user's uninstall choice
instead of reinstalling them on the next launch.

## Package layout

- `penkra-app.json` is the validated install manifest.
- `app.html`, `app.js`, and `styles.css` are the framework-neutral visual App.
- `operations.js` is the Node controller that publishes Apps-local installation lifecycle
  operations.
- `ui-model.mjs` owns pure action, permission, version, escaping, and Markdown behavior.
- `INSTRUCTIONS.md` supplies general agent-facing help; operation help is generated from the
  manifest declarations.
- `design/apps.pen` remains authoritative for the App's UI and lifecycle states.

Run the focused framework-neutral checks with:

```sh
node --test apps/ui-model.test.mjs apps/operations.test.mjs
```
