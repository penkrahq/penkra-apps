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

The file tree watches loaded directories, preserves both scroll axes, supports conventional tree
keyboard navigation, and uses a resizable rail. Editable text uses a bundled CodeMirror 6 surface;
Markdown preview uses bundled markdown-it with raw HTML disabled. All runtime dependencies and file
icons are local package assets, so the App does not require renderer network access. SVG files open
in a checkerboard-backed visual viewer with a Source/Preview switch and remain editable as XML.

## Local verification

```sh
npm test
```

`vendor/editor-runtime.mjs` is committed package output. When changing its pinned dependencies, run
`npm install` followed by `npm run build:vendor`, review the generated bundle and notices, and package
from a clean App directory without `node_modules`.
