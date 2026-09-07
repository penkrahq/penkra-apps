# Fixed missing-one capture evidence

This is the single approved rerun for `grid-c100-180-r60-100-normal` on iPhone `A3D92728-7F7B-44D1-BE51-155B891905D9` at Large. The prior missing-one and missing-five evidence directories are unchanged.

- No build, install, iPad, Android, or capability action occurred.
- Host and installed executable SHA-256 matched run02: `56a7893fdc96d9b7b69fa1f37c8fedacbe2477bac479b5ad6eba11a9fcc14065`.
- One launch was issued; the first screenshot pair was stable and measured.
- Exact `LUNA_GRID_READY` and `LUNA_GRID_ROOT` receipts matched case and nonce. The fixed query retained ISO metadata and used `--start @1788779259 --end @1788779267`.
- Raw A/B SHA-256 was identical before and after the byte crop: `035ab14a2a090410d45beec88c2aa353953b005065a9b9ca2483aaad265d3bdc`.
- Crop dimensions were `1020x1200`; comparator status was `pass`, with four children and 9,976 positive samples per child, using the unchanged two-pixel physical edge tolerance and no registration.
- The crop was individually inspected with `view_image`; it visibly contains the expected white root and four colored cells.

The iPhone was initially Shutdown, observed at Large after boot, restored to Large, and shut down. Final state is Shutdown. The `runPostlaunchAttempt` helper is exercised by device-free tests only; the production runner uses the shared exclusive-directory helper and its own post-launch catch path. No claim is made that the injected helper test alone proves the complete production catch path.
