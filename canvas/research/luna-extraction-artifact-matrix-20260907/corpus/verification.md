# Roleless extraction artifact matrix evidence

This retained corpus records generated extraction bytes and semantic measurements; it is not an overall conformance claim.

- Single-node artifacts: 36/36 passed (PNG/SVG/PDF across 12 roleless roots).
- Triangle visual checks: 15/15 PNG renders and 19/19 rendered PDF pages passed red bounds, positive interior samples, and triangular occupancy checks.
- Directory artifacts: 9/9 passed.
- Multi-unit PDF: 3 pages rendered and measured in requested order.
- Multi-unit PNG/SVG rejection: CANVAS_EXTRACT_FORMAT_SINGLE_UNIT.
- PDF/X-4 rejection: CANVAS_PDF_PROFILE_UNVERIFIED.
- Missing-triangle negative fixture: 0 red samples and comparator rejected it.
- SVG visual checks used the existing native Chromium/vector-fidelity harness; no structural-only SVG claim is made.
- PDF inspection subprocesses use finite 30-second timeouts; timeout regression passed.
- Retained representative artifacts: 12, under artifacts/.
- Temporary complete matrix outputs were removed after measurement; only representative artifacts and JSON manifests are retained.
