# iOS exact-catalog text metrics

This evidence analyzes the committed exact-font-catalog reference/native pairs without translation, scale registration, or tolerance changes.

- `pixel-measurements.json` retains CanvasKit-decoded hashes, physical/point dimensions, complete row histograms, consecutive ink bands, bounds, and pair deltas for all 30 pairs.
- `runtime-summary.json` and `runtime/` retain actual UIFont/CTFont JSON from the registered catalog-font fixture at iPhone Large, iPhone accessibility-extra-extra-large, and iPad Large.
- `document-text-measurements.json` retains every `measureDocumentText` layout and font hash for the twelve-text fixture nodes.
- `comparison-report.json` separates confirmed pixel/API/CanvasKit facts from unproven SwiftUI causal inference.
- The temporary runtime fixture uses the emitted CanvasFonts registration helper and hash-named Fonts resources; no UIAppFonts bypass was used.

This is diagnosis evidence only. No emitter, font, engine, IR, capability table, existing script, or Android file was changed.
