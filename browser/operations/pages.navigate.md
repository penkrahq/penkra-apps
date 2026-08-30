# Navigating an existing page

Use this operation to change the URL of an existing page in the explicitly targeted Browser tab.
When the tab contains multiple pages, supply the current exact `pageId`; never substitute the outer
`tabId` or reuse a page ID from another tab.

Navigation invalidates prior page observations and element references. Snapshot the targeted tab
again before interacting. An unknown page or tab requires rediscovering Browser state rather than
guessing an ID.
