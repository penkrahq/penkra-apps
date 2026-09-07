import { capabilityTableFor } from "./capability-tables.mjs";
import { assertCapabilityTotality } from "./canvas-schema.mjs";

// Release availability is separate from fidelity evidence. Mobile candidates
// remain intact for development, but cannot be invoked through the public API.
export const RELEASE_EXPORT_FORMATS = Object.freeze(["pptx", "html"]);

export function assertExportAvailable(format) {
  if (RELEASE_EXPORT_FORMATS.includes(format)) return;
  const error = new Error(
    "Native SwiftUI/Compose export is temporarily unavailable pending fidelity verification. Mobile designs remain editable and can be extracted as PNG, SVG, or PDF.",
  );
  error.code = "CANVAS_EXPORT_FORMAT_UNAVAILABLE";
  error.format = format;
  throw error;
}

export function assertReleaseExportCapabilities() {
  for (const format of RELEASE_EXPORT_FORMATS) {
    assertCapabilityTotality(capabilityTableFor(format));
  }
  return true;
}
