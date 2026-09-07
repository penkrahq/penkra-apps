# Serialized Identity-H font matrix correction evidence

Date: 2026-09-07

This correction evidence addresses review of commits `103de074` and `d1b8f41`. It is verification of serialized Identity-H TrueType inspection behavior only; it is not PDF/X certification or a profile-gate promotion.

## Scope and execution

- 39 explicitly named case definitions, each serialized in both `classic-xref` and `object-streams` variants: 78 case identities.
- The repeat-distinct-documents state-isolation case is present in both the case-results file and the manifest. Its nested valid/invalid/valid-again observations are retained under each of its two identities.
- The gated generator command was:

  ```text
  cd /Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/luna-pdf/canvas
  LUNA_PDFX_FONT_MATRIX_RETAIN_EVIDENCE=1 node --test src/exporters/luna-pdfx-font-matrix.test.mjs
  ```

  Exit 0; 80 passed, 0 failed, 0 cancelled, 0 skipped. This mode generated 78 in-memory result identities and retained 8 representative PDF files.

- The default read-only command was:

  ```text
  cd /Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/luna-pdf/canvas
  node --test src/exporters/luna-pdfx-font-matrix.test.mjs
  ```

  Exit 0; 81 passed, 0 failed, 0 cancelled, 0 skipped. It verified retained file hashes, byte lengths, reload/inspection results, case counts, and an unchanged directory snapshot. It did not create or write evidence files.

The retained artifact manifest is `sha256-manifest.json`. Its distinction is explicit:

- `generatedCases`: 78 serialized identities generated and tested in memory; these are not all retained as files.
- `retainedArtifacts`: 8 actual PDFs present in this directory, with SHA-256 and byte-length checks.

`case-results.json` contains 78 ordered primary result records. The historical evidence and manifest in the parent directory remain unchanged; this correction directory records the regenerated hashes separately.

## Corrected font-state cases

`two-font-switches` and `q-q-restores-prior-font` use distinct embedded Inter Regular and Inter Bold resources, distinct PDF resource names, and distinct embedded-program hashes. Both positive variants report `checkedFonts: 2` and `checkedGlyphs: 2`.

The positive q/Q fixture selects the regular font, enters `q`, selects the bold font inside a text block, exits the text block and graphics state with `Q`, then shows a regular-font glyph without selecting the regular font again. The negative fixture replaces the saved regular selection with `/Missing`; both serialization variants report the observable ordered diagnostics `FONT_ENCODING_OUTSIDE_SUBSET`, `TEXT_FONT_UNRESOLVED` rather than falsely passing.

The distinct-document repetition checks valid → invalid-width → valid-again for each serialization variant and confirms that the valid result remains issue-free after the invalid document.

## Representative retained artifact inventory

Eight actual PDFs are retained: baseline Identity-H (two serializers), missing FontFile2 (two), wrong DW (two), and odd TJ code bytes (two). The full 78-case matrix remains generated in memory by default; only the explicitly listed representatives are persisted.

The test captures serialized input hashes before inspection and asserts the bytes are unchanged afterward. No production source, PDF emitter, profile gate, capability table, protected documentation, or lockfile was changed.

The PDF skill artifact-operation marker command was unavailable in this environment (`MODULE_NOT_FOUND`); no substitute marker was invented. No devices or native builds were used.
