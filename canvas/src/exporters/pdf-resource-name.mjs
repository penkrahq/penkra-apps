import { PDFDict } from "pdf-lib";

// Content names are returned by readPdfContent as a Latin-1 byte identity
// string. Do not pass them through PDFName.of(): that API treats #HH again as
// an escape and can alias a literal hash resource to another dictionary key.
export function lookupPdfResourceName(dict, resourceName) {
  if (!(dict instanceof PDFDict) || typeof resourceName !== "string") return undefined;
  const target = new Uint8Array(resourceName.length);
  for (let index = 0; index < resourceName.length; index += 1) {
    const code = resourceName.charCodeAt(index);
    if (code > 0xff) return undefined;
    target[index] = code;
  }
  for (const [key, value] of dict.entries()) {
    const bytes = key.asBytes();
    if (bytes.length !== target.length) continue;
    let equal = true;
    for (let index = 0; index < bytes.length; index += 1) {
      if (bytes[index] !== target[index]) {
        equal = false;
        break;
      }
    }
    if (equal) return value;
  }
  return undefined;
}
