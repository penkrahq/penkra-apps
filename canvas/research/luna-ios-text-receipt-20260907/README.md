# iOS text receipt harness source preparation

This directory contains source-only preparation for the exact-font-catalog ten-case matrix: cases 01, 02, 03, 04, 06, 07, 08, 10, 11, and 12 across iPhone Large, iPhone accessibility-extra-extra-large, and iPad Large (30 planned entries). Cases 05 and 09 remain excluded because the production mobile font catalog rejects the missing exact italic face.

The generated Swift is produced by the production `exportSwiftUI(ir, { fontCatalog })` path and retains its generated registration helper. The project resource path points at the already-retained exact catalog font bytes; this tree does not duplicate them. `font-sources.json` records their hashes and source paths.

No build, install, launch, simulator capture, or native evidence was run for this package. The prepared native command is:

`xcodebuild -project CanvasTextReceiptEvidence.xcodeproj -scheme CanvasTextReceiptEvidence -sdk iphonesimulator -configuration Debug -jobs 2`

`capture-plan.json` records the fixed epoch receipt window, exclusive attempt paths, exact READY/ROOT/font receipts, stable A/B frame requirement, and byte-preserving receipt-derived crop. `artifact-estimates.json` records the generated source and retained-font sizes; retained PNG size is zero at preparation.
