# Reading current access

This lists every editor and pending grant on one document you own. It is the way to answer who can
see a document, and the way to resolve the `grantId` that `sharing.remove` requires.

Each entry carries the grant `id`, the `email` it was issued to, an `accountId` once the person has
an Account attached, and a `status`:

- `active` — that Account has signed in and holds editor access now;
- `pending` — access is already granted and takes effect when that address signs in.

**Pending does not mean awaiting approval, and it does not mean unshared.** Both states are live
access. Describe them to the user in those terms rather than implying one is provisional.

The list covers documents the user owns. A document shared *with* the user reports `access: editor`
in `documents.list` and its grants belong to its owner.

Read this before changing access, and read it again rather than reusing an earlier result: grants
change outside this conversation, and a stale grant ID can revoke the wrong person.
