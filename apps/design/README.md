# Design

`apps.pen` is the authoritative design source for the Apps App.

The standard App Bar primitive remains authoritative in `penkra/penkra.pen`. This
directory owns the Apps-specific configuration and content states. Host previews of
the App Bar are labeled as references and are not a second platform primitive.

Current app-owned states:

- Launcher
- Search results
- App detail with full README, Permissions, and Developer information
- Install, Open, and Update actions in search results and App detail
- Offline catalog state

Install and update act directly from the catalog. Permission declarations and optional choices
remain visible in the App detail Permissions tab; a separate install-review screen is not part of
the current flow.
