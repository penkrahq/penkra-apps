# Explorer

## What this App is

Explorer browses, searches, previews, and manages files through Penkra-scoped access. It operates on
host-minted file and directory handles, not arbitrary paths. A handle represents an explicitly
granted resource and cannot be constructed from a filename or filesystem path.

## Before you write anything

Resolve the current handle from a trusted Penkra flow and keep all work within that grant. A visible
Explorer tab has a separate Penkra `tabId`; a tab ID does not identify or expand the underlying file
scope. Preview support or a handle failure never broadens access.

## How to do the common thing

Use `penkra open` when the user supplies a path or URL and no current handle exists, then preserve
the handle it returns. Explorer can edit supported text files and preview common text, image, and PDF
formats within the granted handle. Use Penkra tab operations for screenshots and visible interaction.

## Reference

Use `explorer --help` for operation discovery and the exact operation's leaf help for how and when to
open a scoped resource. Handles, filesystem paths, and visible tab IDs are separate identifiers.

## When things fail

Re-establish the intended resource through a trusted open flow when a handle is missing, expired, or
outside its grant. Do not manufacture a handle from a path, widen the scope, or substitute direct
filesystem access for an Explorer operation.
