import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";
import { preflightPdfx4 } from "./pdfx-preflight.mjs";

const CONTENT_CODES = new Set([
  "CONTENT_OPERATOR_OUTSIDE_SUBSET", "CONTENT_OPERANDS_INVALID", "CONTENT_SYNTAX_INVALID_OR_UNSUPPORTED",
  "CONTENT_RESOURCE_UNRESOLVED", "CONTENT_RESOURCE_TYPE_INVALID", "CONTENT_RESOURCE_SUBTYPE_INVALID",
  "FORM_XOBJECT_OUTSIDE_SUBSET", "GRAPHICS_STATE_UNDERFLOW", "GRAPHICS_STATE_UNBALANCED",
  "TEXT_OBJECT_NESTED", "TEXT_OBJECT_UNDERFLOW", "TEXT_OBJECT_UNCLOSED", "TEXT_OPERATOR_OUTSIDE_TEXT",
  "MARKED_CONTENT_UNDERFLOW", "MARKED_CONTENT_UNCLOSED",
]);

const contentIssues = (report) => report.issues
  .filter((issue) => CONTENT_CODES.has(issue.code))
  .map(({ code, object }) => ({ code, object }));

function addResourceCategory(resources, category, pdf) {
  const dictionary = pdf.context.obj({});
  resources.set(PDFName.of(category), dictionary);
  return dictionary;
}

function installResources(pdf, page, kind) {
  const resources = pdf.context.obj({});
  if (kind === "missing-gs") {
    page.node.set(PDFName.of("Resources"), pdf.context.register(resources));
    return;
  }
  if (kind === "wrong-type-gs") {
    addResourceCategory(resources, "ExtGState", pdf).set(PDFName.of("GS"), PDFString.of("not-a-dictionary"));
  } else if (kind === "valid-image") {
    const image = pdf.context.register(pdf.context.stream(new Uint8Array([0]), {
      Type: "XObject", Subtype: "Image", Width: 1, Height: 1, ColorSpace: "DeviceGray", BitsPerComponent: 8,
    }));
    addResourceCategory(resources, "XObject", pdf).set(PDFName.of("Im"), image);
  } else if (kind === "form-xobject") {
    const form = pdf.context.register(pdf.context.stream(new Uint8Array(), { Type: "XObject", Subtype: "Form" }));
    addResourceCategory(resources, "XObject", pdf).set(PDFName.of("Form"), form);
  } else if (kind === "wrong-type-font") {
    addResourceCategory(resources, "Font", pdf).set(PDFName.of("F1"), pdf.context.obj({ Type: "ExtGState" }));
  } else if (kind === "missing-properties") {
    addResourceCategory(resources, "Properties", pdf);
  }
  page.node.set(PDFName.of("Resources"), pdf.context.register(resources));
}

async function serializedFixture(fixture, { compressed, objectStreams }) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([200, 300]);
  page.setTrimBox(9, 9, 182, 282);
  page.setBleedBox(0, 0, 200, 300);
  if (fixture.resources) installResources(pdf, page, fixture.resources);
  const contents = fixture.streams ?? [fixture.content];
  const streams = contents.map((content) => {
    const bytes = new TextEncoder().encode(content);
    const stream = compressed ? pdf.context.flateStream(bytes) : pdf.context.stream(bytes);
    return pdf.context.register(stream);
  });
  page.node.set(PDFName.of("Contents"), streams.length === 1 ? streams[0] : pdf.context.obj(streams));
  return pdf.save({ useObjectStreams: objectStreams });
}

const corpus = [
  {
    name: "valid-balanced-q-Q",
    content: "q Q",
    expected: [],
  },
  {
    name: "valid-balanced-BT-ET",
    content: "BT ET",
    expected: [],
  },
  {
    name: "invalid-cm-arity",
    content: "1 0 0 1 cm",
    expected: [{ code: "CONTENT_OPERANDS_INVALID", object: "Page[0]/Contents[0]/cm" }],
  },
  {
    name: "invalid-TJ-nested-member",
    content: "[(ok) [1]] TJ",
    expected: [{ code: "CONTENT_OPERANDS_INVALID", object: "Page[0]/Contents[0]/TJ" }],
  },
  {
    name: "unknown-operator",
    content: "Unknown",
    expected: [{ code: "CONTENT_OPERATOR_OUTSIDE_SUBSET", object: "Page[0]/Contents[0]/Unknown" }],
  },
  {
    name: "missing-gs-resource",
    content: "/Missing gs",
    resources: "missing-gs",
    expected: [{ code: "CONTENT_RESOURCE_UNRESOLVED", object: "Page[0]/Contents[0]/gs" }],
  },
  {
    name: "wrong-type-gs-resource",
    content: "/GS gs",
    resources: "wrong-type-gs",
    expected: [{ code: "CONTENT_RESOURCE_TYPE_INVALID", object: "Page[0]/Contents[0]/gs" }],
  },
  {
    name: "valid-image-Do",
    content: "/Im Do",
    resources: "valid-image",
    expected: [],
  },
  {
    name: "form-Do-outside-subset",
    content: "/Form Do",
    resources: "form-xobject",
    expected: [
      { code: "FORM_XOBJECT_OUTSIDE_SUBSET", object: "Page[0]/Contents[0]/Do" },
      { code: "FORM_XOBJECT_OUTSIDE_SUBSET", object: "Page[0]/Resources/XObject/Form" },
    ],
  },
  {
    name: "wrong-type-Font-Tf",
    content: "BT /F1 12 Tf ET",
    resources: "wrong-type-font",
    expected: [{ code: "CONTENT_RESOURCE_TYPE_INVALID", object: "Page[0]/Contents[0]/Tf" }],
  },
  {
    name: "missing-Properties-BDC",
    content: "/Span /Missing BDC EMC",
    resources: "missing-properties",
    expected: [{ code: "CONTENT_RESOURCE_UNRESOLVED", object: "Page[0]/Contents[0]/BDC" }],
  },
  {
    name: "valid-marked-content-across-three-streams",
    streams: ["/Artifact BMC", "% middle stream", "EMC"],
    expected: [],
  },
  {
    name: "graphics-underflow",
    content: "Q",
    expected: [{ code: "GRAPHICS_STATE_UNDERFLOW", object: "Page[0]/Contents[0]/Q" }],
  },
  {
    name: "text-nesting",
    content: "BT BT ET",
    expected: [{ code: "TEXT_OBJECT_NESTED", object: "Page[0]/Contents[0]/BT" }],
  },
  {
    name: "unclosed-marked-content",
    content: "/Artifact BMC",
    expected: [{ code: "MARKED_CONTENT_UNCLOSED", object: "Page[0]" }],
  },
];

assert.equal(corpus.length, 15);

for (const fixture of corpus) {
  for (const compressed of [false, true]) {
    for (const objectStreams of [false, true]) {
      const compressionName = compressed ? "flate-contents" : "raw-contents";
      const objectStreamName = objectStreams ? "object-streams" : "classic-xref";
      test(`serialized corpus ${fixture.name} ${compressionName} ${objectStreamName}`, async () => {
        const bytes = await serializedFixture(fixture, { compressed, objectStreams });
        const beforeHash = createHash("sha256").update(bytes).digest("hex");
        const loaded = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
        assert.equal(loaded.getPageCount(), 1, `${fixture.name} reload`);
        const first = await preflightPdfx4(bytes);
        const firstIssues = contentIssues(first);
        assert.deepEqual(firstIssues, fixture.expected, `${fixture.name} first validation`);
        const second = await preflightPdfx4(bytes);
        assert.deepEqual(contentIssues(second), firstIssues, `${fixture.name} repeated validation order`);
        const afterHash = createHash("sha256").update(bytes).digest("hex");
        assert.equal(afterHash, beforeHash, `${fixture.name} input bytes mutated`);
      });
    }
  }
}

test("serialized corpus validations do not leak parser state between different PDFs", async () => {
  const valid = await serializedFixture(corpus[0], { compressed: true, objectStreams: true });
  const invalid = await serializedFixture(corpus[12], { compressed: false, objectStreams: false });
  const validBefore = contentIssues(await preflightPdfx4(valid));
  const invalidIssues = contentIssues(await preflightPdfx4(invalid));
  const validAfter = contentIssues(await preflightPdfx4(valid));
  assert.deepEqual(validBefore, []);
  assert.deepEqual(invalidIssues, corpus[12].expected);
  assert.deepEqual(validAfter, validBefore);
});

