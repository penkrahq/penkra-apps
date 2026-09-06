# HTML batch browser acceptance — 2026-09-06

## Outcome

The exact forty-school web template and bindings produced 40 HTML bundle directories. The explicit live browser run measured all 40 real `slide.html` files at widths 800, 1200, and 1600 with height 600 and device scale factor 1: 120 unique entries, 120 passes, 0 mismatches, 0 cancelled, and 0 skipped.

The structured checks found no console/page exceptions, no failed local resource requests, no unresolved `schoolName` or `cardWidth` text, and no screenshot-name collisions. The school text and marker remained native DOM elements (`P` and `DIV`) with computed text-span font `Inter`, `24px`. All bounds and offsets were within the required 2 physical-pixel tolerance.

## Explicit live run

Command (exit 0):

```text
node scripts/luna-html-batch-browser.mjs
```

The script created the fresh, non-overwriting research run at `run-sDZNcp/`. It retained 40 bundles, 120 PNG screenshots, and `measurements.json`; the isolated Chrome profile was task-owned and removed after the run. `measurements.json` contains only evidence-root-relative bundle/screenshot paths and records 120 observations with `pass: 120` and `mismatch: 0`.

Chrome was `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, version `152.0.7977.76`; Node was `v24.19.0`. The runner used one isolated headless Chrome process and one CDP page, awaited navigation, `document.fonts.ready`, and two animation frames before each DOM read, and closed the exact page/browser sockets and exact child in `finally`. This Chrome process did not exit after the bounded SIGTERM wait, so the runner used its exact-child SIGKILL fallback and recorded `{code:null,signal:"SIGKILL"}`; no Chrome process remained. This is an observed process-lifecycle detail, not a claim of graceful signal exit.

## Committed corpus validation

The default compatibility test reads `corpus/` through `import.meta.url`; it does not launch Chrome or perform live navigations. It validates all 120 retained screenshot paths and recomputes text, tags, bounds, offsets, font metadata, status, and diagnostic checks from `measurements.json`. It then regenerates all 40 current HTML bundles in an owned temporary directory with a cleanup hook. `slide.html` and `styles.css` bytes match every retained bundle byte-for-byte; path-dependent export reports match after canonicalizing only their destination prefixes. The exact frozen template remains unchanged, and no staging siblings or unresolved placeholders appear.

Command (exit 0):

```text
node --test compatibility/luna-html-batch-browser.test.mjs
```

## Visual inspection subset

The nine retained screenshots individually inspected were exactly:

```text
corpus/screenshots/school-01-800.png
corpus/screenshots/school-01-1200.png
corpus/screenshots/school-01-1600.png
corpus/screenshots/school-20-800.png
corpus/screenshots/school-20-1200.png
corpus/screenshots/school-20-1600.png
corpus/screenshots/school-40-800.png
corpus/screenshots/school-40-1200.png
corpus/screenshots/school-40-1600.png
```

They show native browser text and the adjacent marker. DOM measurements are not glyph-fidelity proof.

## Regression command

Command (exit 0):

```text
node --test compatibility/luna-html-batch-browser.test.mjs src/export-delivery.test.mjs src/export-delivery-contract-matrix.test.mjs src/export-four-format-batch.test.mjs src/export-bundle.test.mjs src/export-service.test.mjs src/export-publication-matrix.test.mjs
```

Result: 39 passed, 0 failed, 0 cancelled, 0 skipped.

No production exporter, service, renderer, manifest, browser helper, mobile capability, host UI, device, or existing browser test was changed. No source/render defect was observed in this lane. Mobile artifact capability remains governed by the previously recorded `CANVAS_CAPABILITY_UNVERIFIED` gate and was not overridden here.
