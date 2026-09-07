# PDF writer name encoding verification

Completed source/test change: `9ef9885`.

ISO 15930-7:2010 section 6.6 requires font and separation names to decode as UTF-8 and requires hexadecimal escaping for bytes outside printable ASCII. The existing serialization envelope checked escaping but accepted escaped invalid UTF-8. The Canvas writer subset now rejects invalid UTF-8 in every parsed object name as `PDF_SERIALIZATION_OUTSIDE_SUBSET`, without claiming that every binary name is invalid in general PDF. Decoded byte identity and duplicate-key comparison remain unchanged.

Source: [ISO 15930-7:2010, section 6.6, printed page 12](https://previewnorm.com/iso/ISO%2015930-7-2010%20PDF.pdf).

Tests include overlong encodings, surrogate encodings, out-of-range code points, lone continuation bytes, truncated sequences, valid multibyte names and duplicate escaped identities. Existing compressed stream payload checks remain passing; stream payloads are not misinterpreted as object names.

Command: `node --test canvas/src/exporters/pdf-serialization-envelope.test.mjs canvas/src/exporters/pdf-page-tree.test.mjs`.

Result: exit 0; 17 passed, zero failed/cancelled/skipped. `git diff --check` passed. No conformance gate, profile, capability, protected document or native runtime changed. This is object-envelope coverage, not a complete PDF/X certification or content-stream lexical claim. The Canvas TODO remains the planning authority.
