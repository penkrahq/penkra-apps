# Explorer

Penkra's active first-party file browsing and preview App. Its implementation uses the ordinary
isolated App runtime and its Space-scoped Node controller.

Reserved canonical App ID: `com.penkra.explorer`.

Explorer is the canonical file-browsing, viewing, and editing App; do not create
parallel Files or Editor product identities without an explicit architecture change.

Explorer owns its complete web surface, including whether each page renders the
standard App Bar. File and folder picks expose their canonical absolute paths. The tab calls its
Node controller for reads, writes and directory changes; each entry is resolved inside its current
root. Explorer restores chosen directories by path from the session's picker list.
The approved Explorer design in Penkra Canvas is authoritative.

The file tree keeps one controller subscription for each loaded directory; changes refresh the tree,
and tab closure or unwatch stops the native watcher. An ended watch stays stopped without retries.
The file tree watches loaded directories, preserves both scroll axes, supports conventional tree
keyboard navigation, and uses a resizable rail. Editable text uses a bundled CodeMirror 6 surface;
Markdown preview uses bundled markdown-it with raw HTML disabled. All runtime dependencies and file
icons are local package assets, so the App does not require renderer network access. SVG files open
in a checkerboard-backed visual viewer with a Source/Preview switch and remain editable as XML. CSV
and TSV files are parsed with bundled Papa Parse and open as scrollable data grids with sticky
headings while retaining editable source views.
PDFs are rendered locally with bundled pdf.js and include page navigation without relying on a
browser PDF plugin or network access.
MP4, M4V, WebM, MOV, and OGV videos use Chromium's local video player with playback, seeking,
volume, and fullscreen controls. Playback depends on the container's codecs; unsupported media
shows an explicit fallback message. Videos currently share the 64 MiB local preview limit.

## Local verification

```sh
npm test
# Run the browser fixtures during the final browser pass:
PENKRA_DESKTOP_REPO_ROOT=/absolute/path/to/penkra npm run test:browser
```

The files under `vendor/` are committed package output. When changing pinned dependencies, run
`npm install` followed by `npm run build:vendor` and review the generated bundle and notices.
`npm run build` creates the distributable `dist/` directory from an explicit file set; package that
directory rather than the development source tree.
