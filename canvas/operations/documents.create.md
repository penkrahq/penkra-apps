# Creating a Canvas document

Creation makes an empty, Account-owned design and returns its `documentId`. It adds no design
content, opens no tab, and shares with nobody. Use `documents.execute` for content and
`documents.open` when the user should see it.

## Choose the module first

Every Canvas document has a **module**, and it is **fixed for the life of the document**. It cannot
be changed afterward, and a document cannot hold two.

| Module | Produces |
| --- | --- |
| `deck` | a PowerPoint presentation |
| `print` | a PDF |
| `web` | HTML, CSS, and assets |
| `mobile` | SwiftUI or Jetpack Compose source |

Choose it from the artifact the user wants at the end, not from what the content looks like along
the way. A one-page site and a printed flyer can be visually identical and are different modules,
because one becomes HTML and the other becomes a PDF. When the request does not say, ask; picking
wrongly costs the whole document.

The module also determines which capabilities survive export, so it is worth reading the module's
Skill before designing: `canvas-deck`, `canvas-print`, `canvas-web`, or `canvas-mobile`.

## What you get back

Creation stamps one starter frame carrying the module's default role and size:

| Module | Starter frame | Role | Size |
| --- | --- | --- | --- |
| `deck` | 1280×720 | `slide` | `widescreen` |
| `print` | 794×1123 | `page` | `a4` |
| `web` | 720×480 | `route` | — |
| `mobile` | 393×852 | `ios` | `iphone` |

The response identifies it as `starterFrameId`. Build the first composition by updating or replacing
that frame rather than leaving it behind new content.

## Roles are stamped, never typed

A **role** marks a frame as an export unit — one slide, one page, one route, one screen. There are
exactly five: `slide`, `page`, `route`, `ios`, and `android`. Export collects the frames carrying
the role it targets and ignores everything else.

Roles arrive from presets, which are module data. Do not write `role` or `size` by hand: a
misspelled role produces a frame that looks correct and is silently excluded from every export.

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
