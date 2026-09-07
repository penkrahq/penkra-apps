import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRawStream } from "pdf-lib";

export const PDF_ARCHITECTURAL_LIMITS = Object.freeze({
  nameBytes: 127,
  contentStringBytes: 32767,
  qDepth: 28,
  indirectObjects: 8388607,
  integerMinimum: -2147483648,
  integerMaximum: 2147483647,
  realMaximum: 3.403e38,
});

export function inspectIndirectObjectCount(count, path, add) {
  if (count > PDF_ARCHITECTURAL_LIMITS.indirectObjects) {
    addLimit(add, path, "indirect-object-count", count, PDF_ARCHITECTURAL_LIMITS.indirectObjects);
  }
}

export function inspectPdfNumber(value, path, add) {
  if (!(value instanceof PDFNumber)) return;
  const number = value.asNumber();
  const spelling = typeof value.stringValue === "string" ? value.stringValue : value.toString();
  if (/^[+-]?\d+$/u.test(spelling)) {
    if (!Number.isFinite(number) || number < PDF_ARCHITECTURAL_LIMITS.integerMinimum || number > PDF_ARCHITECTURAL_LIMITS.integerMaximum) {
      addLimit(add, path, "integer-range", spelling, `${PDF_ARCHITECTURAL_LIMITS.integerMinimum}..${PDF_ARCHITECTURAL_LIMITS.integerMaximum}`);
    }
  } else if (!Number.isFinite(number) || Math.abs(number) > PDF_ARCHITECTURAL_LIMITS.realMaximum) {
    addLimit(add, path, "real-range", spelling, `±${PDF_ARCHITECTURAL_LIMITS.realMaximum}`);
  }
}

export function inspectPdfObjectLimits(raw, path, { resolve, add, seen = new Set() }) {
  const visit = (candidate, candidatePath) => {
    let value;
    try { value = resolve(candidate); } catch { return; }
    if (!value) return;
    if (value instanceof PDFName) {
      const length = value.asBytes().byteLength;
      if (length > PDF_ARCHITECTURAL_LIMITS.nameBytes) addLimit(add, candidatePath, "name-bytes", length, PDF_ARCHITECTURAL_LIMITS.nameBytes);
      return;
    }
    if (value instanceof PDFNumber) {
      inspectPdfNumber(value, candidatePath, add);
      return;
    }
    if (seen.has(value)) return;
    seen.add(value);
    if (value instanceof PDFArray) {
      value.asArray().forEach((item, index) => visit(item, `${candidatePath}[${index}]`));
      return;
    }
    const dict = value instanceof PDFRawStream ? value.dict : value;
    if (!(dict instanceof PDFDict)) return;
    for (const [key, item] of dict.entries()) {
      const keyText = key instanceof PDFName ? key.decodeText() : key.toString();
      if (key instanceof PDFName) {
        const length = key.asBytes().byteLength;
        if (length > PDF_ARCHITECTURAL_LIMITS.nameBytes) addLimit(add, `${candidatePath}/${keyText}`, "name-bytes", length, PDF_ARCHITECTURAL_LIMITS.nameBytes);
      }
      visit(item, `${candidatePath}/${keyText}`);
    }
  };
  visit(raw, path);
  return seen;
}

export function inspectContentValueLimits(operations, path, add) {
  const visit = (value, valuePath) => {
    if (!value || typeof value !== "object") return;
    if (value.kind === "string") {
      const length = value.value?.byteLength ?? 0;
      if (length > PDF_ARCHITECTURAL_LIMITS.contentStringBytes) addLimit(add, valuePath, "content-string-bytes", length, PDF_ARCHITECTURAL_LIMITS.contentStringBytes);
      return;
    }
    if (Array.isArray(value.value)) value.value.forEach((item, index) => visit(item, `${valuePath}[${index}]`));
  };
  operations.forEach((operation, operationIndex) => {
    const operationPath = `${path}/${operation.operator}[${operationIndex}]`;
    operation.operands.forEach((operand, operandIndex) => visit(operand, `${operationPath}[${operandIndex}]`));
  });
}

// readPdfContent intentionally exposes numeric values, not original spellings.
// This small lexical pass preserves the integer/real distinction for Table C.1
// without changing the established content parser contract.
export function inspectContentNumberSpellings(input, path, add) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let cursor = 0;
  let numberIndex = 0;
  const white = (value) => [0, 9, 10, 12, 13, 32].includes(value);
  const delimiter = (value) => white(value) || [40, 41, 60, 62, 91, 93, 123, 125, 47, 37].includes(value);
  const tokenText = (start, end) => String.fromCharCode(...bytes.subarray(start, end));
  const skip = () => {
    while (cursor < bytes.length) {
      if (white(bytes[cursor])) cursor += 1;
      else if (bytes[cursor] === 37) while (cursor < bytes.length && ![10, 13].includes(bytes[cursor])) cursor += 1;
      else break;
    }
  };
  const scan = (depth = 0) => {
    if (depth > 64) throw new Error("content nesting");
    skip();
    const start = cursor;
    const first = bytes[cursor++];
    if (first === undefined) return;
    if (first === 47) {
      while (cursor < bytes.length && !delimiter(bytes[cursor])) cursor += 1;
      return;
    }
    if (first === 40) {
      let nesting = 1;
      while (cursor < bytes.length && nesting) {
        const value = bytes[cursor++];
        if (value === 92) {
          if (cursor < bytes.length) cursor += 1;
          if (bytes[cursor - 1] === 13 && bytes[cursor] === 10) cursor += 1;
        } else if (value === 40) nesting += 1;
        else if (value === 41) nesting -= 1;
      }
      if (nesting) throw new Error("content string");
      return;
    }
    if (first === 60) {
      if (bytes[cursor] === 60) {
        cursor += 1;
        while (cursor < bytes.length) {
          skip();
          if (bytes[cursor] === 62 && bytes[cursor + 1] === 62) { cursor += 2; return; }
          scan(depth + 1);
        }
        throw new Error("content dictionary");
      }
      while (cursor < bytes.length && bytes[cursor++] !== 62);
      if (bytes[cursor - 1] !== 62) throw new Error("content hex string");
      return;
    }
    if (first === 91) {
      while (cursor < bytes.length) {
        skip();
        if (bytes[cursor] === 93) { cursor += 1; return; }
        scan(depth + 1);
      }
      throw new Error("content array");
    }
    if (first === 93 || first === 62 || first === 125 || delimiter(first)) return;
    while (cursor < bytes.length && !delimiter(bytes[cursor])) cursor += 1;
    const token = tokenText(start, cursor);
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/u.test(token)) return;
    const number = Number(token);
    const tokenPath = `${path}/number[${numberIndex++}]`;
    if (/^[+-]?\d+$/u.test(token)) {
      if (!Number.isFinite(number) || number < PDF_ARCHITECTURAL_LIMITS.integerMinimum || number > PDF_ARCHITECTURAL_LIMITS.integerMaximum) {
        addLimit(add, tokenPath, "integer-range", token, `${PDF_ARCHITECTURAL_LIMITS.integerMinimum}..${PDF_ARCHITECTURAL_LIMITS.integerMaximum}`);
      }
    } else if (!Number.isFinite(number) || Math.abs(number) > PDF_ARCHITECTURAL_LIMITS.realMaximum) {
      addLimit(add, tokenPath, "real-range", token, `±${PDF_ARCHITECTURAL_LIMITS.realMaximum}`);
    }
  };
  try {
    while (cursor < bytes.length) scan();
  } catch {
    // The established content parser reports malformed syntax. This pass must
    // never replace that diagnostic or make malformed input throw from preflight.
  }
}

function addLimit(add, object, detail, actual, limit) {
  add("PDF_ARCHITECTURAL_LIMIT", "6.25", object, { detail, actual, limit });
}
