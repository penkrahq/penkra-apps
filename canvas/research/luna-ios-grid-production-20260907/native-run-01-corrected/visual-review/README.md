# iOS grid native visual review

This review covers the retained native PNGs from `native-run-01-corrected`; no
new simulator work was performed. The six contact sheets are grouped by
device/content-size and distinguish cropped fixture images from full-screen
stability pairs:

- `iphone-large-crops.png`
- `iphone-xxl-crops.png`
- `ipad-large-crops.png`
- `iphone-large-full.png`
- `iphone-xxl-full.png`
- `ipad-large-full.png`

The cropped sheets contain all 38 measured fixture captures plus the available
control capture. The full sheets contain both retained screenshot frames for
all 39 launches, including the unstable iPhone Large control pair.

Visual findings: the retained primary captures show nonblank colored grid
children for each visible case; reversed and only-column2/row2 cases visibly
retain their distinct placement. The two stable frames for each measured case
are visually consistent. The iPhone Large control pair visibly differs and is
therefore unmeasured rather than treated as a rendering pass. No launch-only
or blank frame was promoted to measured evidence.

Structured result from `../measurements.json`: 39 entries total (36 primary,
3 control), 39 exact case/nonce readiness receipts, 38 stable hash pairs, 38
measured mismatches, 0 passes, and 1 unmeasured entry. Failure kinds in the
measured comparator results are 90 zero-solid-color samples, 27 edge
displacements, and 1 no-positive-eroded-interior sample. The comparator used
no registration and the existing two-physical-pixel edge tolerance.

The assigned iPhone and iPad were restored to their initial Shutdown state;
the observed content-size settings and restoration commands are recorded in
`../restoration.json` and `../device-state.json`.
