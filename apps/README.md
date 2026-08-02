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
Browser and Explorer remain explicitly planned, unavailable stubs. Registry entries remain
non-installable until package validation and signature verification are enforced by the trusted
installer; the UI does not turn an uploaded artifact into an installable package prematurely.

## Package layout

- `penkra-app.json` is the validated install manifest.
- `app.html`, `app.js`, and `styles.css` are the framework-neutral visual App.
- `INSTRUCTIONS.md` supplies general agent-facing help; operation help is generated from the
  manifest declarations.
- `design/apps.pen` remains authoritative for the App's UI and lifecycle states.
