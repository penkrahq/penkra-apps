# Explorer

Explorer browses, searches, previews, and manages files through Penkra-scoped access. It operates on
host-minted file and directory handles, not arbitrary paths. A handle represents an explicitly
granted resource and cannot be constructed from a filename or filesystem path.

Use `penkra open` when the user supplies a path or URL and no current handle exists. Preserve the
handle returned by that trusted flow. The visible Explorer tab is identified separately by a Penkra
`tabId`; use tab operations for screenshots and interaction.

Explorer can edit supported text files and preview common text, image, and PDF formats only within
the granted handle. A preview or handle failure does not broaden that scope.
