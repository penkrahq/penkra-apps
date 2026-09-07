# Canvas zero-byte asset read verification

Source commit: `b1a373b` (`canvas/src/canvas-api.mjs`). The `readAsset` range loop now executes
while the declared size remains unread **or** no range has been requested yet. Therefore a size-zero
asset still authenticates through the existing Account GET endpoint at offset 0. A complete empty
response returns `Uint8Array(0)`; backend status errors propagate through the existing request
boundary; an empty incomplete response throws immediately without another request.

The focused transport tests use `createCanvasApi(runtime)` with a fake Account request transport,
immutable asset descriptors, exact encoded project/blob paths, and request counts. They cover zero-byte
success, 403 access denial, 404 missing blob, empty incomplete response, and unchanged one-range and
multi-range nonzero reads.

Verification command:

```text
node --test canvas/src/canvas-api.test.mjs canvas/src/luna-asset-empty-read.test.mjs
```

Result: 25 passed, 0 failed, 0 cancelled, 0 skipped. No upload path, schema, storage, native build,
device, capability table, or protected file was changed.
