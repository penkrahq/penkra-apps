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
