# Design

`apps.pen` is the authoritative design source for the Apps App.

The standard App Bar primitive remains authoritative in `penkra/penkra.pen`. This
directory owns the Apps-specific configuration and content states. Host previews of
the App Bar are labeled as references and are not a second platform primitive.

Current app-owned states:

- Launcher
- Search results
- App detail
- Installation progress and result
- Installed and update management
- Per-Space enablement
- Uninstall and retained-data choices
- Offline, validation, compatibility, and revocation errors

Package details may explain permissions inside Apps, but the final trusted installation
confirmation remains Penkra-owned system UI in `penkra/penkra.pen` so an App cannot spoof it.
