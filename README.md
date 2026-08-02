# Penkra Apps

First-party Apps developed and shipped by Penkra.

Each App is an independent web application with its own manifest, source, tests,
assets, version, and Pencil design source. Apps use the same public runtime and SDK
surface available to third-party developers.

## Repository structure

```text
apps/
  design/apps.pen
  app.html
  app.js
  operations.html
  operations.js
  penkra-app.json
browser/
  design/browser.pen
explorer/
  design/explorer.pen
```

**Apps** is the active first-party App in the current implementation pass.
**Browser** and **Explorer** retain named design/documentation stubs for deferred
implementation and are not shipped merely because their folders exist. Themes are
core Penkra Settings presets, not an App. Each App keeps its design source,
implementation, assets, and tests inside its own folder as those artifacts become real.

Penkra owns trusted panel-tab chrome. Each App owns its entire web surface and may
render the standard App Bar on any page using the public specification, semantic
tokens, and optional framework adapters. The host does not insert or configure an
App Bar for an App.

The Penkra desktop host, public SDK implementation, registry service, and third-party
App source do not live in this repository.
