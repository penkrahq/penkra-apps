# Library storage protocol verification

Date: 2026-09-07

This is a protocol regression package, not durable-backend acceptance. The
runtime is a persisted in-memory fake implementing the documented
`createCanvasApi` Account request boundary. No user documents, backend, host,
or deployment were accessed.

## Strict selection

Command (exit 0):

```text
node --test src/canvas-api.test.mjs src/luna-library-storage-protocol.test.mjs src/library-storage.test.mjs src/library-publication.test.mjs src/library-publication-service.test.mjs src/library-item-content.test.mjs src/canvas-imports.test.mjs
```

Result: 60 passed, 0 failed, 0 cancelled, 0 skipped.

The new protocol file contributed 12 top-level tests, including 4 nested
upload-stage cases, for 16 passing assertions. It exercised real
`createCanvasApi(runtime)` methods, not direct storage API stubs. The fake
runtime persisted per-project blob maps and implemented multipart start,
parts, complete, content-addressed deduplication, and ranged reads with exact
base64 bytes, sizes, and SHA-256 values.

## Covered cases

- release write/read through a fresh storage adapter and duplicate-content deduplication;
- minimum public closure retention, excluding private nodes, private assets, secret variables, and full source documents;
- two-level dependency resolution with both root and dependency asset copies, while preserving an unrelated consumer blob;
- source deletion after acceptance with consumer-only reads;
- asset-free new-root reauthorization, private-item rejection, dependency-read denial, asset-read denial, and consumer-write denial;
- start, part, complete, and readback failures, with no returned manifest descriptor; orphan uploaded blobs remain possible and no broad cleanup claim is made;
- malformed completion hash/size receipts and missing receipt metadata;
- corrupted, truncated, oversized, malformed, wrong-hash, wrong-path, wrong-size, and wrong-type descriptor inputs;
- caller release/asset mutation during an awaited upload;
- exact caller-path preservation when the backend blob projection omits or supplies a different path;
- unchanged unrelated consumer blob retention.

## Stable-code defect history

Before the authorized API fix, a multipart completion response of `{}`
caused `createCanvasApi.uploadAsset` to throw
`Canvas asset upload completed without blob metadata.` with no `error.code`.
The retained pre-fix assertion failed on that missing stable code.

The authorized narrow fix assigns
`CANVAS_ASSET_UPLOAD_RECEIPT_INVALID` only for a missing/non-object
completion blob. The direct Canvas API regression performs start, two parts,
and complete, then asserts that exact code. The storage matrix asserts the
same code propagates unchanged. Hash and size receipt corruption continues to
return `CANVAS_IMPORT_INTEGRITY`; caller-supplied path normalization remains
unchanged.

Unknown-root authorization races, backend atomicity, orphan cleanup, and
durable revocation semantics remain unverified by this fake protocol runtime.
