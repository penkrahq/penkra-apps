# Explorer

Penkra's active first-party file browsing and preview App. Its implementation uses the ordinary
isolated App runtime and public scoped-file service.

Reserved canonical App ID: `com.penkra.explorer`.

Explorer is the canonical file-browsing, viewing, and editing App; do not create
parallel Files or Editor product identities without an explicit architecture change.

Explorer owns its complete web surface, including whether each page renders the
standard App Bar. It uses Penkra's public Runtime v2 file and directory handles, not a private raw
filesystem API.

Host paths never enter the renderer. A picker or explicit host handoff grants an opaque handle to
Explorer in one Space for the current desktop session; tabs in that App and Space can reuse it. The
authoritative design is [`design/explorer.pen`](./design/explorer.pen).

## Local verification

```sh
node --test explorer-files.test.mjs explorer-model.test.mjs operations.test.mjs
```
