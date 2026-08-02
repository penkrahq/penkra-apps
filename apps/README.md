# Apps

The bundled Penkra App for discovering, inspecting, installing, and restoring Apps.

The package slug and user-facing name are **Apps**.

Canonical App ID: `com.penkra.apps`. Stable command slug: `apps`.

Apps owns its complete web surface. It may render or omit the standard App Bar on
each page through the public UI contract. Penkra owns only the trusted panel-tab
chrome around the App.

Apps uses the ordinary public runtime for rendering and isolation. Its private surfaces are
narrow bindings to the trusted installation service and the account-authenticated registry
client; it does not receive account cookies, signed object URLs, general filesystem, process,
registry-key, or host-control authority.

Discovery combines validated registry responses with the trusted local installation snapshot.
The App presents one launcher, a state-aware search list, and one detail surface with Description,
Permissions, and Developer tabs. Description renders the complete bounded registry `README.md` as
sanitized Markdown; raw HTML and unsafe links are never trusted. Install and update use the compact
stateful action control rather than separate review or progress screens. Browser and Explorer remain
explicitly planned, unavailable stubs. Registry entries remain non-installable until package
validation and signature verification are enforced by the trusted installer; the UI does not turn
an uploaded artifact into an installable package prematurely.

The Open action uses a user-initiated Apps-only host bridge. The host derives the originating Space
and Thread from the calling renderer; the App supplies only the installed target App ID.

## Package layout

- `penkra-app.json` is the validated install manifest.
- `app.html`, `app.js`, and `styles.css` are the framework-neutral visual App.
- `operations.html` and `operations.js` publish the Apps-local installation lifecycle operations.
- `ui-model.mjs` owns pure action, permission, version, escaping, and Markdown behavior.
- `INSTRUCTIONS.md` supplies general agent-facing help; operation help is generated from the
  manifest declarations.
- `design/apps.pen` remains authoritative for the App's UI and lifecycle states.

Run the focused framework-neutral checks with:

```sh
node --test apps/ui-model.test.mjs apps/operations.test.mjs
```
