# Import prior art: theming, public surfaces, and updates

Research only, 2026-09-05. No import implementation or architecture-plan edits accompany this report. Active implementation planning remains in `../TODO.md`.

## 1. Consumer theming

The expectation is partly confirmed: context flows down the consuming hierarchy in all four systems, but **context selection is not the same as rebinding an imported reference to a same-named consumer definition**.

Figma variables retain collection identity. An object's Auto mode inherits the enclosing container's mode; inheritance continues upward until an explicit mode is found, otherwise the variable collection's default applies. An explicit mode can also be set on a component or other container. Thus source locking is not restricted to literal values: an explicit mode can interrupt inheritance while retaining variable bindings. These rules apply to the collection whose variable is bound, not an arbitrary consumer collection with a matching name. [Figma: modes, “Set to auto mode”](https://help.figma.com/hc/en-us/articles/15343816063383-Modes-for-variables).

A published text style remains a link to a style definition in its library. Figma offers an explicit action to move that definition into the consuming file; it does not describe implicit replacement by a same-named local paragraph style. Consequently, “consumer theme everywhere” does not establish consumer ownership of every imported style definition. Variables used inside a style and the identity of that style are separate concerns. [Figma: manage and share styles](https://help.figma.com/hc/en-us/articles/360039820134-Manage-and-share-styles), [Figma: locating and moving the original style](https://help.figma.com/hc/en-us/articles/360039238193-Hide-styles-components-and-variables-when-publishing).

CSS custom properties inherit and participate in ordinary cascade rules. `var(--brand)` uses the computed custom-property value on the consuming element; the stylesheet's origin file is not a variable namespace. A nearer declaration can override the inherited value, and explicit literal property values need not use the variable. This supports ambient consumer theming, but a component can also establish a local variable value. [CSS Custom Properties Level 1, §§2–3](https://www.w3.org/TR/css-variables-1/).

SwiftUI environment values propagate down the view hierarchy until another environment modifier overrides them. Views must actually read the environment to participate; importing a Swift module does not automatically make its explicit colors or fonts ambient. [Apple: EnvironmentValues](https://developer.apple.com/documentation/swiftui/environmentvalues/).

Compose's `MaterialTheme` provides color scheme, typography, and shapes through `CompositionLocal`. A read obtains the closest ancestor's provided value. A nested provider or theme can override that context, while an explicit property value can bypass it. [Android: locally scoped data with CompositionLocal](https://developer.android.com/develop/ui/compose/compositionlocal).

**Finding:** prior art supports consumer-context inheritance by default for properties designed to read that context. It does not support universal name-based rebinding, nor the assertion that literals are the only way to lock styling. A per-import theming flag is not required by these examples; neither is its absence alone a complete theming design.

**Cost for Canvas (engineering inference):** consistent context propagation needs stable token/style identity, a rule for inherited versus explicit modes, and the same resolution context across rendering and export. Replacing source-variable lookup with consumer-name lookup would be smaller code but could silently substitute unrelated definitions. Fixing the current split between source variables and consumer paragraph styles requires resolving that distinction, not merely choosing one document for both maps.

## 2. Explicit public surfaces

| System | Public boundary | Where expressed |
| --- | --- | --- |
| Figma | Publish reusable components, styles, and variables; hide selected assets from publication | Per-asset publication state, managed through a library publishing UI |
| Node/npm packages | `package.json` `exports` defines supported entry points and encapsulates other package subpaths | Package-level map; optional for legacy packages |
| ES modules | `export` declarations and re-exports identify names another module can import | Declaration or export-list statements in source |
| Rust | Items are private by default; `pub`, restricted visibility, and re-exports expose selected API | Per-item visibility and module re-exports |
| Swift | Cross-module public API requires `public`/`open`; ordinary declarations default to `internal` | Per-declaration access level |
| Java named modules | `exports` exposes packages; public types/members still have their own access rules | Module descriptor plus declaration-level access |

Sources: [Figma publishing](https://help.figma.com/hc/en-us/articles/360025508373-Publish-a-library), [Node package entry points](https://nodejs.org/api/packages.html#package-entry-points), [ECMAScript export declarations](https://tc39.es/ecma262/multipage/ecmascript-language-scripts-and-modules.html#sec-exports), [Rust visibility](https://doc.rust-lang.org/reference/visibility-and-privacy.html), [Swift access control](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/accesscontrol/), [Java Language Specification §7.7](https://docs.oracle.com/en/java/javase/26/docs/specs/jls/jls-7.html).

**Finding:** an intentional public boundary is the strong common pattern. A document-level manifest list is not the universal representation. Per-item declarations dominate language APIs; Node and Java add package/module boundaries. Figma's UI exposes assets individually rather than making every arbitrary node in a file a published library item. These public-surface controls are not all security boundaries: Node explicitly distinguishes entry-point encapsulation from strong isolation.

**Cost for Canvas (engineering inference):** either a per-item marker or a document export list needs validation of public roots, stable identifiers, and access through dependencies. A marker is local to authoring; a list provides a central inventory but can become stale when nodes are removed. Neither automatically solves subtree pruning, duplicate imports, missing targets, or cross-account reverse lookup. Prior art does not objectively choose between the two serializations for Canvas.

## 3. What replaces a CRDT sequence pin

Figma separates editing from publishing. Published updates become available to consumers, who can review changes side by side or as overlays and update individual assets or all assets. This is a publication-and-acceptance boundary, not a requirement that consumers match every source edit. The documentation does not establish user-authored semantic-version constraints as the ordinary design-library workflow. [Figma: review and accept library updates](https://help.figma.com/hc/en-us/articles/360039234193-Review-and-accept-library-updates).

Sketch likewise offers library and component update review. Starred versions let publishers control release timing: when a library has a starred version, new versions are not distributed until starred. Sketch also offers automatic library downloading/updating, so even design-library products differ on update policy. [Sketch: updating library components](https://www.sketch.com/docs/libraries/updating-library-components/).

npm lockfiles record an exact dependency tree, resolved locations, and integrity data. Integrity digests verify artifact bytes; version selection and integrity are different fields with different jobs. A digest does not by itself define a release or a user-facing update workflow. [npm: package-lock.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/).

**Finding:** the alternatives are not mutually exclusive. A published revision can carry a content hash and remain selected until the consumer accepts an update. “No pinning with an update prompt” still needs retained accepted content or revision identity; otherwise declining an update cannot preserve the previous appearance. The observed design-library pattern is published/selected content plus controlled updates, with optional automatic updates. A raw CRDT sequence is an editing/concurrency position and is not that release boundary.

**Cost for Canvas (engineering inference):** hashes require canonical content/asset coverage, retrieval, and retention; release revisions require a publish operation and immutable published content; opt-in updates require retaining the accepted revision and offering a meaningful comparison. Combining release identity with hashing can support integrity/deduplication without exposing hashes as the authoring model. Reusing the live CRDT head avoids these mechanisms but makes unrelated edits invalidate consumers and cannot implement “keep the old version.” No import change is made by this report.
