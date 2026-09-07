# Roleless extraction artifact matrix evidence

This retained corpus records generated extraction bytes and semantic measurements; it is not an overall conformance claim.

- Single-node artifacts: 36/36 passed (PNG/SVG/PDF across 12 roleless roots).
- Corrected apex-up triangle mask: expected interior agreement >=95%, definite-exterior exact-red count 0, and occupancy retained.
- Triangle visual checks: 15/15 PNG renders and 19/19 rendered PDF pages passed.
- Directory artifacts: 9/9 passed.
- Multi-unit PDF: 3 pages rendered and measured in requested order.
- Multi-unit PNG/SVG rejection: CANVAS_EXTRACT_FORMAT_SINGLE_UNIT.
- PDF/X-4 rejection: CANVAS_PDF_PROFILE_UNVERIFIED.
- Negative fixtures rejected: missing, full rectangle, vertically flipped same-bounds/area triangle, and 3px shift.
- SVG checks used the existing native Chromium/vector-fidelity harness.
- Retained representative artifacts: 12, under artifacts/.
- Temporary complete matrix outputs were removed after measurement; only representative artifacts and JSON manifests are retained.
