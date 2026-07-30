# Design

`apps.pen` is the authoritative design source for the Apps App.

The standard App Bar primitive remains authoritative in `penkra/penkra.pen`. This
directory owns the Apps-specific configuration and content states. Host previews of
the App Bar are labeled as references and are not a second platform primitive.

Current app-owned states:

- Launcher
- Search results
- App detail

Install permission prompts remain Penkra-owned system UI in `penkra/penkra.pen`. The
public SDK binding is deferred until the platform primitives are settled.
