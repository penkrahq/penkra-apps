# Atferd installed read-only transport verification

At 2026-09-07 17:13 UTC, the coordinator invoked the installed Canvas public
operation in its existing production context:

```json
{"documentId":"64b13c04-b4c7-4bf5-9c37-2069044b1d55","code":"Print(1);"}
```

The document ID was freshly returned by `canvas documents list` as
`Atferd-Complete-Portal-Redesign`. Public `documents.execute` completed in
13,163 milliseconds measured around the dispatcher call, below the historical
30-second operation deadline.

The exact result contained `changed:false`, `operationId:null`, `sequence:0`,
`prints:[1]`, `result:null`, and empty `touchedNodeIds`, `inspection`, `issues`,
and `screenshots`. The dispatcher reported `tabId:null`.

This supersedes the old timeout observation for this exact current installed
read-only probe. It does not establish document migration, the identity of a
historical projection, complete node/render fidelity, a new package install,
or acceptance of the combined source in Dev1. No document mutation, screenshot,
copy, rename, or migration was requested or reported.
