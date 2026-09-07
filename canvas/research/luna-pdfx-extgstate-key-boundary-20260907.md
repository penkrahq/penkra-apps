# ExtGState unknown-key boundary evidence

Date: 2026-09-07

This is a bounded serialized-checker correction. It does not assert PDF/X
certification, change `conformant`, change `PDFX_UNCOVERED`, or open the
publication gate.

## Reproduction and correction

Input: retained
`canvas/research/luna-pdfx-document-negative-matrix-20260907/valid-candidate-control-classic-xref.pdf`.
The retained fixture is first loaded with `updateMetadata:false` and passed
through `serializePdf16`; the raw retained header is not treated as a clean
preflight input. The serialized baseline is `%PDF-1.6`,
`status: verified-canvas-writer-subset`, `issues: []`, and `conformant:false`.

The mutation then replaces page Contents with the Flate stream `q /Bad gs Q`
and installs a registered resource:

```text
Resources.ExtGState.Bad = << /Type /ExtGState /LW (bad-width) >>
```

Before the correction this returned `issues: []` and
`status: verified-canvas-writer-subset` with `conformant:false`. After the
correction it returns:

```text
GRAPHICS_STATE_KEY_OUTSIDE_SUBSET
clause: 6.1
object: 1 0 R/Kids[0]/Resources/ExtGState/Bad/LW
status: invalid
conformant: false
```

The production correction is in `pdfx-preflight.mjs` and allows only the
existing inspected ExtGState keys (`Type`, `ca`, `CA`, `BM`, `SMask`, `RI`,
`TR2`) plus the existing explicitly rejected keys (`TR`, `HT`, `HTP`, `BG`,
`BG2`, `UCR`, `UCR2`). Every other dictionary key receives the new stable
`GRAPHICS_STATE_KEY_OUTSIDE_SUBSET` issue at its exact field path.

## Test commands and results

New test:

```text
cd canvas
node --test src/exporters/pdfx-extgstate-key-boundary.test.mjs
exit 0
235 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo
```

Related focused selection:

```text
node --test \
  src/exporters/pdfx-extgstate-key-boundary.test.mjs \
  src/exporters/pdfx-preflight.test.mjs \
  src/exporters/pdfx-content-matrix.test.mjs \
  src/exporters/luna-pdfx-extgstate-context.test.mjs \
  src/exporters/luna-pdfx-graphics-state-matrix.test.mjs
exit 0
443 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo
```

All fixture PDFs are generated in memory. Each serialized byte input is
reloaded for topology checks, hashed before and after repeated preflight, and
preflighted twice with ordered issue equality asserted. Raw and Flate Contents
are separate identities. Direct, indirect, and inherited resource dictionaries
are covered.

## Matrix coverage

| Family | Cases |
| --- | ---: |
| Named additional keys `LW`, `LC`, `LJ`, `ML`, `D`, `Font`, `OP`, `op`, `OPM`, `SA`, `SM`, `AIS`, `TK`: Type-present/omitted x direct/indirect/inherited resources x raw/Flate | 156 |
| Unknown numeric, name, and dictionary values: same topology/type/content variants | 36 |
| Typed unused ExtGState dictionary, raw/Flate | 2 |
| Existing specific keys, raw/Flate: `TR`, `HT`, `HTP`, `BG`, `BG2`, `UCR`, `UCR2`, `TR2`, `RI`, `ca`, `CA`, `BM`, `SMask` | 26 |
| Valid omitted-Type and wrong-Type controls across resource/content variants | 12 |
| Ordinary writer alpha ExtGState baseline, state-isolation regression, exact membership assertion | 3 |
| **Total** | **235** |

For Type-present dictionaries, whole-document traversal reports the field at
the page-tree path, for example
`1 0 R/Kids[0]/Resources/ExtGState/State/LW`. For Type-omitted dictionaries
resolved by `gs`, the context path is
`Page[0]/Contents[0]/gs/LW`. Typed unused dictionaries are still traversed and
report their exact `/Unused/LW` field path. Wrong `/Type /Font` remains only
`CONTENT_RESOURCE_TYPE_INVALID` at `Page[0]/Contents[0]/gs`; no new unknown-key
issue is emitted for that rejected resource.

Existing specific fields retain their prior codes and paths, with no duplicate
`GRAPHICS_STATE_KEY_OUTSIDE_SUBSET`: `GRAPHICS_STATE_KEY_FORBIDDEN` for
`TR`/`HT`/`HTP`/`BG`/`BG2`/`UCR`/`UCR2`, `TRANSFER_FUNCTION_FORBIDDEN` for
invalid `TR2`, `RENDERING_INTENT_INVALID` for invalid `RI`,
`TRANSPARENCY_ALPHA_INVALID` for invalid `ca`/`CA`,
`BLEND_MODE_OUTSIDE_SUBSET` for `BM`, and `SOFT_MASK_OUTSIDE_SUBSET` for
`SMask`.

The ordinary `exportPdf` alpha fixture continues to produce no selected
graphics-state issue. No production-emitted unknown ExtGState keys were
blessed; the new issue is a fail-closed boundary for keys the writer does not
emit and the checker had not previously validated.

## Commits

- `9617fe5` — production allowlist correction in `pdfx-preflight.mjs`
- `744d1b3` — serialized regression matrix
- `9ecacbd` — test matrix count correction
- The evidence commit adding this report is separate from all source/test commits.
