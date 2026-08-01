# Penkra Apps

First-party Apps developed and shipped by Penkra.

Each App is an independent web application with its own manifest, source, tests,
assets, version, and Pencil design source. Apps use the same public runtime and SDK
surface available to third-party developers.

## Repository structure

```text
apps/
  design/apps.pen
  src/
  tests/
browser/
  design/browser.pen
  src/
  tests/
explorer/
  design/explorer.pen
  src/
  tests/
themes/
  design/themes.pen
  src/
  tests/
packages/
tooling/
```

The first-party Apps are **Apps**, **Browser**, **Explorer**, and **Themes**. Each
App keeps its design source, implementation, assets, and tests inside its own
folder. Folders are added as their real artifacts are created; the tree above is
the intended repository structure, not evidence that every implementation exists.

Penkra owns trusted panel-tab chrome. Each App owns its entire web surface and may
render the standard App Bar on any page using the public specification, semantic
tokens, and optional framework adapters. The host does not insert or configure an
App Bar for an App.

The Penkra desktop host, public SDK implementation, registry service, and third-party
App source do not live in this repository.
