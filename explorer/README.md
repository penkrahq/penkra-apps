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
approved Explorer design in Penkra Canvas is authoritative.

The file tree watches loaded directories, preserves both scroll axes, supports conventional tree
keyboard navigation, and uses a resizable rail. Editable text uses a bundled CodeMirror 6 surface;
Markdown preview uses bundled markdown-it with raw HTML disabled. All runtime dependencies and file
icons are local package assets, so the App does not require renderer network access. SVG files open
in a checkerboard-backed visual viewer with a Source/Preview switch and remain editable as XML. CSV
and TSV files are parsed with bundled Papa Parse and open as scrollable data grids with sticky
headings while retaining editable source views.
PDFs are rendered locally with bundled pdf.js and include page navigation without relying on a
browser PDF plugin or network access.

## Local verification

```sh
npm test
```

The files under `vendor/` are committed package output. When changing pinned dependencies, run
`npm install` followed by `npm run build:vendor` and review the generated bundle and notices.
`npm run build` creates the distributable `dist/` directory from an explicit file set; package that
directory rather than the development source tree.
