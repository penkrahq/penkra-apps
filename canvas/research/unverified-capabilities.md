# Canvas capability verification status

Generated from `src/capability-tables.mjs` after the 2026-09-09 exporter completion work.

Total build-blocking unverified entries: **0**.

| Format | Native | Raster | Ignore | Unverified |
| --- | ---: | ---: | ---: | ---: |
| PPTX | 115 | 12 | 16 | 0 |
| HTML | 127 | 3 | 13 | 0 |
| Swift | 79 | 49 | 15 | 0 |
| Kotlin | 79 | 49 | 15 | 0 |
| SVG extraction | 128 | 5 | 10 | 0 |

The remaining `raster` entries are closed verdicts, not unfinished verification. Each names a
concrete target-representation limit or a measured fidelity mismatch. In particular, SwiftUI and
Compose text remains rasterized because retained native-device measurements found persistent
CanvasKit-versus-platform shaping, baseline, and ink differences. The author can also force a
normally native node to pixels with `export: "image"`; there is no override from raster to native.

PDF is a roleless extraction format and therefore has no role capability table. Its node primitives
default to native emission, with only value-specific/static-medium lowerings applied by the
extraction pipeline. PDF/X-4 is a flag on PDF extraction, not a module or role. The profile gate runs
the closed Canvas-writer-subset preflight and rejects the artifact before publication if any required
profile condition fails.
