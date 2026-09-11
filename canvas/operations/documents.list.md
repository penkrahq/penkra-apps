# Finding documents

This resolves the exact `documentId` that every other Canvas operation requires. Titles are not
identifiers: they repeat, they change, and several documents in one Account are commonly called
`design` or `Untitled`.

`query` filters on title, case-insensitively. Omit it to see everything the user can reach, which is
usually the better first move when you do not already know the title.

Each entry reports `access` as `owner` or `editor`. Only an owner can share, unshare, or trash a
document; an editor can change content. `module` identifies whether the document is generic,
deck, web, or mobile work; it is `null` only when an older stored projection does not expose that
field. `updatedAt` and `lastOpenedAt` are the reliable way to tell
several similarly named documents apart, and `lastOpenedAt` is usually what the user means by
"the one I was just in".

When more than one document matches what the user described, ask which. Opening or editing the
wrong document is worse than a question, and title similarity is not evidence.

Resolve the ID here rather than remembering one from earlier in the conversation, and never
reconstruct an ID from memory: copy it from this result.
