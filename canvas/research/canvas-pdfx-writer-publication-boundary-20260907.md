# Canvas PDF/X writer publication boundary

The publication decision applies only inside `exportPdf`, which constructs a
fresh object graph. It does not authorize imported or arbitrary PDF files.
The serialized bytes must pass the existing raw envelope, object/resource,
font, image, colour, metadata, page geometry and architectural-limit checks.
Any issue or missing positive writer-subset verdict rejects publication.

The standalone `preflightPdfx4` report is unchanged: its aggregate
`conformant:false` and limitations are not promoted to a universal validator
claim. No checker, negative fixture, profile identity, or public request shape
is weakened by this boundary change.

ISO distinguishes a writer that produces compliant files from a reader that
processes all compliant files. Unsupported features that the writer cannot
emit are therefore not missing writer functionality. Source: [ISO 15930-7:2010,
clause 5](https://previewnorm.com/iso/ISO%2015930-7-2010%20PDF.pdf).

Decision inputs are the emitted-feature applicability audit (clauses 6.1–6.27),
the actual twelve-case `exportPdf` serialization matrix, and the integrated
negative matrices. The current writer uses the pinned GRACoL2013 CRPC6 printer
profile and sRGB2014 source profile, embedded font programs, native geometry,
and PNG-derived images. This is not an external certification claim.

This record explains the source change, not completed acceptance. Returned
artifact, service publication, rendering, and regression checks must still
verify the revised path before integration approval.

## Isolated render probe

`node scripts/pdfx-writer-render-probe.mjs` exited 0 on the isolated branch.
Both ordinary and PDF/X output rendered with `pdftoppm -r 144 -singlefile -png`,
exit 0 and empty stderr. Both 744 by 504 images were individually inspected:
the text is legible, the even-odd hole remains open, and translucent ellipse
fill/stroke overlap the green rectangle. The PDF/X render has different colour
values from the ordinary output; this probe does not assert colour equality or
printer-proof accuracy. No tolerance or registration adjustment was made.

PDF/X bytes: 2,871,645; SHA-256
`f33f099f650d07450fc74b918861308cff124b06c0596864aaff68846e1992df`.
PDF/X PNG SHA-256:
`f72f1773bf44f6881120e8c3e287e6004905bb250643a0f3982dbabb6b3d707c`.
The temporary receipt directory is
`/var/folders/vb/g066rwxj3mj405k01t_vjkf80000gn/T/canvas-pdfx-writer-render-yHuafS`;
the script creates a fresh directory per run and retains commands/results.
PDF hashes vary with fresh metadata timestamps and IDs.

A separate in-memory physical-size control produced the expected 200 by 100 mm
trim, with a 3-point bleed, zero issues, and positive subset verification.
Its zero-width negative control rejected with `CANVAS_PDF_PROFILE_INVALID`.
Neither probe replaces the broader returned-artifact and publication tests.
