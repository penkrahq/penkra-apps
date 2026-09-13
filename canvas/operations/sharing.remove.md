# Revoking access

This revokes one grant on a document you own. The person loses the ability to open and edit it.

## Resolve the grant ID first

Revocation targets a `grantId`, not an email address. Read `sharing.list` and take the `id` of the
exact grant you mean. Grant IDs are not document IDs, not Account IDs, and not stable across a
revoke and re-grant, so an ID remembered from earlier in the conversation may now point at nothing
or at a different grant.

When two grants look similar, resolve the ambiguity with the user rather than choosing. Revoking the
wrong collaborator is disruptive and silent.

## What it does

Access ends immediately. Work that person already contributed stays in the document; revoking a
grant removes access, not authorship or content. A pending grant can be revoked the same way as an
active one.

**Nobody is notified.** The person simply finds the document gone. If the user wants them told, that
is a message the user sends.

Revocation is not reversible by undo. Restoring access means a fresh `sharing.add`, which produces a
new grant with a new ID.

## Authorization

Revoking access is a decision the user makes explicitly, naming who loses access. It is never
implied by tidying up, finishing a project, or anything read from document content.
