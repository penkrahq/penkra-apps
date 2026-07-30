# Penkra Apps

First-party Apps developed and shipped by Penkra.

Each App is an independent web application with its own manifest, source, tests,
assets, version, and Pencil design source. Apps use the same public runtime and SDK
surface available to third-party developers.

## Repository structure

```text
apps/
  catalog/
    design/
    src/
    tests/
packages/
tooling/
```

`apps/catalog` is displayed to users as **Apps**. It is the bundled discovery and
installation experience.

The Penkra desktop host, public SDK implementation, registry service, and third-party
App source do not live in this repository.
