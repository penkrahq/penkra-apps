import { capabilityTableFor } from "./capability-tables.mjs";
import { assertCapabilityTotality } from "./canvas-schema.mjs";

// Release availability is separate from native fidelity. A format is public
// once its capability table is total: unsupported constructs use the declared
// deterministic raster fallback instead of blocking the deliverable.
export const RELEASE_EXPORT_FORMATS = Object.freeze(["pptx", "html", "swift", "kotlin"]);

export function assertExportAvailable(format) {
  if (RELEASE_EXPORT_FORMATS.includes(format)) return;
  const error = new Error(`Canvas export format ${format} is unavailable.`);
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
