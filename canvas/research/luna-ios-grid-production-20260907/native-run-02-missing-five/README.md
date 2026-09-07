# Run-02 missing-five capture evidence

This is the bounded capture-only follow-up for the five iPhone Large identities that were unmeasured in `native-run-02`. The original `native-run-02` directory is unchanged. No build, install, iPad operation, Android operation, exporter change, or capability change was made.

## Scope and execution

- Device: iPhone `A3D92728-7F7B-44D1-BE51-155B891905D9`, content size `large`, scale `3`.
- Exactly one `simctl launch` was issued for each requested case.
- Launch timeout: `120000` ms. Screenshot-pair attempts were bounded to three.
- The installed bundle was verified with `simctl get_app_container`; its executable SHA-256 was `56a7893fdc96d9b7b69fa1f37c8fedacbe2477bac479b5ad6eba11a9fcc14065`, matching run02 `binary-facts.json`. No install command was issued.
- Generated source hash: `cd9f240225dde9741775febc2cd3d8f4796be683baa895619b4f385580c43b11`, matching the run02 binary facts.
- Capture command exited `0`. The focused test command before capture exited `0` with `46/46` tests passing.

## Results

Five entries were accounted for: four measured passes, zero measured mismatches, and one unmeasured entry.

Measured and visually inspected crops:

- `grid-c100-180-r60-100-reversed` — pass
- `grid-c100-180-r60-100-only-2-2` — pass
- `grid-c100-180-r100-60-normal` — pass
- `grid-c100-180-r100-60-reversed` — pass

`grid-c100-180-r60-100-normal` launched successfully with exit code `0`, but its exact case/nonce readiness receipt was not observed in three bounded receipt waits. It has no crop and is explicitly unmeasured; this is not classified as a visual mismatch or launch failure.

The four valid crops were inspected individually with `view_image`; each showed the expected white root and colored grid children. Comparator outcomes, stable screenshot hashes, root receipts, crop coordinates, full-frame hash checks, and references are retained in the per-attempt directories.

## Restoration

The iPhone was initially `Shutdown`; after boot the observed content size was `large`. Restoration set the observed size back to `large` and shut the device down. Final state is `Shutdown`. The iPad was not queried or mutated.

Machine-readable command, result, hash, and restoration records are in `commands.json`, `measurements.json`, `preflight-binary.json`, `restoration.json`, and `device-state.json`.
