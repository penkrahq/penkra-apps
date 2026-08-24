# Explorer

## What this App is

Explorer browses, searches, previews, and manages files through Penkra-scoped access. It operates on host-minted file and directory handles, not arbitrary paths, and can edit supported text files or preview common text, image, and PDF formats in a visible App tab.

## Before you write anything

Confirm Explorer is enabled with `["penkra", "apps", "list"]`. Obtain the resource handle from a Penkra open result or another trusted host flow; never invent a handle ID, infer one from a path, or substitute a path for a handle. Inspect the resource and current file contents before editing. If the user supplied a path or URL rather than an existing handle, use `["penkra", "open"]` first.

## How to do the common thing

To open a known scoped file, call `["explorer", "resources", "open"]` with `input: { "handleId": "<host-handle>", "kind": "file", "name": "notes.md" }`. Preserve the returned `tabId`. Take a Penkra tab snapshot with that exact ID before interacting with visible controls or claiming what Explorer displayed.

## Reference

`resources.open` accepts `handleId`, `kind` (`file` or `directory`), and the user-facing `name`; all three are required. It returns the App `tabId`. The generated operation help is authoritative for the validated schema. Generic snapshot, extract, screenshot, click, type, select, scroll, and wait operations belong to Penkra tabs, not Explorer.

## When things fail

An unknown or expired handle means the resource must be reopened through Penkra; do not retry with a guessed ID. A kind mismatch means the caller described a file as a directory or vice versa. A preview failure does not authorize reading outside the granted handle. Report the handle-safe error and retain the exact resource name and returned tab ID for recovery.
