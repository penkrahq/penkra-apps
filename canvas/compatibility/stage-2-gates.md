# Stage 2 research-gate evidence

Measured 2026-09-04. These are inputs to implementation, not capability verdicts.

## Q17 — exact font bytes

The controller cannot read the visual tab's IndexedDB cache. It can obtain exact bytes from a
document-owned font asset: registering `vendor/open-pencil/fonts/Inter-Regular.ttf` through
`fontManager.registerDocumentFont`, then reading `fontManager.loadedData`, returned 342,408 bytes
with the identical SHA-256 on both sides:

`a414b48aa577ef2c62ebb135341ddeef33ee26a4f5dc9f787f93c1aab08ebb50`.

The production contract is therefore document-owned font assets. A remotely downloaded face must
be persisted into the owning document before it can be exported; the exporter does not reach into
browser IndexedDB and does not silently refetch a potentially different subset.

## Q18 — controller filesystem writes

The desktop starts App controllers with Node's permission model and
`--allow-fs-read=* --allow-fs-write=*` (`penkra/apps/desktop/src/electronAppControllerProcess.ts`).
A process launched with those exact flags wrote and reread an absolute temporary path, returning
`canvas-controller-write`. `documents.export` may therefore use `node:fs` with absolute paths.
Destination validation, collision rejection and atomic rename remain Canvas responsibilities.

## OOXML injection seam

Chosen seam: let PptxGenJS 4.0.1 generate the package, then mutate ZIP parts with fflate 0.8.3.
`src/ooxml-package.test.mjs` injects a grouped shape containing `a:gradFill` and `a:outerShdw`
into a PptxGenJS slide, asserts the original and injected XML, reopens/resaves it through
LibreOffice, and asserts the injected group and gradient remain. The test passes. The package
mutator rejects missing parts and missing insertion points rather than guessing.

## Pinned mobile fixtures

- SwiftUI: Swift tools 6.0, deployment target iOS 16, compiled by Xcode 26.2 / Swift 6.2.3 against
  the iPhone Simulator 26.2 SDK. `xcodebuild` ended with `BUILD SUCCEEDED`.
- Compose: Gradle 8.13, AGP 8.12.0, Kotlin and Compose compiler plugin 2.0.21, Compose BOM
  2025.06.01, `compileSdk` 35, `minSdk` 24, Java/Kotlin target 17. `:app:assembleDebug` ended with
  `BUILD SUCCESSFUL`.

The fixtures live under `compatibility/mobile-fixtures/` and are owned by the Canvas test suite.
Exporter tests replace only their generated source files; Canvas still emits loose source, not an
application project.
