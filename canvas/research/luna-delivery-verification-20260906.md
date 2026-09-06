# Luna delivery verification — 2026-09-06

Evidence only. The protected Canvas TODO, instructions, operations prose, design source, manifest,
and lockfile were not edited.

## Baseline and final commands

- Worktree baseline: branch `codex/canvas-luna-delivery-20260906`, HEAD
  `fc5bf629511620a45d02a77fd63162d0ec27a0e1`, clean before work.
- Initial dependency-missing baseline:
  `node --test src/export-bundle.test.mjs src/export-service.test.mjs` — exit 1; 7 bundle tests
  passed and the service test file failed to load with `ERR_MODULE_NOT_FOUND` for `pdf-lib`.
- `bun install --frozen-lockfile` in `canvas` — exit 0; 72 packages installed.
- Dependency-ready pre-fix existing suite:
  `node --test src/export-bundle.test.mjs src/export-service.test.mjs` — exit 0; 15 passed,
  0 failed/cancelled/skipped.
- Final acceptance command:
  `node --test src/export-bundle.test.mjs src/export-service.test.mjs src/export-publication-matrix.test.mjs`
  — exit 0; 24 passed, 0 failed/cancelled/skipped, 4.33 seconds.
- Final test log: `/tmp/canvas-luna-export-publication-acceptance-20260906.log` (32 lines).
- `git diff --check` — exit 0.

The pre-fix regression gap was made executable in the new matrix: DEL was accepted by the old
segment predicate, while unsafe segment and bundle collision errors did not carry the required
stable codes. Source commit `9a6d994` adds only the requested DEL rejection and bounded codes.

## Matrix coverage

- A: 47 invalid segment rows (empty, dot, dotdot, slash, backslash, NUL, every U+0001–U+001F
  control, DEL, non-NFC combining form, case-insensitive Windows reserved names with extensions,
  and 256 UTF-8 bytes) plus valid 255-byte ASCII, NFC Unicode, and spaces. No normalization or
  sanitization is asserted.
- B: regular file, directory, symlink to file, symlink to directory, and dangling symlink. Each
  rejects with `CANVAS_EXPORT_EXISTS`; bytes, targets, and directory listings remain unchanged.
- C: same destination, parent/child in both orders, existing ancestor symlink canonical alias,
  case-fold alias, and canonical NFC alias. All reject with `CANVAS_EXPORT_COLLISION` before an
  invalid-frame render path can run; no preflight paths are created.
- D: exact and case-fold duplicate bundle names, file/parent-directory conflicts in both orders,
  unsafe nested dotdot/empty/backslash segments, zero-byte publication, and valid nested bundle
  publication. Invalid names use `CANVAS_EXPORT_NAME_INVALID`; bundle collisions use
  `CANVAS_EXPORT_COLLISION`.
- E: owned-file removal, missing-file idempotence, new-inode file replacement, replacement by
  symlink, foreign child blocking owned-directory removal, directory replacement, and mixed
  receipts. Cleanup removes only identity-matching files/directories and returns exact structured
  `{path, reason}` failures; replacements and foreign entries remain.
- F: two deterministic three-output late-failure cases use prepared exports plus the existing
  exported publish boundary. A later competitor leaves earlier owned output cleaned and later
  output absent. The replacement case preserves the replacement and returns its identity-change
  cleanup failure. No sleeps or timing races are used.
- G: extraction checks ordered multi-page PDF success, PNG/SVG multi-node single-file rejection,
  and node-ID directory naming/no-overwrite. The preserved existing forty-binding regression
  inspects all 40 filenames, editable `<a:t>` content, independent binding values, and distinct
  layout positions; the service test now also asserts exactly 40 directory entries.

## Scope and limitations

Receipts are checked as `{destination, files: [{path, identity: {dev, ino}}], directories: [...]}`.
Directory bundles are tested as incrementally visible, exclusive publications; no whole-directory
atomic visibility is claimed. Cleanup uses `lstat` plus identity checks and is not a general
adversarial-filesystem atomicity guarantee under OS-level TOCTOU races. No capability table was
modified or promoted, no native compiler/device work was run, and no device settings were changed.
