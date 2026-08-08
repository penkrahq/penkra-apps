# Design

`canvas.pen` is the authoritative UI/UX design source for the Canvas App.

The editor uses OpenPencil's current editor UI as its visual and interaction
baseline. Canvas adopts the proven density, side-panel structure, sectional
inspector, rulers, floating toolbar, zoom controls, and direct-manipulation
patterns without copying OpenPencil's product shell. Penkra-specific library,
Account sharing, sync/offline, compatibility, agent, tab, and docked workflows
remain authoritative in this file.

The file contains the approved product coverage, revised to the OpenPencil
editor baseline. Its named sections cover foundations and reusable components,
the document library,
editor states, sharing and collaboration, import/export compatibility, responsive
layouts, themes, accessibility behavior, Penkra host integration, and the six
prototype flows from the brief. Use the Pencil file—not the Markdown brief—as
the final authority for implementation.

Every frame in `DESIGN_SPEC.md` section 18 is represented. The design also keeps
the following additive review states because they make checklist requirements
explicit instead of hiding them inside another frame:

- `03.19 Editor — Invalid Inspector Input`
- `03.20 Editor — Saving`
- `03.21 Editor — Reconnecting`
- `04.10 Presence — Overflow Detail`
- `04.11 Collaboration — Access Removed`
- `06.09 Editor Overlay Detail — Layers`

These additions do not expand the first runtime scope. The earlier operator
approval remains the product boundary; the editor's visual baseline was revised
after the long-term engine and embedding audit. Implementation must follow the
current saved design rather than the earlier simplified editor mockups.

Trusted Penkra panel chrome remains authoritative in `penkra/penkra.pen` and is
shown here only as integration context; Canvas must not recreate it at runtime.
