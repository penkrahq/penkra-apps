# Penkra Apps

First-party Apps developed and shipped by Penkra.

Each App is an independent web application with its own manifest, source, tests,
assets, version, and Pencil design source. Apps use the same public runtime and SDK
surface available to third-party developers.

## Repository structure

```text
apps/
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
packages/
tooling/
```

The initial first-party Apps are **Apps**, **Browser**, and **Explorer**. Each App
keeps its design source, implementation, assets, and tests inside its own folder.

The Penkra desktop host, public SDK implementation, registry service, and third-party
App source do not live in this repository.
