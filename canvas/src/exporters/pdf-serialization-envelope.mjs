// A deliberately narrow, non-repairing serialization check. This does not
// establish PDF/X conformance: semantic object/content checks remain separate.
// The supported envelope is one classic xref section with direct stream lengths,
// no incremental updates, no object streams, and generation-zero live objects.
export function inspectCanvasPdfEnvelope(input) {
  let position = 0;
  const issues = [];
  const fail = (detail, offset = position, unsupported = false) => {
    throw Object.assign(new Error(detail), { envelopeIssue: {
      code: unsupported ? "PDF_SERIALIZATION_OUTSIDE_SUBSET" : "PDF_SERIALIZATION_INVALID",
      clause: "6.1", object: `file@${offset}`, detail,
    } });
  };
  try {
    if (!(input instanceof Uint8Array)) fail("bytes-required");
    const text = Buffer.from(input).toString("latin1");
    const whitespace = (character) => character !== undefined && /[\x00\t\n\f\r ]/u.test(character);
    const delimiter = (character) => character === undefined || whitespace(character) || "()<>[]{}/%".includes(character);
    const skip = () => {
      while (position < text.length) {
        if (whitespace(text[position])) position += 1;
        else if (text[position] === "%") {
          while (position < text.length && !"\r\n".includes(text[position])) position += 1;
        } else break;
      }
    };
    const word = (expected) => {
      skip();
      if (!text.startsWith(expected, position) || !delimiter(text[position + expected.length])) fail(`expected-${expected}`);
      position += expected.length;
    };
    const token = () => {
      skip();
      const start = position;
      while (!delimiter(text[position])) position += 1;
      if (start === position) fail("token-required");
      return text.slice(start, position);
    };
    const integer = () => {
      const value = token();
      if (!/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value))) fail("unsigned-integer-required");
      return Number(value);
    };
    const number = (value, start) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) fail("nonfinite-number", start);
      if (/^[+-]?\d+$/u.test(value)) {
        if (numeric < -2147483648 || numeric > 2147483647) fail("integer-range", start);
      } else if (Math.abs(numeric) > 3.403e38) fail("real-range", start);
      return { kind: "number", value: numeric, integer: /^[+-]?\d+$/u.test(value) };
    };
    const references = [];
    const parse = (depth = 0) => {
      if (depth > 64) fail("nesting-outside-writer-subset", position, true);
      skip();
      const start = position;
      if (text[position] === "/") {
        position += 1;
        const bytes = [];
        while (!delimiter(text[position])) {
          const value = text.charCodeAt(position++);
          if (value === 35) {
            const hex = text.slice(position, position + 2);
            if (!/^[a-fA-F0-9]{2}$/u.test(hex)) fail("name-escape-invalid", position - 1);
            if (/[a-f]/u.test(hex)) fail("name-lowercase-escape-parser-boundary", position - 1, true);
            bytes.push(parseInt(hex, 16)); position += 2;
          } else {
            if (value < 33 || value > 126) fail("unescaped-name-outside-writer-subset", position - 1, true);
            bytes.push(value);
          }
        }
        if (bytes.includes(0)) fail("null-name-byte", start);
        if (bytes.length > 127) fail("name-byte-limit", start);
        // ISO 15930-7:2010 6.6 requires UTF-8 for font/separation names.
        // This writer subset applies that restriction to every object name;
        // other binary PDF names are outside our subset, not universally invalid.
        try { new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes)); }
        catch { fail("name-utf8-outside-writer-subset", start, true); }
        return { kind: "name", value: Buffer.from(bytes).toString("latin1") };
      }
      if (text[position] === "(") {
        position += 1;
        let nesting = 1;
        while (position < text.length && nesting) {
          const character = text[position++];
          if (character === "\\") {
            if (position < text.length) {
              const escaped = text[position++];
              if (escaped === "\r" && text[position] === "\n") position += 1;
            }
          } else if (character === "(") nesting += 1;
          else if (character === ")") nesting -= 1;
        }
        if (nesting) fail("literal-string-unclosed", start);
        return { kind: "string" };
      }
      if (text.startsWith("<<", position)) {
        position += 2;
        const entries = new Map();
        while (true) {
          skip();
          if (text.startsWith(">>", position)) { position += 2; return { kind: "dict", entries }; }
          if (position >= text.length) fail("dictionary-unclosed", start);
          const key = parse(depth + 1);
          if (key.kind !== "name" || entries.has(key.value)) fail("dictionary-key-invalid-or-duplicate", position);
          entries.set(key.value, parse(depth + 1));
        }
      }
      if (text[position] === "<") {
        position += 1;
        while (position < text.length && text[position] !== ">") {
          if (!whitespace(text[position]) && !/[a-fA-F0-9]/u.test(text[position])) fail("hex-string-invalid");
          position += 1;
        }
        if (text[position++] !== ">") fail("hex-string-unclosed", start);
        return { kind: "string" };
      }
      if (text[position] === "[") {
        position += 1;
        const values = [];
        while (true) {
          skip();
          if (text[position] === "]") { position += 1; return { kind: "array", values }; }
          if (position >= text.length) fail("array-unclosed", start);
          values.push(parse(depth + 1));
        }
      }
      const value = token();
      if (["true", "false", "null"].includes(value)) return { kind: value };
      if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/u.test(value)) fail("object-token-invalid", start);
      const parsed = number(value, start);
      const afterNumber = position;
      if (/^\d+$/u.test(value)) {
        skip();
        const refMatch = /^(\d+)[\x00\t\n\f\r ]+R(?=[\x00\t\n\f\r ()<>\[\]{}/%]|$)/u.exec(text.slice(position));
        if (refMatch) {
          const generation = Number(refMatch[1]);
          if (generation !== 0 || parsed.value === 0) fail("reference-outside-writer-subset", start, true);
          position += refMatch[0].length;
          references.push({ id: parsed.value, offset: start });
          return { kind: "ref", id: parsed.value };
        }
      }
      position = afterNumber;
      return parsed;
    };
    if (!/^%PDF-1\.6(?:\r\n|\r|\n)/u.test(text)) fail("header-outside-writer-subset", 0, true);
    const ending = /startxref[\x00\t\n\f\r ]+(\d+)[\x00\t\n\f\r ]+%%EOF[\x00\t\n\f\r ]*$/u.exec(text);
    if (!ending) fail("trailer-ending-invalid", text.length);
    const xrefOffset = Number(ending[1]);
    if (!Number.isSafeInteger(xrefOffset) || xrefOffset < 0 || xrefOffset >= ending.index) fail("startxref-offset-invalid");
    position = xrefOffset;
    if (!text.startsWith("xref", position)) fail("xref-stream-or-offset-outside-subset", position, true);
    word("xref");
    const entries = new Map();
    while (true) {
      skip();
      if (text.startsWith("trailer", position)) break;
      const first = integer();
      const count = integer();
      if (count < 1 || first + count > 8388608 || count > Math.floor(text.length / 20)) fail("xref-subsection-range");
      while (text[position] === " " || text[position] === "\t") position += 1;
      if (text[position] === "\r") { position += 1; if (text[position] === "\n") position += 1; }
      else if (text[position] === "\n") position += 1;
      else fail("xref-subsection-newline");
      for (let index = 0; index < count; index += 1) {
        const entry = /^(\d{10}) (\d{5}) ([nf])(?: \n| \r|\r\n)$/u.exec(text.slice(position, position + 20));
        if (!entry || entries.has(first + index)) fail("xref-entry-invalid-or-duplicate");
        entries.set(first + index, { offset: Number(entry[1]), generation: Number(entry[2]), live: entry[3] === "n" });
        position += 20;
      }
    }
    word("trailer");
    const trailer = parse();
    if (trailer.kind !== "dict") fail("trailer-dictionary-required");
    if (["Prev", "XRefStm", "Encrypt"].some((key) => trailer.entries.has(key))) fail("trailer-feature-outside-subset", position, true);
    skip();
    if (position !== ending.index) fail("trailer-extra-tokens");
    const size = trailer.entries.get("Size");
    if (size?.kind !== "number" || !size.integer || size.value !== entries.size || !entries.has(size.value - 1)
      || [...entries.keys()].some((id) => id >= size.value)) fail("xref-size-mismatch");
    const zero = entries.get(0);
    if (!zero || zero.live || zero.generation !== 65535 || zero.offset !== 0) fail("xref-free-head-outside-subset", xrefOffset, true);
    const live = [...entries].filter(([id]) => id !== 0).sort((a, b) => a[1].offset - b[1].offset);
    let previousEnd = 0;
    for (const [id, entry] of live) {
      if (!entry.live || entry.generation !== 0) fail("xref-generation-or-free-object-outside-subset", entry.offset, true);
      if (entry.offset <= previousEnd || entry.offset >= xrefOffset) fail("object-offset-invalid", entry.offset);
      position = previousEnd;
      skip();
      if (position !== entry.offset) fail("unindexed-bytes-between-objects");
      if (integer() !== id || integer() !== entry.generation) fail("xref-object-identity-mismatch", entry.offset);
      word("obj");
      const value = parse();
      skip();
      if (text.startsWith("stream", position)) {
        if (value.kind !== "dict") fail("stream-dictionary-required");
        if (["ObjStm", "XRef"].includes(value.entries.get("Type")?.value)) fail("object-stream-outside-subset", position, true);
        const length = value.entries.get("Length");
        if (length?.kind !== "number" || !length.integer || length.value < 0) fail("stream-length-outside-subset", position, true);
        word("stream");
        if (text[position] === "\r" && text[position + 1] === "\n") position += 2;
        else if (text[position] === "\n") position += 1;
        else fail("stream-newline-invalid");
        position += length.value;
        if (position > xrefOffset) fail("stream-length-invalid");
        if (text[position] === "\r") { position += 1; if (text[position] === "\n") position += 1; }
        else if (text[position] === "\n") position += 1;
        // Unlike ordinary object tokens, this boundary is defined by Length.
        // Only the single optional EOL above may sit outside the payload.
        if (!text.startsWith("endstream", position) || !delimiter(text[position + 9])) fail("expected-endstream");
        position += 9;
      }
      word("endobj");
      previousEnd = position;
    }
    position = previousEnd; skip();
    if (position !== xrefOffset) fail("unindexed-bytes-before-xref");
    for (const ref of references) if (!entries.get(ref.id)?.live) fail("reference-missing", ref.offset);
    if (trailer.entries.get("Root")?.kind !== "ref") fail("root-reference-required", xrefOffset);
    return { verified: true, serialization: "classic-xref", objectCount: live.length, issues };
  } catch (error) {
    issues.push(error?.envelopeIssue ?? { code: "PDF_SERIALIZATION_INVALID", clause: "6.1", object: `file@${position}`, detail: "inspection-failed" });
    return { verified: false, serialization: "unverified", issues };
  }
}
