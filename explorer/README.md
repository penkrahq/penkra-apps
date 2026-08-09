# Explorer

Penkra's active first-party file browsing and preview App. Its implementation uses the ordinary
isolated App runtime and public scoped-file service.

Reserved canonical App ID: `com.penkra.explorer`.

Explorer is the canonical file-browsing, viewing, and editing App; do not create
parallel Files or Editor product identities without an explicit architecture change.

Explorer owns its complete web surface, including whether each page renders the
standard App Bar. It uses user-mediated web file and directory handles, not a private
raw filesystem API.

Host paths never enter the renderer; durable access is represented by device-local, App-scoped
opaque handles that work across the App's installed Spaces and tabs. The authoritative design is
[`design/explorer.pen`](./design/explorer.pen).

## Local verification

```sh
node --test explorer-model.test.mjs operations.test.mjs
```
