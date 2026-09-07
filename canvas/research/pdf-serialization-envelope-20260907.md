# Classic serialization envelope verification

Candidate `ccd2a06` adds a non-repairing byte-level envelope inspector and device-free tests.
It is not connected to export or preflight and does not establish PDF/X conformance.
The owning Canvas TODO remains the planning authority.

The supported subset contains one classic cross-reference section, generation-zero live
objects, direct stream lengths, and no incremental updates or object streams. The inspector
checks offsets against actual object headers, decoded duplicate dictionary keys, references,
stream boundaries, original object-number spelling, name bytes, and the terminal trailer.
Unsupported serialization forms return an explicit negative verification result rather than
being repaired or represented as verified.

The cross-reference entry grammar follows the [Adobe PDF 1.6 reference, section 3.4.3](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/pdfreference1.6.pdf).
This check intentionally covers a narrower serialization subset, not every legal PDF file.
Semantic validity of fonts, images, metadata, page content, and output conditions remains separate.

Command at the candidate revision:

`node scripts/test.mjs src/exporters/pdf-serialization-envelope.test.mjs`

Result: exit 0; 10 passed; zero failed, cancelled, or skipped. The tests include an actual
pdf-lib classic serialization with a compressed content stream and malformed byte fixtures.
Input bytes remain unchanged. No artifact files, native builds, capabilities, or publication
gates were changed.
# Stream-extent follow-up

Independent review observed acceptance when a declared unfiltered payload includes
the final LF. That alone is not malformed: PDF 1.6 section 3.2.7/Table 3.4 permits
an optional additional EOL outside the stream data. The stream's declared length
can instead include that LF as data; semantic consumers are checked separately.
Source: [Adobe PDF 1.6 reference](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/pdfreference1.6.pdf).

Root inspection found a different concrete defect: the ordinary token reader
skipped arbitrary whitespace/comments after the declared extent. A new regression
failed before the fix (10 pass, 1 fail), then passed after replacing that boundary
with an exact `endstream` match after at most one optional EOL (11 pass, 0 fail,
0 cancelled, 0 skipped). Fixtures reject extra spaces, tabs, multiple EOLs and
comments while retaining no-EOL, LF, CR, CRLF and declared-final-LF cases.
