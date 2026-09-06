import { PDFHeader, PDFWriter } from "pdf-lib";

// pdf-lib's save() ignores context.header and always constructs a 1.7 header.
// Use its ordinary object/xref serializer with an explicit 1.6 header. This
// selects serialization syntax only: the PDF/X preflight must still verify the
// object graph, colour management, fonts, metadata, and all other constraints.
class Pdf16Writer extends PDFWriter {
  async computeBufferSize() {
    const layout = await super.computeBufferSize();
    const header = PDFHeader.forVersion(1, 6);
    if (header.sizeInBytes() !== layout.header.sizeInBytes()) {
      throw new Error("PDF header size changed; cross-reference offsets require recomputation.");
    }
    return { ...layout, header };
  }
}

export async function serializePdf16(document) {
  await document.flush();
  return new Pdf16Writer(document.context, 50).serializeToBuffer();
}
