# Vendor unit failure review — 2026-09-06

This is a read-only review of the Open Pencil vendor unit failures. It is not a
renderer-quality gate, PDF/X certification, or a request to repair unrelated
vendor tests.

## Comparison

| version | source state | command result | counts |
| --- | --- | --- | --- |
| baseline | isolated archive at `/tmp/luna-vendor-baseline-review-DlNmAm`, pre-fix commit `c98b49cea91b13d8ec266f394abfd50212e0d40c` | `bun install --frozen-lockfile` exit 0; `bun run build:packages` exit 0; `bun run test:unit` exit 1 | 2,355 pass, 1 skip, 100 fail, 2 errors; 2,456 tests / 398 files |
| current | worktree vendor source after renderer fix (`010deb8f8ffd9eb115e4e0c245ab9fbaad1b0447`); report/test worktree HEAD `7ae81cc5a071022b9b99c14c0423054d28a6ede6` | `bun run test:unit` exit 1 | 2,355 pass, 1 skip, 100 fail, 2 errors; 2,456 tests / 398 files |

The final failure-name sets are identical: current-only `0`, baseline-only
`0`, intersection `97` unique normalized names after timing suffixes and
duplicate unnamed labels are normalized. Bun's final aggregate is authoritative
because it also counts hook/unhandled outcomes that are not all represented by
unique names in the summary block. No failure group appeared only after the
renderer change.

Environment: Bun `1.4.0`, Node `v24.19.0`, macOS Darwin 25.3.0 arm64. The
coordinator's independent Bun `1.3.10 --frozen-lockfile` setup result remains
consistent with this review; no dependency or lockfile was changed here.

The first baseline run before package compilation is retained at
`/tmp/luna-vendor-baseline-review-DlNmAm/baseline-unit.log` but is not used for
regression conclusions: it had 2,105 pass, 1 skip, 110 fail, and 31 errors
because workspace package builds were absent. The comparable rebuilt run is
`baseline-unit-built.log`.

## Root-cause groups

The following groups were derived from the identical current and baseline
diagnostics. Counts are named failed tests unless explicitly marked as an
error; the Bun summary above is the authoritative aggregate.

| group | observed count | representative diagnostic | conclusion / environment requirement |
| --- | ---: | --- | --- |
| Invalid or placeholder `.fig` fixtures and dependent archive roundtrips | 68 failed tests, plus 1 unnamed cache-test failure | `fflate/esm/index.mjs:2675: error: invalid zip data`, from `packages/fig/src/archive.ts:49` | Fixture/archive input is not a valid ZIP. CLI eval, overlap analysis, import, roundtrip, metadata, and cache tests consequently fail before exercising the renderer. Requires the repository's valid `.fig` fixture payloads. |
| Hit-test expectations | 10 failed tests | Expected generated node IDs such as `0:1131`, received adjacent IDs such as `0:1130`; empty-frame cases received the frame instead of `null` | Reproduces identically on baseline and current. This is a scene-graph hit-test behavior/fixture issue, not the open-path stroke branch. |
| Direct renderer test mocks omit initialized state or CanvasKit methods | 9 failed tests | `r.subtreeCullBounds.get` on undefined; `r.pencilShaderImages.values` on undefined; `r.strokePaint.setShader is not a function` | These tests instantiate partial renderer doubles instead of the complete `SkiaRenderer` state. Requires the test harness's expected initialized maps/CanvasKit paint methods. |
| Headless font fallback | 2 failed tests | CJK expected `>500` dark pixels but received `0`; Arabic expected `>450` but received `0`; provider retries `https://fonts.google.com/metadata/fonts` | Requires bundled/available fallback font data or a configured provider. No renderer-source delta: both versions fail identically. |
| Tauri/MCP auth calls in a non-Tauri process | 7 failed tests | `ReferenceError: window is not defined` in `@tauri-apps/api/core.js`, via `src/app/tauri/http.ts:83` | Requires a Tauri desktop `window.__TAURI_INTERNALS__` environment or a test stub. |
| MCP startup/provider environment | 1 named failure plus unhandled startup diagnostics | `Browser registration not confirmed within 5000ms`; provider fetches to Google Fonts and Fontsource report `window is not defined`; one run also reported `EADDRINUSE` on port `63747` | Requires the MCP browser registration path, provider/network setup, and an unused test port. This group is external/runtime setup, not renderer behavior. |
| SVG stroke-opacity assertion | 1 failed test | Expected `stroke-opacity="0.5"`; received SVG using `stroke="#FF000080"` | Existing serializer representation mismatch, identical in both versions. |
| Flex text measurement constraint | 1 failed test | Expected measured width `>0`, received `0` | Requires the layout measurement setup used by that test; identical baseline/current. |

Two unhandled diagnostics are also present in both runs: the headless `pen`
test imports a non-exported `parsePenFile` from `packages/core/src/index.ts`,
and MCP startup reports the browser-registration timeout. They are retained as
errors, not converted into passes or attributed to the renderer change.

Representative raw logs retained at the owned temporary path:

- `/tmp/luna-vendor-baseline-review-DlNmAm/current-unit.log`
- `/tmp/luna-vendor-baseline-review-DlNmAm/baseline-unit-built.log`
- `/tmp/luna-vendor-baseline-review-DlNmAm/current-geometry.log`
- `/tmp/luna-vendor-baseline-review-DlNmAm/baseline-geometry.log`
- `/tmp/luna-vendor-baseline-review-DlNmAm/current-join-geometry.log`
- `/tmp/luna-vendor-baseline-review-DlNmAm/baseline-join-geometry.log`

## Focused join/geometry checks

The shared source-level path-join subset was run against both versions:

```text
bun test tests/engine/io/svg/export/paths.test.ts \
  tests/engine/io/svg/path-parse.test.ts \
  tests/engine/scene-graph/vector-network.test.ts
```

Both exit `0`: `28 pass`, `0 fail`, `68 expect() calls`, `28 tests`.

The broader geometry subset was also identical on both versions:

```text
bun test tests/engine/scene-graph/vector-network.test.ts \
  tests/engine/scene-graph/individual-strokes.test.ts \
  tests/engine/pen/polygon.test.ts \
  tests/engine/io/fig/export/stroke-geometry.test.ts \
  tests/engine/render/canvas/cache.test.ts
```

Both exit `1` with `23 pass`, `1 fail`, `61 expect() calls`, `24 tests`. The
single failure is `render/canvas/cache.test.ts` reading the same invalid ZIP
fixture (`invalid zip data`); it is present in both versions.

## Scope and handoff

No production source, generated engine bundle, capability table, profile gate,
protected prose, device, or external service was changed. The separate test
claim correction is commit `7ae81cc5a071022b9b99c14c0423054d28a6ede6`; it
reports 6 focused join tests passing, including true same-graph/same-renderer
cache reuse. This report is evidence only and does not promote any vendor
quality verdict or make a PDF/X claim.
