---
name: canvas-mobile
description: Working with mobile app designs in Canvas — iOS and Android screens, semantic structure, and exporting SwiftUI or Jetpack Compose source. Load this when a Canvas document has module "mobile", or before creating one.
metadata:
  display-name: Canvas mobile designs
  short-description: iOS and Android screens and SwiftUI/Compose export in Canvas.
---

# Canvas mobile designs

A Canvas document whose `module` is `"mobile"` produces SwiftUI or Jetpack Compose source. The
module is chosen at `documents.create` and cannot be changed afterwards.

Mobile is the only module with **two roles**. `ios` exports SwiftUI; `android` exports Compose.
Everything else in Canvas has one role per module, so this is the detail to get right first.

## The screen frame

A **screen** is a top-level frame carrying `role: "ios"` or `role: "android"`. Frames without a role
are ordinary design content, and most frames in a mobile document have none.

`documents.create` puts the first screen in the document:

| | |
| --- | --- |
| Name | `Screen` |
| Size | 393 × 852 |
| `role` | `ios` |
| `size` | `iphone` |

393 × 852 is an iPhone at logical point size. Compose reads the same numbers as `dp`, so an Android
screen at 393 × 852 is a reasonable equivalent rather than a conversion.

## One role per frame

A frame carries exactly one role, and `documents.export` refuses any frame whose role does not match
the requested one. So a document that ships both platforms needs both:

- **Designing one platform.** Set every screen's role to that platform and export it. If the user
  starts on iOS and later wants Android, `Update("#screen", { role: "android" })` retargets a screen
  outright.
- **Designing both.** Keep parallel sets of screens — the iOS ones with `role: "ios"`, the Android
  ones with `role: "android"` — and export each set separately. Share everything you can as reusable
  components at the document root so a change to a button reaches both.

Do not try to give one frame both roles. There is no such thing, and the export will simply reject
whichever role you did not set.

## Adding a screen

```js
const id = Copy("#screen", null, undefined, { name: "Settings" });
```

Or at the root:

```js
Insert(null, {
  id: "settings",
  type: "frame",
  name: "Settings",
  role: "ios",
  size: "iphone",
  width: 393,
  height: 852,
  layout: "vertical",
  fill: "#FFFFFF"
});
```

Screens are siblings at the document root — a role-bearing frame never contains another one — and
reusable components live at the root, outside every screen, with `ref` instances placed into
screens.

## Structure that exports well

Mobile export is **semantic**: the exporter reads your hierarchy and emits corresponding SwiftUI or
Compose structure. What you build becomes what a developer receives.

| Property | SwiftUI | Compose |
| --- | --- | --- |
| `description` | `.accessibilityLabel(…)` | `.semantics { contentDescription = … }` |
| `decorative: true` | `.accessibilityHidden(true)` | omitted from semantics |
| `headingLevel` on a text paragraph | `.accessibilityAddTraits(.isHeader)` | `.semantics { heading() }` |

`description` and `decorative` are mutually exclusive on the same node.

Beyond those:

- Auto-layout maps to real stacks. A vertical auto-layout frame becomes a `VStack` or `Column`;
  free positioning becomes offsets a developer will have to unpick.
- A repeated row or card should be a reusable component with `ref` instances. It exports as one
  reusable composable instead of ten copies of the same code.
- Name nodes as you would name views. Names carry into generated function and view names.
- Keep text, icons, and shapes native. Anything the exporter cannot represent becomes an embedded
  raster, which is dead weight in source code.

## Exporting

`documents.export` with `format: "swift"` or `format: "kotlin"` writes a **directory**:

```json
{ "documentId": "…", "format": "swift", "frames": ["screen", "settings"],
  "destination": "/Users/you/Desktop/AppScreens" }
```

It contains the generated source, any rasterised nodes, and `export-report.json`. Read that report:
it names every node the exporter could not express natively. On mobile that matters more than
elsewhere, because a rasterised node is source code a developer cannot edit.

Every frame must carry the requested role or export fails with `CANVAS_EXPORT_ROLE`. The destination
must not already exist.

For a single screen as a picture — a mockup for a chat or a spec — use `documents.extract`
instead.
