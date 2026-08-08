# Penkra Canvas — UI/UX Design Specification

> Status: design brief for exploration
>
> Product name: **Canvas**
>
> Initial format: **`.pen`**
>
> Design source: [`design/canvas.pen`](./design/canvas.pen)

This document is the working brief for constructing and reviewing Canvas in
Pencil. It is deliberately detailed enough to design from without inventing
missing screens during implementation. Once the Pencil file has been reviewed,
the Pencil file becomes authoritative for visual hierarchy, language, states,
and composition.

This is not a second Penkra platform plan. Runtime, backend, security, SDK, and
implementation work must be reconciled into the client workspace's authoritative
`TODO.md` before development begins.

---

## 1. Product intent

Canvas is a Penkra App for creating, importing, inspecting, manually refining,
sharing, and collaboratively editing cloud-hosted design documents. The first
supported interchange format is `.pen`. The name stays format-neutral so other
design formats can be considered later without renaming the App.

Canvas should feel like a focused design editor beside a Penkra conversation.
OpenPencil's current editor is the visual and interaction baseline: Canvas uses
its compact density, File/Assets and page hierarchy, sectional inspector,
rulers, floating bottom toolbar, zoom model, selection overlays, and direct
manipulation behavior. This is reuse of a stronger editor language, not a copy
of OpenPencil's product shell:

- the human can inspect hierarchy and properties, select elements, move them,
  resize them, and make precise visual adjustments;
- an agent can inspect and mutate the same document through declared Canvas
  operations;
- collaborators can work on the same cloud document from their own Penkra
  accounts;
- `.pen` content survives import and export without silent loss, including data
  Canvas does not yet render or edit;
- the product uses established libraries and protocols for solved problems
  rather than inventing replacements.

Canvas is not intended to reproduce every Figma or Pencil feature in its first
usable version. The design should be calm, familiar, and direct. It should not
introduce novel editor conventions without a demonstrated user benefit.

### 1.1 OpenPencil baseline and Canvas product differences

Adopt and adapt from OpenPencil:

- the wide editor's dense left hierarchy, dominant canvas, and sectional right
  inspector;
- File/Assets switching, a Pages region, and a distinct Layers region;
- compact control sizing, grouped numeric inputs, progressive property
  sections, inline visibility/lock affordances, and selection breadcrumbs;
- rulers, frame labels, resize/rotation handles, alignment feedback, a floating
  bottom toolbar, and a low-emphasis zoom control;
- established mouse, trackpad, keyboard, drag/reparent, resize, text-edit, and
  responsive toolbar interactions.

Canvas-specific additions:

- the Account-backed document library and explicit `.pen` import flow;
- owner-controlled email sharing rather than anonymous or P2P room links;
- Saved, Saving, Syncing, Reconnecting, Offline, and Failed states backed by the
  canonical cloud CRDT;
- honest compatibility findings for preserved but unsupported `.pen` behavior;
- agent operations, bounded agent activity, exact-tab targeting, and live
  document updates from the adjacent Penkra Thread;
- dock-aware compact and narrow layouts inside Penkra's right panel.

Intentionally not copied from OpenPencil:

- its AI/provider sidebar, because the adjacent Penkra Thread is the agent
  conversation;
- its local-file-first, native desktop, P2P room, Figma, CLI, and MCP product
  surfaces;
- its outer application chrome, menus, branding, or collaboration transport.

Penkra continues to own the trusted outer tab strip, dock size, App lifecycle,
permissions, and conversation. Canvas must not recreate those surfaces.

### 1.2 Primary outcome

A user can open Canvas, create or import a `.pen` document, refine it visually,
let an agent work on it, and share it with another Penkra account without
managing local files or merge conflicts.

### 1.3 Supporting outcomes

- A user can always tell whether their latest edits are local, syncing, synced,
  offline, or blocked by an error.
- A user can see who has access without needing a separate team or Space model.
- A user can safely inspect unsupported `.pen` content without Canvas deleting
  it on export.
- A user can download the current cloud document as a normal `.pen` file at any
  time.
- An agent can work without requiring a visible cursor or pretending to be a
  human collaborator.

---

## 2. Confirmed product decisions

These decisions came from the current product discussion and should be reflected
in the Pencil designs.

### 2.1 Documents and storage

- The canonical collaborative document is hosted in the Penkra backend.
- Importing or dragging in a `.pen` file creates a new cloud document.
- Downloading exports the current cloud state to a local `.pen` file.
- A local-only editing mode is not part of the initial design.
- Deleted documents are soft-deleted internally, although the first UI may only
  expose a clear delete confirmation and removal from the active library.
- A basic version-history UI is not required initially.

### 2.2 Identity and access

- Collaboration uses Penkra Accounts, not local Spaces.
- A Canvas library follows the signed-in Account across devices and Spaces where
  Canvas is enabled.
- Penkra includes the current Space ID in App context so an App can use it when
  its domain needs Space-scoped behavior. Canvas does not use that ID to
  partition document ownership, libraries, or sharing.
- Enabling Canvas and granting App permissions remain Space-scoped host actions;
  document ownership and sharing are Account-scoped Canvas domain behavior.
- A document has one owner.
- The owner alone can add or remove collaborators.
- Initial collaborators are editors; a viewer role is not required initially.
- Sharing is performed by entering one or more email addresses.
- Canvas sends no invitation email initially.
- If the address belongs to a Penkra Account, the shared document appears in
  that Account's **Shared with you** section.
- If the address does not yet belong to a Penkra Account, Canvas stores a pending
  grant. It becomes available after a matching verified Account exists.
- A collaborator must use a Penkra Account to open and edit the document.

### 2.3 Collaboration

- The canonical collaboration model is a cloud-backed CRDT using Yjs or an
  equivalently mature, proven library if validation reveals a stronger fit.
- Concurrent edits should converge without one user's entire file overwriting
  another user's entire file.
- Offline editing is supported after the document has been loaded on a device.
- Reconnection merges queued edits and makes sync state explicit.
- Visible human collaborator presence is useful.
- Remote collaborator cursors and selection outlines are not required in the
  first design.
- Agents do not receive visible cursors or presence avatars initially.
- Comments are not required initially.

### 2.4 `.pen` compatibility

- Semantic losslessness is the target: valid `.pen` information must not be
  silently discarded because Canvas cannot render or edit it yet.
- Unsupported nodes or properties remain preserved in the document model.
- Unsupported content is shown with an understandable warning or placeholder.
- Export should retain preserved content.
- Compatibility is reported honestly; the UI must never imply full rendering
  support merely because round-trip preservation works.
- `.pen` is a live format. Compatibility behavior must be testable against
  fixtures and revisited as the public format evolves.

### 2.5 Editing

- Manual editing is required, but it is not the only or primary way large
  document changes will be created.
- The first manual controls prioritize common refinements: selection, movement,
  dimensions, spacing, layout, type, colors, borders, radii, opacity, and theme
  or variable changes.
- The left side exposes document hierarchy.
- The right side exposes selected-element properties and document-level theme
  controls.
- The center remains visually dominant.
- Agent operations can inspect and mutate a document without a visible tab for
  document-level work. Operations that depend on a live selection or visual
  viewport target a specific open Canvas tab.

### 2.6 Penkra integration

- Canvas owns its entire App surface.
- Penkra owns the trusted panel tab strip outside Canvas.
- Canvas does not redraw trusted Penkra chrome inside its App.
- Canvas may use a compact editor-specific header rather than stacking an
  additional generic App Bar above it.
- Agent-facing behavior is declared as manifest operations, not an invented
  private capability system.
- Canvas does not declare a local `.pen` `open-file` handler initially. Opening
  a local `.pen` link may use the configured generic text handler or the
  operating system, but it never imports or uploads into Canvas. Adding it to
  Canvas remains an explicit import or drag-and-drop action that creates a
  cloud document.

---

## 3. Assumptions to validate

These are current design hypotheses, not settled platform facts. The Pencil file
should make them cheap to review and change.

| Hypothesis | Why it currently seems right | Validation needed |
| --- | --- | --- |
| A tri-pane editor is appropriate at wide widths | It matches established design-tool conventions and the requested hierarchy/inspector model | Use real `.pen` documents and common selection tasks |
| One side panel at a time is preferable below 960 px | Both panels leave too little canvas in a docked App | Test at 800 px and 640 px widths |
| Side panels should become overlays below 640 px | A persistent panel would consume most of the minimum App width | Test at the expected 416 px panel width |
| A compact header can hold navigation, title, sync, presence, and sharing | These are the highest-value global controls | Test long document names and 5+ collaborators |
| A bottom floating tool palette is usable in a side panel | It avoids competing with document controls and follows common editor patterns | Compare bottom vs left vertical placement |
| Property sections can use progressive disclosure | It reduces inspector density | Test whether frequent typography/layout changes become slower |
| Human presence avatars without cursors are sufficient initially | They answer “who is here?” without requiring awareness rendering | Test collaborative sessions with two and three users |
| Pending email grants can share the same list as active collaborators | It keeps access management in one place | Ensure “pending account” cannot be mistaken for an emailed invitation |
| Agent edits need no special on-canvas visualization | The agent already communicates in the adjacent Thread | Test whether users can understand changes arriving while they inspect the document |
| The library can remain flat initially | Search, recency, and ownership grouping cover the expected early volume | Test with 50–100 documents |

Design rejected hypotheses visibly when testing disproves them; do not preserve
them merely because they appear in this brief.

---

## 4. Users and core stories

### 4.1 Owner refining an agent-created design

> As a document owner, I want to adjust a theme, font size, frame height, and
> spacing after an agent creates a design so I can make precise aesthetic changes
> without asking the agent for every minor adjustment.

Success shape:

1. The document opens on the relevant design.
2. The user finds an element in the hierarchy or selects it on canvas.
3. The right inspector shows editable values in familiar groups.
4. Changes render immediately and join the normal undo history.
5. Sync status moves from **Saving…** to **Saved** without stealing focus.

### 4.2 Owner importing an existing `.pen`

> As a user with a `.pen` file, I want to drag it into Canvas and continue
> working without worrying that unrecognized content will vanish.

Success shape:

1. Dragging over the library reveals a clear full-surface import target.
2. Canvas validates and uploads the file.
3. The new cloud document opens after successful parsing.
4. If some content is unsupported, the document opens with a non-blocking
   compatibility summary.
5. The user can inspect affected objects and still export the preserved source
   semantics later.

### 4.3 Owner sharing with an existing Account

> As an owner, I want to grant edit access using a teammate's email so they can
> open the document from their own Canvas library.

Success shape:

1. **Share** opens one focused dialog.
2. The owner enters an email, reviews it, and chooses **Add editor**.
3. The person appears in the access list as **Editor**.
4. No claim is made that an email was sent.
5. The collaborator sees the document under **Shared with you** when Canvas next
   synchronizes.

### 4.4 Owner sharing with a future Account

> As an owner, I want to reserve access for a person's email even if they do not
> yet have a Penkra Account.

Success shape:

1. The address appears in the access list as **Pending account**.
2. Supporting copy states: “No email will be sent.”
3. The owner can revoke the pending grant.
4. The grant activates only after the same email is verified on a Penkra Account.

### 4.5 Collaborator editing concurrently

> As an editor, I want my changes and the owner's changes to merge predictably so
> we can work in the same document without exchanging files.

Success shape:

1. Both users appear in the compact presence group.
2. Changes from either side arrive incrementally.
3. Selections remain local; the first design does not draw remote cursors.
4. Undo affects the current user's logical changes, subject to the collaboration
   library's tested undo semantics.
5. A disconnect changes status but does not discard local edits.

### 4.6 User going offline

> As a user who briefly loses connection, I want to continue making changes and
> trust Canvas to merge them after I reconnect.

Success shape:

1. Status changes to **Offline — changes stay on this device**.
2. The document remains editable if a usable local snapshot exists.
3. Reconnection changes status to **Syncing…**, then **Saved**.
4. A prolonged or failed sync exposes a recoverable action and never falsely
   reports success.

### 4.7 User encountering unsupported content

> As a user opening a newer `.pen` document, I want to know which parts Canvas
> cannot faithfully render while keeping them intact.

Success shape:

1. A compatibility banner gives a count and a **Review** action.
2. Unsupported objects remain present in the hierarchy with a warning marker.
3. Selecting one shows preserved metadata and what cannot be edited.
4. Export does not silently strip the object.

### 4.8 Agent changing a document

> As a Penkra user, I want my agent to inspect and update Canvas while I continue
> discussing the work in the Thread.

Success shape:

1. The agent identifies the cloud document, not an arbitrary local path.
2. A batch of mutations applies as one coherent transaction and undo group.
3. An open Canvas view updates through the same collaboration stream.
4. No fake agent avatar or cursor appears.
5. If a mutation requires a selected object or visible viewport, the operation
   targets an explicit Canvas tab.

### 4.9 User exporting work

> As a user, I want to download the current document as `.pen` so I retain an
> interoperable copy outside Canvas.

Success shape:

1. **Download .pen** is easy to find from the document menu.
2. Export waits for or clearly accounts for pending local changes.
3. A compatibility notice distinguishes preserved unsupported content from
   unsupported content that could not be safely serialized.
4. The file downloads with a meaningful, sanitized name.

---

## 5. Information architecture

Canvas has two primary routes and a small set of modal layers.

```text
Canvas
├── Library
│   ├── Your files
│   └── Shared with you
└── Document editor
    ├── Document header
    ├── Hierarchy panel
    ├── Canvas viewport
    └── Inspector panel

Modal layers
├── Create document
├── Import progress / failure
├── Share document
├── Compatibility review
├── Document menu
└── Delete confirmation
```

### 5.1 Route behavior

- Canvas opens to the last valid route when practical.
- A direct document route opens the document if the current Account has access.
- An inaccessible or deleted document produces a bounded error state with a
  **Back to files** action.
- The back action in the editor returns to the Canvas library, not browser
  history with ambiguous host behavior.
- Opening a document from the library reuses the current App tab by default.
  Agent or host operations may explicitly open a new Canvas App tab.

### 5.2 Library organization

The initial library is intentionally flat:

- **Your files** contains documents owned by the Account.
- **Shared with you** contains documents owned by another Account.
- Search covers both groups.
- Within each group, default ordering is most recently opened or edited first.
- Folder, project, team, and Space groupings are not designed initially.

---

## 6. Responsive layout contract

The editor must be designed as a resizable App, not as a full-screen desktop-only
site. Create representative frames for all three widths.

### 6.1 Wide: 960 px and above

```text
┌──────────────────────────────────────────────────────────────┐
│ Back  Document title       Saved      People   Share   •••   │
├──────────────┬──────────────────────────────┬────────────────┤
│ Hierarchy    │                              │ Inspector      │
│              │       Canvas viewport        │                │
│              │                              │                │
│              │         Tool palette         │                │
└──────────────┴──────────────────────────────┴────────────────┘
```

- Both side panels are visible by default.
- Hierarchy target width: 220–260 px.
- Inspector target width: 260–320 px.
- Panels may be resized within tested minimums.
- The center canvas takes all remaining width.
- Either side panel can collapse from its header control or keyboard shortcut.

### 6.2 Compact: 640–959 px

```text
┌─────────────────────────────────────────────┐
│ Back  Title        Saved   People Share ••• │
├──────────────┬──────────────────────────────┤
│ Active panel │                              │
│ Layers or    │       Canvas viewport        │
│ Inspector    │                              │
│              │         Tool palette         │
└──────────────┴──────────────────────────────┘
```

- Only one side panel is visible at a time.
- **Layers** and **Inspect** header buttons switch the active side.
- Closing the active side gives the canvas full width.
- The selected element persists when switching panels.
- Opening the inspector because of a selection should not happen
  automatically if it would replace a panel the user is actively using.

### 6.3 Narrow: below 640 px, including 416 px

```text
┌──────────────────────────────┐
│ Back  Title        Share  •••│
├──────────────────────────────┤
│                              │
│       Canvas viewport        │
│                              │
│     compact tool palette     │
├──────────────────────────────┤
│ Layers / Inspect overlay     │
└──────────────────────────────┘
```

- Side panels become modal sheets or full-height overlays.
- Opening a panel does not destroy canvas state.
- The document title truncates in the header and remains available through a
  tooltip or document menu.
- Sync status compresses to an icon with accessible label.
- Presence compresses to one stacked avatar plus count.
- The tool palette shows the essential tools and moves secondary actions into
  an overflow menu.
- No control may require hover at this width.

### 6.4 Height behavior

- Design at 800 px reference height and test at 600 px.
- Header remains fixed.
- Side panel content scrolls independently.
- Floating controls avoid the system safe area and do not cover the active
  selection when the viewport can pan to compensate.
- Dialogs use a bounded height with a scrollable body and fixed action row.

---

## 7. Foundations

### 7.1 Visual character

Canvas should feel native to Penkra while preserving the density expected of a
design tool:

- neutral surfaces;
- one clear accent color for selection, focus, and primary action;
- restrained borders instead of heavy cards;
- compact controls with generous hit targets;
- minimal decoration around the canvas;
- no gradients, glass effects, ornamental shadows, or novelty navigation;
- familiar tool and property symbols from one well-known icon library.

### 7.2 Theme model

Design every foundational component in light and dark modes using semantic
variables. Do not encode a named Penkra theme preset in Canvas.

Required semantic roles:

- App and panel surfaces;
- canvas work area;
- raised/floating surface;
- control surface;
- hover surface;
- selected surface;
- default, strong, and subtle borders;
- primary and secondary text;
- accent and accent-contrast text;
- success, warning, and error;
- focus ring;
- remote-person identity colors if presence needs them.

Document theme variables are separate from the Canvas interface theme. Changing
a design's theme must not change Canvas chrome.

### 7.3 Typography

- Use Penkra's semantic UI font token for chrome.
- Use a semantic monospace token for raw values, IDs, and preserved metadata.
- Default control labels: 12–13 px.
- Default body copy: 13–14 px.
- Library page title: approximately 20–24 px.
- Avoid tiny text below 11 px.
- Numeric fields use tabular numerals where available.

### 7.4 Density and hit targets

- Visual control heights may be compact, but pointer targets should be at least
  32 × 32 px in the editor and 40 × 40 px on narrow layouts.
- Tree rows should target 28–32 px height.
- Compact icon buttons require tooltips and accessible names.
- Adjacent destructive and primary actions require sufficient separation.

### 7.5 Icons

Use one established, open icon set consistently. Do not mix several outline
styles or draw custom metaphors when a standard one exists.

Required concepts include:

- back, search, plus, upload, share, overflow;
- layers, inspect, assets or reusable items if included;
- select, hand/pan, frame, rectangle, ellipse, text;
- lock/unlock, visibility, warning, chevron, drag handle;
- align, distribute, layout direction, constraints;
- zoom in/out, fit, undo, redo;
- online/saved, saving, offline, error;
- download, duplicate, rename, delete.

---

## 8. Reusable component inventory

Construct these as reusable Pencil components before composing the main screens.
Show default, hover, pressed, selected, focus-visible, disabled, loading, and
error states where relevant.

### 8.1 Global controls

- Primary, secondary, quiet, and destructive buttons.
- Icon button in standard and compact sizes.
- Text field, search field, numeric field, select, segmented control, checkbox,
  color input, and token/variable picker.
- Tooltip, popover, dropdown menu, context menu, dialog, banner, inline alert,
  toast, and progress indicator.
- Avatar, avatar stack, Account row, role label, and pending Account row.
- Status icon with text and icon-only compressed variant.

### 8.2 Library components

- Library header.
- **Your files** / **Shared with you** section heading.
- Document row or card with name, owner context, modified time, thumbnail or
  neutral preview, collaborator stack, compatibility marker, and overflow.
- Empty-state illustration area using simple product-native geometry, not a
  decorative generated image.
- Drag-and-drop overlay.
- Skeleton document row.
- Search no-results block.

### 8.3 Editor components

- Document header and responsive variants.
- Hierarchy panel header.
- Tree row for frame, group, shape, text, image, unsupported object, and instance.
- Tree row affordances: disclosure, icon, name, visibility, lock, warning.
- Canvas artboard/frame, selection bounds, resize handles, rotation handle,
  alignment guide, distance label, and placeholder for unsupported content.
- Floating tool palette and responsive overflow.
- Zoom control cluster.
- Inspector section header and disclosure.
- Paired X/Y and W/H numeric controls.
- Alignment and distribution control groups.
- Fill, stroke, shadow/effect, corner-radius, opacity, and blend controls.
- Typography controls.
- Layout and spacing controls.
- Theme and variable controls.
- Empty inspector, document inspector, single selection, multi-selection with
  mixed values, unsupported selection, and locked selection.

### 8.4 Collaboration components

- Presence stack with online human collaborators only.
- Share dialog email-entry token.
- Existing Account result.
- Unknown/pending Account result.
- Access row for owner, active editor, and pending editor.
- Remove-access confirmation.
- Offline and reconnecting status.

---

## 9. Library specification

### 9.1 Library header

Wide layout:

- Left: **Canvas** page title.
- Center or flexible region: search field labeled **Search files**.
- Right: **Import .pen** secondary button and **New file** primary button.

Compact/narrow layout:

- Title remains visible.
- Search moves below the first row or opens from a search icon on the narrowest
  layout.
- **New file** remains directly accessible.
- Import may become an overflow item only when width requires it.

### 9.2 Populated state

Show both ownership groups only when each has content. Each group displays its
count only if useful and not visually noisy.

A document item communicates:

- document name;
- preview or file-type placeholder;
- last activity in relative language;
- owner context for shared documents: **Owned by name/email**;
- human collaborator stack when shared;
- compatibility warning when attention is needed;
- overflow menu.

Document item menu:

- Open;
- Rename, for owner;
- Duplicate;
- Download .pen;
- Share, for owner;
- Delete, for owner;
- Remove from my library, for non-owner only if supported later; omit initially
  if the underlying behavior is not settled.

Do not show inaccessible actions as if they can succeed. Prefer hiding
owner-only lifecycle actions from editors while preserving a clear **Owner**
context.

### 9.3 Empty state

Heading: **Create your first Canvas file**

Body: **Start with a blank design or import an existing .pen file. Your files
are saved to your Penkra Account.**

Actions:

- **New file**
- **Import .pen**

Avoid describing the file as local or implying it belongs to the current Space.

### 9.4 Loading state

- Show header immediately.
- Use 4–6 skeleton document items.
- Do not show an empty-state call to action before loading finishes.
- If cached documents are available, prefer showing them with a quiet refreshing
  status rather than replacing the full library with skeletons.

### 9.5 Search state

- Search is incremental after a short debounce.
- Matching may include document name and owner identity.
- Preserve the two ownership groups in results.
- Empty copy: **No files match “{query}”.**
- Action: **Clear search**.
- Escape clears the field before moving focus elsewhere.

### 9.6 Offline library

If cached documents are usable:

- Show an inline banner: **Offline — showing files available on this device.**
- Clearly mark documents that can open offline.
- Do not imply the list is complete.

If no usable cache exists:

- Heading: **Canvas needs a connection**
- Body: **Reconnect to load your files.**
- Action: **Try again**

### 9.7 Recoverable error

- Keep the library shell visible.
- Error copy states what failed without exposing implementation internals.
- Primary action: **Try again**.
- Secondary action may expose diagnostic details only when they help support.

### 9.8 Drag-and-drop import

When one or more files enter the App surface:

- dim the library content;
- show a dashed full-surface target inside Canvas, not over trusted host chrome;
- heading: **Import .pen to Canvas**;
- body: **Drop to create a cloud file.**

Reject unsupported extensions before upload with precise copy. Multiple-file
import may be designed as a queued list, but it can be deferred if the initial
implementation accepts exactly one file at a time.

---

## 10. Editor shell specification

### 10.1 Document header

The editor uses one compact Canvas-owned document bar directly below the trusted
host tab strip. It borrows OpenPencil's density but substitutes Canvas's cloud
and Penkra actions for local-file and P2P-room controls.

Leading group:

- **Back to files** icon button;
- editable document name or a title button that enters rename mode;
- optional compatibility warning marker beside the title.

Center/flexible group:

- enough empty flexible space to avoid crowding;
- optional undo/redo controls if usability testing finds keyboard-only access
  insufficient. Do not center the document title merely for symmetry.

Trailing group:

- sync status;
- human presence stack;
- a quiet agent-activity affordance that opens recent agent actions without
  presenting the agent as a human collaborator;
- **Share** button;
- document overflow menu.

Header behavior:

- Title truncates before trailing actions collapse.
- Rename commits on Enter or blur, cancels on Escape, and exposes validation.
- **Saving…** should not resize the header as it changes to **Saved**.
- The persistent **Saved** text may fade to a check icon after a quiet period,
  but its accessible label remains available.
- Share is visible to editors so they can inspect access, but only owners see
  controls to change access.

### 10.2 Hierarchy panel

Panel header:

- **File** and **Assets** tabs using the OpenPencil panel hierarchy;
- optional search/filter action;
- collapse/close action.

The **File** tab contains a compact **Pages** region above a visually separate
**Layers** region. Canvas initially has one logical page when imported `.pen`
content has no page abstraction; the hierarchy must not invent destructive
page conversions. **Assets** exposes reusable components and document assets
only when supported by the authoritative `.pen` document.

Tree behavior:

- Mirrors document hierarchy without flattening meaningful parentage.
- Indentation is clear at at least five levels.
- Disclosure affects descendants only.
- Clicking a row selects the object.
- Shift-click extends range selection where meaningful.
- Command/Ctrl-click toggles membership in a multi-selection.
- Double-clicking the name enters rename.
- Dragging reorders or reparents with a clear insertion indicator.
- Visibility and lock controls appear predictably; hover-only discovery is not
  the sole access path on narrow/touch layouts.
- Locked descendants communicate inherited locking if relevant.
- Unsupported objects keep their hierarchy position and show a warning icon.

Tree row states:

- default;
- hover;
- locally selected;
- part of multi-selection;
- editing name;
- dragging;
- valid drop target;
- invalid drop target;
- hidden;
- locked;
- unsupported;
- remotely changed while visible, represented only through normal updated
  content—not a persistent “agent changed this” decoration.

Panel footer is omitted unless a real persistent control needs it.

### 10.3 Canvas viewport

The center is an infinite or effectively unbounded work area containing document
frames and objects.

Expected behavior:

- Click selects the topmost eligible object.
- Double-click or Enter drills into a group/frame where required.
- Escape moves selection to the parent or clears it according to the tested
  selection model.
- Drag moves selected objects.
- Resize handles preserve predictable modifier-key behavior.
- Space-drag pans.
- Wheel/trackpad pans; modifier plus wheel or pinch zooms.
- Alignment guides and distance labels appear during manipulation.
- Selection remains visible in both light and dark App themes and over varied
  document colors.
- The viewport leaves room for floating controls and can pan content away from
  overlays.
- Wide layouts show top and left rulers by default, with a View/zoom menu option
  to hide them. Rulers disappear before canvas content is squeezed in compact
  dock widths.
- Frame names and current dimensions appear near selected frames using the same
  restrained geometry language as the OpenPencil baseline.

Do not draw human remote cursors or agent cursors in the initial design. The
viewport may update live as remote changes arrive.

### 10.4 Tool palette

The wide palette floats at the bottom center of the viewport rather than
occupying a full-width row. It uses the OpenPencil interaction hierarchy and
Canvas's approved tools. It must not cover the selected object after Fit or
Zoom to selection; the viewport accounts for the overlay when centering.

Initial essential tools:

- Select;
- Hand/pan;
- Frame;
- Rectangle;
- Ellipse;
- Text.

Candidate tools that require validation before inclusion:

- line;
- freeform pen/vector tool;
- image placement;
- comment tool, which is out of initial scope;
- reusable component/instance creation.

Tool behavior:

- Active tool is unmistakable.
- Keyboard shortcut appears in tooltip.
- Selection returns to Select after one-shot creation unless the user uses the
  established sticky-tool modifier.
- Narrow layouts keep Select, Hand, Frame, Shape, and Text visible; secondary
  geometry choices can live under Shape.

### 10.5 Zoom controls

- Show current zoom percentage.
- Menu contains Zoom in, Zoom out, Zoom to 100%, Fit all, Fit selection, and
  common percentages.
- The percentage control should not compete visually with the tool palette.
- Narrow mode can collapse to a single percentage/menu button.

### 10.6 Inspector panel

Panel header follows the OpenPencil baseline:

- **Design** is the primary tab, followed by **Code** only when a truthful
  code/export view exists; no empty AI tab is shown;
- a compact object-type and selected-layer heading;
- optional selection breadcrumb when deeply nested;
- collapse/close action.

Inspector modes:

1. **Nothing selected** — brief help plus document-level canvas/theme controls.
2. **Document selected** — document theme, variables, canvas/background, and
   compatibility summary.
3. **Single editable selection** — property groups appropriate to the node.
4. **Multiple selection** — shared controls, mixed-value indicators, alignment,
   and distribution.
5. **Locked selection** — values readable; edits disabled with reason.
6. **Unsupported selection** — preserved metadata, warning, hierarchy/location,
   and no misleading editable controls.

Recommended property group order:

1. Identity: object name and type.
2. Position and size: X, Y, width, height, rotation.
3. Layout: direction, alignment, distribution, gap, padding, sizing behavior.
4. Appearance: opacity, visibility, blend if supported.
5. Fill.
6. Stroke.
7. Corners.
8. Effects.
9. Typography, when applicable.
10. Theme and variable bindings.
11. Advanced/preserved metadata.

Groups irrelevant to the selection do not render as disabled noise.

#### Numeric editing

- Arrow increments by one unit.
- Shift+Arrow uses a larger established increment.
- Option/Alt+Arrow may use a fractional increment if the format supports it.
- Dragging a numeric label scrubs the value only if implemented accessibly.
- Mixed values show **Mixed**, not zero or blank ambiguity.
- Invalid input remains visible with an error until corrected or cancelled.

#### Theme and variables

- Document theme control is visible when nothing or the document root is
  selected.
- Show the active theme combination in plain language.
- Variable-bound properties distinguish the token name from its resolved value.
- The user can switch a property between literal and variable binding without
  losing clarity about the effect.
- Theme changes preview immediately and join undo history.

---

## 11. Sharing and access specification

### 11.1 Share entry point

**Share** opens a centered dialog at wide/compact widths and a near-full-height
sheet at narrow width.

Dialog title: **Share “{document name}”**

Supporting copy for owners: **Add editors by email. They need a Penkra Account
to open this file. No email will be sent.**

Supporting copy for editors: **People with access to this file. Only the owner
can make changes.**

### 11.2 Owner email entry

- Input label: **Email address**
- Placeholder: **name@example.com**
- Enter or comma commits a valid address token.
- Paste supports multiple addresses if straightforward; otherwise preserve one
  address at a time and do not imply bulk support.
- Duplicate, malformed, owner, and already-shared addresses receive specific
  inline feedback.
- Primary action: **Add editor** or **Add editors** based on count.
- Do not use **Send invite**, because no email is sent.

After adding:

- Existing verified Account: status **Editor**.
- No matching verified Account: status **Pending account**.
- Confirmation toast for active Account: **Access granted to {email}.**
- Confirmation toast for pending grant: **Access will activate when {email} is
  verified on a Penkra Account. No email was sent.**

### 11.3 Access list

Ordering:

1. Owner.
2. Active editors, alphabetically or by addition time—choose one consistently.
3. Pending Accounts.

Each row contains:

- avatar or generated identity mark;
- display name when available;
- email;
- role/status;
- owner-only remove menu for anyone except the owner.

The owner row is labeled **Owner** and cannot be removed. Pending rows use a
neutral pending icon, not an online presence dot.

### 11.4 Remove access

Removal requires a small confirmation when the collaborator may be active:

- Title: **Remove access?**
- Body: **{person/email} will no longer be able to open or edit this file.**
- Actions: **Cancel**, **Remove access**.

If the person currently has the document open, the UI should revoke their next
authorized write/read according to backend policy and show them a clear access-
removed state. The design must not promise that a rendered frame disappears
instantaneously before authorization invalidation is technically validated.

### 11.5 Presence

- Presence represents human Accounts currently connected to the document.
- The current user may be omitted from the compact stack to prioritize others.
- Hover/click reveals names and online status.
- Overflow uses **+N**.
- No cursor color is assigned in the initial viewport design.
- Pending Accounts never appear in presence.
- An agent never appears in presence.

---

## 12. Import, compatibility, export, and deletion

### 12.1 Create new file

Default action may create immediately with a generated name such as **Untitled**,
then open the editor. If a create dialog is retained, it should ask only for a
name and optional starter—not settings that can be changed later.

Candidate starters:

- Blank;
- common frame/device starter only if real user demand exists.

Do not delay the first usable canvas with a large template gallery.

### 12.2 Import progress

Stages visible to the user may include:

1. **Reading file…**
2. **Uploading…**
3. **Preparing document…**

Use determinate progress only when the number is honest. Allow cancellation
before the cloud document is committed. If a failed import leaves a draft server
record, cleanup is an implementation concern and must not surface as a phantom
library item.

### 12.3 Import failures

Distinguish:

- not a `.pen` file;
- invalid JSON or malformed document;
- unsupported format version;
- file too large;
- network interruption;
- server or authorization error.

The failure state offers **Try again** when retry is safe and **Choose another
file** otherwise. Technical details may be copied from a disclosure for support,
but the primary message remains plain-language.

### 12.4 Compatibility summary

When preservation succeeds but rendering/editing is incomplete, use a warning,
not a blocking error.

Banner example:

**Some content has limited support**  
**3 objects are preserved but may not look or edit exactly as expected.**  
Actions: **Review**, **Dismiss**

The review surface contains:

- affected object name and type;
- hierarchy path;
- support category: not rendered, partially rendered, read-only property, or
  unknown field preserved;
- whether export preserves it;
- action to select/reveal the object when possible.

Avoid the absolute phrase **No data will be lost** unless fixtures prove that
claim for the exact input. Prefer precise preservation language.

### 12.5 Unsupported object placeholder

On canvas:

- preserve approximate bounds if known;
- use a neutral striped or outlined placeholder;
- show object type and a warning icon;
- remain selectable;
- avoid a large warning that obscures surrounding design context.

In hierarchy:

- preserve the original name and position;
- use a generic object icon plus warning.

In inspector:

- state what is unsupported;
- display safe read-only metadata;
- provide **View compatibility details**.

### 12.6 Download `.pen`

Document menu item: **Download .pen**

During export:

- if changes are syncing, show **Preparing latest version…**;
- if offline, explicitly state whether the export includes current local edits;
- if current local state cannot be serialized safely, block with a precise error
  rather than downloading a misleading file;
- successful export may use a quiet toast: **Downloaded {filename}.pen**.

### 12.7 Delete document

Owner-only destructive action.

Dialog:

- Title: **Delete “{document name}”?**
- Body: **It will be removed from everyone’s Canvas library. This action may be
  recoverable by support for a limited time.**
- Actions: **Cancel**, **Delete file**.

Do not mention a visible trash or restore flow until one is designed and built.

---

## 13. Sync, offline, and failure states

### 13.1 Status vocabulary

Use one vocabulary everywhere:

| State | Visible label | Meaning |
| --- | --- | --- |
| Clean and online | **Saved** | Local and acknowledged cloud state are aligned |
| Local mutations pending | **Saving…** | Changes are queued or in flight |
| Initial/live reconnection | **Syncing…** | Canvas is reconciling local and remote state |
| Offline with local persistence | **Offline** | Editing can continue locally |
| Sync failure requiring attention | **Couldn’t save** | Automatic progress is blocked or repeatedly failing |
| Read access lost | **Access removed** | The Account can no longer continue in the document |

Do not use **Saved locally** unless it specifically means persisted into a tested
device cache. In-memory changes alone are not “saved.”

### 13.2 Offline editor banner

The persistent header status is usually sufficient. Add a banner when going
offline changes expected behavior:

**You’re offline. Changes will sync when you reconnect.**

If local persistence is unavailable or quota fails:

**You’re offline and new changes may not survive closing Canvas. Keep this tab
open and reconnect.**

That is a high-severity persistent warning, not a disappearing toast.

### 13.3 Failed save

- Keep local editing state intact where possible.
- Status becomes **Couldn’t save** with a warning icon.
- Clicking it opens detail with **Try again** and safe diagnostic context.
- Do not suggest reloading until the user has a way to preserve unsynced work.

### 13.4 Access removed while open

- Stop accepting edits as soon as authorization invalidation is confirmed.
- Replace the editor with a bounded state:
  - heading **You no longer have access**;
  - body **The owner removed your access to this file.**;
  - action **Back to files**.
- If unsynced local changes exist, the final handling requires architecture
  validation. The design must include an honest warning and must not offer an
  unauthorized export by assumption.

### 13.5 Document unavailable

Use distinct messages for:

- not found;
- deleted;
- no permission;
- temporary loading failure.

All include **Back to files**. Retry appears only for temporary failures.

---

## 14. Menus, dialogs, and feedback

### 14.1 Document menu

Proposed order:

1. Rename.
2. Duplicate.
3. Download .pen.
4. Compatibility details, when relevant.
5. Divider.
6. Delete file, owner only.

Sharing remains a visible header action and should not be hidden only in this
menu.

### 14.2 Context menu for selected object

Initial candidates:

- Cut, Copy, Paste;
- Duplicate;
- Rename;
- Group/Ungroup when valid;
- Bring forward/Send backward submenu;
- Lock/Unlock;
- Show/Hide;
- Delete.

Only include actions supported by the first editing implementation. The Pencil
design can show the complete intended menu, but implementation cannot silently
omit designed actions; review and phase the design first.

### 14.3 Toast use

Use toasts for completed, non-blocking outcomes:

- access granted;
- pending access stored;
- access removed;
- download complete;
- duplicate created.

Do not use toasts as the only representation of offline state, failed saves,
import errors, or access loss.

### 14.4 Dialog behavior

- Focus moves into the dialog and returns to the invoker.
- Escape closes non-destructive dialogs.
- Destructive confirmation never defaults focus to the destructive action.
- Clicking the backdrop may close simple dialogs but not a dialog containing
  unsaved typed email tokens or an active import without confirmation.
- Narrow dialogs become sheets without changing their language or action order.

---

## 15. Keyboard and interaction model

Use established design-tool and platform conventions. Show platform-appropriate
Command or Control symbols.

### 15.1 Required shortcuts to design and document

| Action | Shortcut concept |
| --- | --- |
| Undo / redo | Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z |
| Save | No manual save required; Cmd/Ctrl+S may acknowledge saved state or trigger download only if explicitly chosen—do not surprise-download |
| Copy / paste / cut | platform standard |
| Duplicate | Cmd/Ctrl+D |
| Delete | Delete/Backspace with text-edit safeguards |
| Select all | Cmd/Ctrl+A, scoped by edit context |
| Escape selection/tool | Escape |
| Pan | hold Space and drag |
| Zoom in/out | platform-standard plus/minus |
| Fit selection | established discoverable shortcut after validation |
| Select tool | V |
| Frame | F |
| Rectangle | R |
| Ellipse | O |
| Text | T |
| Show/hide Layers | documented shortcut after collision review |
| Show/hide Inspect | documented shortcut after collision review |

### 15.2 Focus model

- Keyboard focus and canvas selection are distinct.
- A visible focus ring appears on every chrome control.
- Enter activates focused buttons and opens focused tree containers where
  appropriate.
- Arrow keys navigate tree rows without moving canvas objects while the tree has
  focus.
- Arrow keys nudge selected objects while the canvas has focus and text editing
  is inactive.
- Tab order follows the visual shell without traversing every canvas object.
- A shortcut or command allows moving focus between header, hierarchy, canvas,
  and inspector.

### 15.3 Pointer and touch

- Pointer behavior must work with mouse and trackpad.
- Narrow width does not necessarily mean touch, but every action must remain
  available without hover.
- Tiny resize handles may have larger invisible hit areas.
- Drag operations expose a visible target and support Escape cancellation.

---

## 16. Accessibility requirements

- Meet WCAG 2.2 AA contrast for Canvas chrome and interaction states.
- Use semantic controls for buttons, inputs, lists, tree views, dialogs, and
  menus where their behavior matches.
- Tree hierarchy exposes level, expanded/collapsed, selected, disabled/locked,
  and item name to assistive technology.
- Icon-only controls have stable accessible names.
- Color is never the only signifier for selection, warning, presence, or sync.
- Focus remains visible over both App chrome and canvas backgrounds.
- Reduced motion removes non-essential transitions and animated panning while
  preserving state changes.
- Live-region announcements are restrained:
  - announce save failure and access loss;
  - do not announce every **Saving… / Saved** cycle;
  - batch remote collaboration announcements rather than narrating every edit.
- Zooming Canvas must not prevent browser-level text zoom from keeping chrome
  usable.
- Inspector labels stay associated with controls even in compact paired layouts.
- Error text states both the problem and the correction.

---

## 17. Design-facing state shapes

These are conceptual UI states for consistent screen composition, not final API
or database schemas.

### 17.1 Library item

```text
Document summary
├── identity: id, name
├── ownership: owned-by-me | shared-with-me
├── owner: display name, verified email
├── activity: updated/opened timestamp
├── access: collaborator summaries
├── preview: ready | generating | unavailable
├── availability: cloud-only | available-offline
├── compatibility: supported | warnings(count)
└── lifecycle: active | deleted/unavailable
```

### 17.2 Document session

```text
Document session
├── access: owner | editor | removed
├── connection: connecting | online | offline | failed
├── sync: clean | local-pending | reconciling | blocked
├── compatibility: clean | warnings
├── selection: none | single | multiple
├── tool: select | hand | frame | shape | text
├── left panel: open | closed | overlay
├── right panel: open | closed | overlay
└── presence: human account summaries
```

### 17.3 Share row

```text
Access entry
├── email
├── display name: present | unavailable
├── account: verified | pending
├── role: owner | editor
├── presence: online | offline | not-applicable
└── manageability: removable | fixed-owner | read-only-viewer
```

Keep incompatible states out of a single frame. For example, a pending Account
cannot be online, and an editor cannot see an enabled owner-only removal control.

---

## 18. Exact Pencil board and frame inventory

Use these names so review comments can point to stable design locations. Frames
may be added when testing reveals a missing state, but do not silently collapse
distinct failure states into one generic screen.

### Board 01 — Foundations & Components

- `01.01 Foundations — Light`
- `01.02 Foundations — Dark`
- `01.03 Global Controls — States`
- `01.04 Library Components — States`
- `01.05 Editor Header — Wide / Compact / Narrow`
- `01.06 Tree Rows — Types & States`
- `01.07 Tool Palette — Wide / Narrow`
- `01.08 Inspector Controls — States`
- `01.09 Status, Presence & Compatibility`
- `01.10 Menus, Dialogs, Banners & Toasts`

### Board 02 — Document Library

- `02.01 Library — Wide — Populated`
- `02.02 Library — Compact — Populated`
- `02.03 Library — Narrow — Populated`
- `02.04 Library — Empty`
- `02.05 Library — Loading`
- `02.06 Library — Search Results`
- `02.07 Library — No Results`
- `02.08 Library — Offline Cached`
- `02.09 Library — Offline Empty`
- `02.10 Library — Recoverable Error`
- `02.11 Library — Drag Import`
- `02.12 New File — Minimal Flow`

### Board 03 — Editor Shell

- `03.01 Editor — Wide — Nothing Selected`
- `03.02 Editor — Wide — Frame Selected`
- `03.03 Editor — Wide — Text Selected`
- `03.04 Editor — Wide — Multi-selection`
- `03.05 Editor — Wide — Theme Variables`
- `03.06 Editor — Compact — Layers Open`
- `03.07 Editor — Compact — Inspect Open`
- `03.08 Editor — Compact — Panels Closed`
- `03.09 Editor — Narrow — Canvas`
- `03.10 Editor — Narrow — Layers Sheet`
- `03.11 Editor — Narrow — Inspect Sheet`
- `03.12 Editor — Locked Selection`
- `03.13 Editor — Unsupported Selection`
- `03.14 Editor — Compatibility Banner`
- `03.15 Editor — Offline Editing`
- `03.16 Editor — Failed Save`
- `03.17 Editor — Access Removed`
- `03.18 Editor — Document Unavailable`

### Board 04 — Sharing & Collaboration

- `04.01 Share — Owner — Existing Access`
- `04.02 Share — Owner — Enter Email`
- `04.03 Share — Existing Account Added`
- `04.04 Share — Pending Account Added`
- `04.05 Share — Invalid / Duplicate Email`
- `04.06 Share — Editor Read-only Access List`
- `04.07 Share — Remove Access Confirmation`
- `04.08 Presence — 1 / 3 / Overflow`
- `04.09 Collaboration — Connecting / Online / Offline`

### Board 05 — Import, Export & Compatibility

- `05.01 Import — Reading`
- `05.02 Import — Uploading`
- `05.03 Import — Preparing`
- `05.04 Import — Invalid Document`
- `05.05 Import — Unsupported Version`
- `05.06 Import — Network Failure`
- `05.07 Compatibility Review — Summary`
- `05.08 Compatibility Review — Object Detail`
- `05.09 Unsupported Object — Canvas / Tree / Inspect`
- `05.10 Export — Preparing Latest Version`
- `05.11 Export — Offline Explanation`
- `05.12 Export — Failure`
- `05.13 Delete — Owner Confirmation`

### Board 06 — Responsive & Host Previews

- `06.01 Canvas App — 1200×800`
- `06.02 Canvas App — 800×800`
- `06.03 Canvas App — 416×800`
- `06.04 Canvas in Penkra Panel — Wide Context`
- `06.05 Canvas in Penkra Panel — Narrow Context`
- `06.06 Resize Sequence — Wide to Narrow`
- `06.07 Keyboard Focus Sequence`
- `06.08 Reduced Motion Notes`

---

## 19. Prototype flows to connect in Pencil

### Flow A — First document

```text
Empty library
→ New file
→ Editor, nothing selected
→ Create frame
→ Inspect frame properties
→ Saved
→ Back to populated library
```

### Flow B — Lossless import with warnings

```text
Populated library
→ Drag .pen
→ Reading
→ Uploading
→ Preparing
→ Editor with compatibility banner
→ Review
→ Select unsupported object
→ Download .pen
```

### Flow C — Share with an existing Account

```text
Editor
→ Share
→ Enter verified Account email
→ Add editor
→ Active editor row
→ Collaborator opens under Shared with you
→ Both presence avatars visible
```

### Flow D — Share with a future Account

```text
Editor
→ Share
→ Enter unmatched email
→ Add editor
→ Pending account row
→ No-email confirmation
→ Revoke pending access
```

### Flow E — Offline collaborative editing

```text
Editor online / Saved
→ Connection lost / Offline
→ Make manual change
→ Local persistence confirmed
→ Connection restored / Syncing
→ Remote changes merge
→ Saved
```

### Flow F — Agent and human editing

```text
Human viewing open document
→ Agent runs document mutation batch
→ Canvas updates through shared document stream
→ Human selects changed object
→ Human adjusts property
→ One coherent local undo
→ Saved
```

The visual flow does not add an agent cursor. If testing shows users cannot tell
why the document changed, explore a short-lived activity notice before adding a
persistent presence concept.

---

## 20. Deliberate non-goals for the first reviewed design

Do not expand the initial Pencil scope into these features unless the user makes
a new product decision:

- comments, pins, and comment threads;
- remote collaborator cursors and colored remote selections;
- visible agent presence or agent cursor;
- team, organization, Space-membership, or shared-folder access models;
- email invitations or outbound notification delivery;
- public link sharing;
- viewer/commenter role matrix;
- local-only canonical files;
- file-system synchronization;
- version history browser, branching, or named versions;
- full template marketplace;
- plugins inside Canvas;
- format conversion to or from Figma/Paper;
- every vector editing feature of Figma;
- presentation/prototype playback;
- developer code generation panel;
- a second embedded chat or AI sidebar inside Canvas.

The adjacent Penkra Thread already provides the primary agent conversation. An
embedded AI sidebar would duplicate hierarchy, reduce canvas width, and create
unclear ownership of conversation state.

---

## 21. Research and implementation assumptions visible in design

The design should remain compatible with the following engineering direction
without attempting to specify the code:

- Use established libraries for CRDT collaboration, persistence, awareness,
  rendering, layout, validation, and interaction whenever they satisfy the
  requirements.
- Validate Yjs document granularity and undo semantics with concurrent structural
  edits before committing to the final internal shape.
- Reuse and adapt OpenPencil's editor engine, headless Vue interaction layer,
  and visual language through a reviewed maintained dependency. Do not inherit
  its lossy `.pen` adapter, local-file product shell, AI sidebar, or peer-to-peer
  collaboration architecture.
- Treat raw unknown `.pen` fields as preserved source data, not as objects to
  normalize away casually.
- Keep Canvas domain APIs in the Penkra backend rather than disguising them as a
  general third-party SDK.
- Use public browser networking primitives behind reviewed manifest origins if
  the platform validation confirms this as the canonical runtime model.
- Keep host-only responsibilities narrow: Account-bound App session bootstrap,
  declared network policy, file import/export mediation where necessary, tab
  routing, and declared operations.

These points constrain truthful UI language. They do not authorize code work or
override the authoritative platform plan.

---

## 22. Design review checklist

The Pencil design is ready for implementation review only when all applicable
items below are visible in the file.

### Coverage

- [ ] All frames in Section 18 exist or have an explicit reviewed reason for
  omission.
- [ ] Wide, compact, and narrow editor layouts are materially designed, not
  scaled copies.
- [ ] Library empty, loading, populated, search, offline, and error states exist.
- [ ] Owner and editor sharing views differ correctly.
- [ ] Active and pending Account access are visually distinct.
- [ ] Import warnings differ from import failures.
- [ ] Unsupported objects appear on canvas, in hierarchy, and in inspector.
- [ ] Saving, syncing, offline, and failed-save states use the defined vocabulary.
- [ ] Access removed and document unavailable states exist.

### Interaction

- [ ] Selection is consistent between tree, canvas, and inspector.
- [ ] Every overlay has an entry and exit path.
- [ ] Destructive actions require appropriate confirmation.
- [ ] Owner-only controls do not appear enabled for editors.
- [ ] Narrow mode exposes all essential actions without hover.
- [ ] Keyboard focus order and focus-visible examples are shown.
- [ ] Tooltips and shortcuts are specified for icon buttons.

### Visual system

- [ ] Light and dark modes use semantic variables.
- [ ] Canvas chrome remains separate from document theme variables.
- [ ] Components use one icon system.
- [ ] The canvas remains visually dominant.
- [ ] Panel density does not reduce pointer targets below the agreed minimum.
- [ ] Selection/focus/warnings remain visible over varied backgrounds.
- [ ] Penkra trusted tab chrome is shown only in contextual preview frames, not
  recreated as a Canvas component.

### Language

- [ ] No UI says an invitation email was sent.
- [ ] No UI describes documents as Space-owned.
- [ ] No UI implies a pending email belongs to an active Account.
- [ ] No UI claims unsupported content renders perfectly.
- [ ] No UI promises “no data loss” without qualified fixture evidence.
- [ ] **File**, **document**, **owner**, **editor**, **Account**, and **Space** are
  used consistently.
- [ ] Error messages state a useful next action.

### Accessibility

- [ ] Focus-visible states exist for every interactive component family.
- [ ] All icon-only controls have names/tooltips in annotations.
- [ ] Contrast is checked in both themes.
- [ ] Warning and presence states do not depend on color alone.
- [ ] Tree and dialog semantics are annotated.
- [ ] Reduced-motion behavior is documented.

### Handoff

- [ ] The final Pencil hierarchy and names are clean enough to map to components.
- [ ] Reusable components are instances rather than inconsistent copies.
- [ ] Variables replace repeated literal colors and fonts.
- [ ] Prototype flows cover create, import, share, offline, agent change, and
  export.
- [ ] Any difference from this brief is recorded as a reviewed design decision.
- [ ] Runtime implementation has not started before design review approval.

---

## 23. Open design questions for review, not blockers to starting

These should be answered by comparing real Pencil frames rather than debating
them only in prose.

1. Does the tool palette work better centered at the bottom or vertically beside
   the hierarchy panel in Penkra's common panel sizes?
2. At compact widths, should **Layers** and **Inspect** be header buttons or a
   small two-option rail attached to the canvas edge?
3. Does the library benefit from previews immediately, or do high-quality text
   rows load faster and scan better at the expected early document count?
4. Should document rename happen inline in the header or in the document menu?
5. Is presence useful without cursors, or should it remain only inside the Share
   dialog until cursor awareness is built?
6. Should compatibility warnings stay in a persistent banner until reviewed, or
   collapse into a title warning after the first acknowledgement?
7. Should a single click select a group or drill to its deepest visible child?
   This must align hierarchy and canvas behavior.
8. Which manual tools are genuinely needed for the first usable build beyond
   Select, Hand, Frame, Rectangle, Ellipse, and Text?
9. Is a document-level **Theme** section discoverable enough in the empty
   inspector, or should it have a dedicated inspector tab?
10. When an agent applies a large mutation while the user is watching, is the
    normal live update sufficient, or is a transient **Canvas updated** notice
    necessary?

Start with the simplest conventional answer in the first Pencil pass. Compare
alternatives only where a frame or prototype reveals a real usability tradeoff.
