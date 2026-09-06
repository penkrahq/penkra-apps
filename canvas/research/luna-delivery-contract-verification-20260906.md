# Luna delivery contract verification — 2026-09-06

Evidence only. No service, runtime, manifest, operations, device, or protected files were edited.

## Commands and retained results

- Starting state: branch `codex/canvas-luna-delivery-20260906`, clean at
  `8a69944f98911ac9bc626569cee64256204fa5de`.
- Pre-fix existing command:
  `node --test src/export-delivery.test.mjs src/export-bundle.test.mjs src/export-service.test.mjs`
  — exit 0; 18 passed, 0 failed/cancelled/skipped.
- Pre-fix contract matrix after test-fixture corrections:
  `node --test src/export-delivery-contract-matrix.test.mjs` — exit 1; 6 passed, 1 failed,
  0 cancelled/skipped. The sole failure was DEL acceptance in the resolver control table.
- Source fix: `6fdbbdc` adds `\x7f` to both existing binding and derived segment predicates;
  codes and public shape are unchanged.
- Final acceptance command:
  `node --test src/export-delivery.test.mjs src/export-delivery-contract-matrix.test.mjs src/export-bundle.test.mjs src/export-service.test.mjs src/export-publication-matrix.test.mjs`
  — exit 0; 34 passed, 0 failed/cancelled/skipped, 5.20 seconds.
- Final log: `/tmp/canvas-luna-delivery-contract-final-20260906.log` (42 lines).
- `git diff --check` — exit 0.

## Matrix coverage

- Format and frame traversal: all four mappings (`pptx→slide`, `html→route`, `swift→ios`,
  `kotlin→android`), invalid formats, nested groups/frames in source order, and exclusion of
  mismatched roles/non-frame nodes.
- Destination table: all four formats × one bound set and three bound sets × exact-file and
  trailing-slash-directory destinations. Explicit expected paths cover spaces, NFC non-ASCII,
  `.pptx` suffixing, output-named bundle directories, one unbound exact-path retention, and
  multi-set exact-file collision.
- Binding-name validation: empty, dot, dotdot, slash, backslash, NUL, every U+0001–U+001F
  control, DEL, non-NFC combining form, case-insensitive reserved names with extensions, and
  derived `.pptx` overflow. All use `CANVAS_EXPORT_OUTPUT_NAME`.
- UTF-8 limits: 255 ASCII valid/256 ASCII invalid; 127 `é` plus `a` valid at 255 bytes/128 `é`
  invalid at 256 bytes; `.pptx` final-derived 250 ASCII plus suffix valid at 255/251 invalid at
  256; multibyte `.pptx` final-derived 125 `é` valid at 255/126 invalid above the limit.
- Collision and literal behavior: exact, case-fold, literal template-token rejection even when
  bindings exist; collisions use `CANVAS_EXPORT_COLLISION`, and templates use
  `CANVAS_EXPORT_OUTPUT_NAME`.
- Binding projection: frozen input containing nested arrays/objects, false, zero, empty string,
  and null; only `output` is removed, input remains unchanged, and unbound null/undefined cases
  return `{}`.

## Unresolved behavior divergence

The existing implementation rejects a bound directory set with missing `output`, but throws a
plain error without `CANVAS_EXPORT_OUTPUT_NAME`. The matrix verifies the required rejection without
inventing or changing a code, and this is reported to the coordinator for separate judgment. No
other divergence or unrun case was found in the assigned matrix.

No filesystem mutation beyond test temporary fixtures occurred; no native compilation or device
work ran. No device settings were changed.
