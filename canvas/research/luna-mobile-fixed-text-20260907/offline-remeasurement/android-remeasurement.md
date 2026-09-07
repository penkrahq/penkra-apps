# Fixed-text Android offline remeasurement

All 44 rows were remeasured from native-android-run-02 without new captures or a build.

Comparator: authored solid-color interiors after eroding connected glyph/foreground boundaries by 2 physical pixels; channel tolerance 2; no registration shift. Rows with zero surviving interior samples are unmeasured.

- Overall: 0 pass, 43 fail, 1 unmeasured (44 total).

| State | Pass | Fail | Unmeasured |
| --- | ---: | ---: | ---: |
| density-420-font-1 | 0 | 11 | 0 |
| density-420-font-2 | 0 | 11 | 0 |
| density-320-font-1 | 0 | 11 | 0 |
| density-320-font-2 | 0 | 10 | 1 |

## Row conclusions

| Identity | Status | Compared | Mismatched |
| --- | --- | ---: | ---: |
| density-320-font-1/marks-and-paragraphs | fail | 1405 | 675 |
| density-320-font-1/rich-run-decorations | fail | 528 | 424 |
| density-320-font-1/rich-run-fill-family | fail | 401 | 334 |
| density-320-font-1/rich-run-italic-spacing | fail | 165 | 107 |
| density-320-font-1/rich-run-size | fail | 2207 | 1205 |
| density-320-font-1/text-growth-auto | fail | 401 | 301 |
| density-320-font-1/text-growth-fixed-width | fail | 1127 | 835 |
| density-320-font-1/text-growth-fixed-width-height | fail | 682 | 469 |
| density-320-font-1/top-level-decorations | fail | 621 | 510 |
| density-320-font-1/top-level-style-spacing | fail | 331 | 234 |
| density-320-font-1/uniform-single-run | fail | 383 | 267 |
| density-320-font-2/marks-and-paragraphs | fail | 1405 | 732 |
| density-320-font-2/rich-run-decorations | unmeasured | — | — |
| density-320-font-2/rich-run-fill-family | fail | 401 | 332 |
| density-320-font-2/rich-run-italic-spacing | fail | 165 | 108 |
| density-320-font-2/rich-run-size | fail | 2207 | 1385 |
| density-320-font-2/text-growth-auto | fail | 401 | 317 |
| density-320-font-2/text-growth-fixed-width | fail | 1127 | 882 |
| density-320-font-2/text-growth-fixed-width-height | fail | 682 | 500 |
| density-320-font-2/top-level-decorations | fail | 621 | 522 |
| density-320-font-2/top-level-style-spacing | fail | 331 | 243 |
| density-320-font-2/uniform-single-run | fail | 383 | 276 |
| density-420-font-1/marks-and-paragraphs | fail | 3663 | 1860 |
| density-420-font-1/rich-run-decorations | fail | 1869 | 1349 |
| density-420-font-1/rich-run-fill-family | fail | 1762 | 1278 |
| density-420-font-1/rich-run-italic-spacing | fail | 980 | 543 |
| density-420-font-1/rich-run-size | fail | 4775 | 2379 |
| density-420-font-1/text-growth-auto | fail | 1792 | 1124 |
| density-420-font-1/text-growth-fixed-width | fail | 4446 | 3244 |
| density-420-font-1/text-growth-fixed-width-height | fail | 2848 | 1859 |
| density-420-font-1/top-level-decorations | fail | 1854 | 1374 |
| density-420-font-1/top-level-style-spacing | fail | 1635 | 1148 |
| density-420-font-1/uniform-single-run | fail | 1615 | 1199 |
| density-420-font-2/marks-and-paragraphs | fail | 3663 | 1873 |
| density-420-font-2/rich-run-decorations | fail | 1869 | 1356 |
| density-420-font-2/rich-run-fill-family | fail | 1762 | 1278 |
| density-420-font-2/rich-run-italic-spacing | fail | 980 | 538 |
| density-420-font-2/rich-run-size | fail | 4775 | 2539 |
| density-420-font-2/text-growth-auto | fail | 1792 | 1130 |
| density-420-font-2/text-growth-fixed-width | fail | 4446 | 3282 |
| density-420-font-2/text-growth-fixed-width-height | fail | 2848 | 1897 |
| density-420-font-2/top-level-decorations | fail | 1854 | 1381 |
| density-420-font-2/top-level-style-spacing | fail | 1635 | 1168 |
| density-420-font-2/uniform-single-run | fail | 1615 | 1201 |
