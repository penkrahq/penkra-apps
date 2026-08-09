# Design

`canvas.pen` is the authoritative UI/UX design source for the Canvas App.

The editor uses OpenPencil's current editor UI as its visual and interaction
baseline. Canvas adopts the proven density, side-panel structure, sectional
inspector, rulers, floating toolbar, zoom controls, and direct-manipulation
patterns without copying OpenPencil's product shell. Penkra-specific library,
Account sharing, sync/offline, compatibility, agent, tab, and docked workflows
remain authoritative in this file.

The file contains the approved product coverage, revised to the OpenPencil editor baseline. Its
named sections cover foundations and reusable components, the document library, editor states,
sharing and collaboration, import/export compatibility, responsive layouts, themes,
accessibility behavior, Penkra host integration, and the approved prototype flows.

The design includes the following explicit review states:

- `03.19 Editor — Invalid Inspector Input`
- `03.20 Editor — Saving`
- `03.21 Editor — Reconnecting`
- `04.10 Presence — Overflow Detail`
- `04.11 Collaboration — Access Removed`
- `06.09 Editor Overlay Detail — Layers`

These states are part of the approved design. Implementation follows the current saved design.

Trusted Penkra panel chrome remains authoritative in `penkra/penkra.pen` and is
shown here only as integration context; Canvas must not recreate it at runtime.
