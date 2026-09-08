# Creating a Canvas document

Creation makes an empty, Account-owned design and returns its `documentId`. It adds no design
content, opens no tab, and shares with nobody. Use `documents.execute` for content and
`documents.open` when the user should see it.

## Choose the module

Every Canvas document has one **module**. A generic document can set a deliverable module later with
`SetModule`, but only while it contains no role-bearing frame. Once set to `deck`, `web`, or
`mobile`, the module does not change.

| Module | Produces |
| --- | --- |
| `generic` | editable freeform work; PNG, SVG, or PDF through extraction |
| `deck` | a PowerPoint presentation |
| `web` | HTML, CSS, and assets |
| `mobile` | SwiftUI or Jetpack Compose source |

Choose it from the artifact the user wants at the end, not from what the content looks like. A
one-page site uses `web`; a visually identical flyer can remain `generic` and extract to PDF. When
the deliverable is unknown, `generic` preserves the option to choose a deliverable module later.

The deliverable module determines which capabilities survive projection, so read its Skill before
designing: `canvas-deck`, `canvas-web`, or `canvas-mobile`. Direct extraction is roleless and does
not use those deliverable capability tables.

## What you get back

Creation stamps one starter frame carrying the module's default role and size:

| Module | Starter frame | Role | Size |
| --- | --- | --- | --- |
| `generic` | 720×480 | — | — |
| `deck` | 1280×720 | `slide` | `widescreen` |
| `web` | 720×480 | `route` | — |
| `mobile` | 393×852 | `ios` | `iphone` |

For physical work, `generic` also accepts the `a4` and `letter` blank-document presets. They add a
roleless frame with declared `physical` dimensions.

The response identifies it as `starterFrameId`. Build the first composition by updating or replacing
that frame rather than leaving it behind new content.

## Roles identify deliverable frames

A **role** marks a frame as a deliverable export unit — one slide, one route, or one mobile screen.
There are exactly four: `slide`, `route`, `ios`, and `android`. Export derives the required role
from its requested format and ignores unrelated frames.

Creation presets stamp the starter frame's role and size. When adding another deliverable frame,
copy an existing one or use the exact role documented by that module's Skill. Schema validation
rejects a misspelled or module-incompatible role.

Most frames have no role at all. Layout containers, cards, groups, and reusable components are
ordinary frames living inside a role frame or out on the open canvas beside it. Only a new export
unit needs a preset.

`mobile` is the one module with two roles. A document may hold both `ios` and `android` frames, and
each exports separately; nothing is copied between them, because targeting a second platform is a
design decision rather than a duplication.

## Creation does not

Create a document per outcome the user asked for, not per idea explored — several directions belong
in one document, side by side, where they can be compared. Creating a document is not a way to
avoid reading an existing one, and it is not undoable through `documents.undo`, which covers
`documents.execute` mutations only.
