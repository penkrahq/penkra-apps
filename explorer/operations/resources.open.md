# Opening a local resource

Use this operation with one absolute local `path` supplied by the host-open flow.

When the path identifies a file, Explorer opens its containing directory and selects and previews
that file while keeping its siblings visible.

The result returns the visible Explorer `tabId`. Snapshot that exact tab before claiming what the
preview displayed or interacting with its controls. A missing path requires reopening the resource
through Penkra.
