/** Build the same minimal valid document for UI and operation-driven creation. */
export function createBlankDocumentSource({ id = crypto.randomUUID() } = {}) {
  return {
    // OpenPencil's file parser currently requires this format marker. It is a
    // private serialization detail, not a caller-selected Canvas model version.
    version: "2.15",
    children: [
      {
        id,
        type: "frame",
        name: "Frame",
        x: 120,
        y: 100,
        width: 720,
        height: 480,
        fill: "#ffffff",
        children: [],
      },
    ],
  };
}
