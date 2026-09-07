# PDF page-tree boundary verification

Root reproduced two malformed variants of the retained PDF/X candidate against
combined preflight: a `/Count` of 999 and a deleted leaf `/Parent` both returned
`verified-canvas-writer-subset` with no issues. The conformant flag stayed false.

The new isolated `inspectPdfPageTree` checks raw links rather than the library's
cached page list. It validates child references, immediate parents, node kinds,
descendant counts, cycles and repeated children. Iterative traversal avoids
recursive page-list traversal. Root-parent presence is excluded from the Canvas
subset. Other PDF and PDF/X checks remain separate; the helper is not yet wired.

Source: [Adobe PDF 1.6, section 3.6.2, Tables 3.26–3.27](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/pdfreference1.6.pdf).

`node --test canvas/src/exporters/pdf-page-tree.test.mjs`: 5 passed, zero
failed/cancelled/skipped. Cases include both serializations, nested trees, invalid
counts/parents, direct/dangling children, repeated leaves, cycles, malformed
fields and input immutability. No native process, generated PDF corpus or
production gate was changed.
