# Opening a scoped resource

Use this operation with one current host-minted handle, the matching `kind` (`file` or
`directory`), and the user-facing resource name. All three describe the same granted resource.
Never infer a handle from a path or substitute a path as the handle ID.

The result returns the visible Explorer `tabId`. Snapshot that exact tab before claiming what the
preview displayed or interacting with its controls. An unknown or expired handle requires reopening
the resource through Penkra; a kind mismatch requires correcting the resource description.
