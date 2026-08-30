# Opening a Browser page

Use this operation when Browser is the intended URL handler. It opens an HTTP(S) URL and returns the
outer Penkra `tabId` together with Browser's internal page state and `pageId`. Preserve both IDs.

Opening a page does not establish what it rendered. Take a fresh snapshot of the returned tab before
visible interaction or claims about page content. If Browser was not chosen, use `penkra open`
instead so the configured handler decides.
