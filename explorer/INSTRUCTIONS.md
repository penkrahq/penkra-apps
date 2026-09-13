# Explorer

Explorer browses, searches, previews, and manages local files. A trusted Node controller does the
filesystem work; the sandboxed tab handles presentation and interaction.

## Paths come from the host

Explorer works on absolute paths supplied by a trusted open flow. Use the exact path the host gave
you. When a path is missing, has moved, or no longer exists, re-establish it through that flow
rather than guessing a replacement — a plausible-looking path is not the same file, and Explorer
cannot tell the difference.

A filesystem path and a Penkra `tabId` are different identifiers. A visible Explorer tab has its own
tab ID; it is not a path, and neither substitutes for the other.

## Opening things

Use `penkra open` when the user gives a path or URL, so the Space's configured handler decides where
it goes. Opening a file shows its containing directory with the file selected, so the user keeps the
surrounding context — which is usually why they asked.

`explorer resources.open` opens one exact path directly and returns its tab ID. Reach for it when
Explorer is specifically what the user wants.

## What it can do

Explorer edits supported text files, previews common text, image, and PDF formats, and reveals
entries in Finder.

Preview support tells you a file can be displayed. It is not permission to open a different file
than the one requested.
