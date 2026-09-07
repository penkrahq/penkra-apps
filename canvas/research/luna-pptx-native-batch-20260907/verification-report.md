# Native PowerPoint batch verification — 2026-09-07

## Scope and commands

The task-owned generator used the forty `School N` binding sets (`cardWidth = 100 + N - 1`) and the deck/slide fixture from `export-four-format-batch.test.mjs`. It produced 40 PPTX files under `run-4uxvfr/pptx/`, retaining `source-fixture.json`, `source-hashes.json`, and `semantic.xml.json`.

Passing commands (exit 0):

- `node scripts/luna-pptx-native-batch-generate.mjs` — 40 PPTX artifacts, 40 distinct marker positions.
- `node --test compatibility/luna-pptx-native-batch.test.mjs` — 4 passed, 0 failed/cancelled/skipped.
- `node --test src/export-four-format-batch.test.mjs compatibility/luna-pptx-native-batch.test.mjs` — 8 passed, 0 failed/cancelled/skipped.
- `git diff --check` — exit 0.

The default compatibility test launches no PowerPoint and regenerates a task-owned temporary PPTX corpus, comparing semantic XML rather than ZIP bytes (OOXML container bytes are not deterministic). Malformed, missing-entry, and displaced-marker checks are retained as explicit negative cases.

## PPTX and PowerPoint UI

- 40/40 PPTX hashes and paths are retained in `source-hashes.json`.
- 40/40 PPTX semantic records contain editable `School N` text, a marker shape, no `<p:pic>` fallback, and distinct marker x positions.
- 40/40 actual PowerPoint-window screenshots are retained. The final portable set is `ui-final/school-01.jpg` through `school-05.jpg` plus `ui/school-06.jpg` through `ui/school-40.jpg`; `ui-final/contact-sheet.jpg` was visually inspected and shows School 1–40, marker, and no repair/font-warning dialog in the final captures.
- PowerPoint AX receipts are retained for 9 files (1–5 and 37–40); this count is computed from the manifest. The 31 middle-file state reads were observed during bounded native UI runs but their per-file receipt write was lost when the earlier node_repl loop timed out; they remain explicitly marked in `native-manifest.json` as bulk-observed without retained AX receipt. Their final captures were visually inspected.
- `ui/contact-sheet.jpg` and the first generator failure are retained as failed-attempt evidence; the early bulk sequence briefly captured the Open dialog/duplicate School 4. They are not used by the final manifest.

## Native PDF result

PowerPoint’s Export menu was disabled by its visible “Activate Microsoft 365 to Create and Edit” banner. The native UI Print → PDF → Save as PDF route was used for Schools 1, 20, and 40 into unique task-owned paths. `pdfinfo`, `pdffonts`, `pdftotext`, and 80-DPI `pdftoppm` records are retained.

All three required PDF rows are mismatches, not passes:

| School | PDF page | Render | Extracted text/font | Marker bounds observed | Required marker |
| --- | --- | --- | --- | --- | --- |
| 1 | 792×612 pt | 880×680 | `School 1`, embedded Inter | x=153,y=117,w=20,h=19 | x=110,y=0,w=20,h=20 |
| 20 | 792×612 pt | 880×680 | `School 20`, embedded Inter | x=172,y=117,w=20,h=19 | x=129,y=0,w=20,h=20 |
| 40 | 792×612 pt | 880×680 | `School 40`, embedded Inter | x=192,y=117,w=20,h=19 | x=149,y=0,w=20,h=20 |

The three rendered PDF pages were visually inspected in `rendered/letter-pdf-contact-sheet.png`. A task-owned custom 10×5.625-inch paper size and landscape orientation were also tried through the PowerPoint UI; the resulting PDF context remained Letter. An intermediate portrait attempt (`School 1-slide-size.pdf`) was 404.64×720 pt. No crop, rescale, activation, subscription, or bypass was used. These PDFs remain failed-attempt evidence and are not normalized into passes.

## Cleanup and settings

Only exact task-owned PowerPoint windows were targeted. School 1 and School 40 close actions completed; School 20 close was attempted, but subsequent AX/screenshot calls repeatedly timed out. No unrelated presentation or PowerPoint process was closed. At handoff, 37 task-owned lock files remained in the corpus area; they were not unlinked. The native UI became unavailable before custom paper removal could be verified, so custom print-size restoration and remaining window cleanup are **unverified/incomplete** and require coordinator follow-up through the same exact-window UI ownership rules.

No compiler, device, live Canvas document, host release, or capability-table change was made.
