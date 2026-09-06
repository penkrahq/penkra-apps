// Lexical PDF content reader. Strings, names, arrays and dictionaries are parsed
// before operators, so text/comments that resemble operators cannot be executed
// by the validator. This is not a replacement for PDF file/xref parsing.
export function readPdfContent(bytes) {
  if (bytes.length > 16 * 1024 * 1024) throw new Error("Content exceeds checked subset limit");
  let cursor = 0;
  const white = (c) => [0, 9, 10, 12, 13, 32].includes(c);
  const delimiter = (c) => white(c) || [40, 41, 60, 62, 91, 93, 123, 125, 47, 37].includes(c);
  const ascii = (start, end) => Array.from(bytes.subarray(start, end), (c) => String.fromCharCode(c)).join("");
  function skip() {
    while (cursor < bytes.length) {
      if (white(bytes[cursor])) cursor += 1;
      else if (bytes[cursor] === 37) { while (cursor < bytes.length && ![10, 13].includes(bytes[cursor])) cursor += 1; }
      else break;
    }
  }
  function value(depth = 0) {
    if (depth > 64) throw new Error("Content nesting exceeds checked subset limit");
    skip();
    const start = cursor;
    const c = bytes[cursor++];
    if (c === 47) {
      while (cursor < bytes.length && !delimiter(bytes[cursor])) cursor += 1;
      const encoded = ascii(start + 1, cursor);
      if (/#(?![0-9a-fA-F]{2})/u.test(encoded)) throw new Error("Malformed PDF name");
      return { kind: "name", value: encoded.replace(/#([0-9a-fA-F]{2})/gu, (_, hex) => String.fromCharCode(parseInt(hex, 16))) };
    }
    if (c === 40) {
      const output = [];
      let nesting = 1;
      while (cursor < bytes.length) {
        let b = bytes[cursor++];
        if (b === 92) {
          b = bytes[cursor++];
          if (b === undefined) break;
          if (b === 10) continue;
          if (b === 13) { if (bytes[cursor] === 10) cursor += 1; continue; }
          const escape = ({ 110: 10, 114: 13, 116: 9, 98: 8, 102: 12 })[b];
          if (escape !== undefined) output.push(escape);
          else if (b >= 48 && b <= 55) {
            let octal = String.fromCharCode(b);
            for (let i = 0; i < 2 && bytes[cursor] >= 48 && bytes[cursor] <= 55; i += 1) octal += String.fromCharCode(bytes[cursor++]);
            output.push(parseInt(octal, 8) & 255);
          } else output.push(b);
        } else if (b === 40) { nesting += 1; output.push(b); }
        else if (b === 41) { nesting -= 1; if (nesting === 0) return { kind: "string", value: new Uint8Array(output) }; output.push(b); }
        else if (b === 13) { if (bytes[cursor] === 10) cursor += 1; output.push(10); }
        else output.push(b);
      }
      throw new Error("Unterminated PDF string");
    }
    if (c === 60 && bytes[cursor] !== 60) {
      let hex = "";
      while (cursor < bytes.length && bytes[cursor] !== 62) {
        const b = bytes[cursor++];
        if (white(b)) continue;
        if (!/[0-9a-fA-F]/u.test(String.fromCharCode(b))) throw new Error("Malformed hex string");
        hex += String.fromCharCode(b);
      }
      if (bytes[cursor++] !== 62) throw new Error("Unterminated hex string");
      if (hex.length % 2) hex += "0";
      return { kind: "string", value: Uint8Array.from(hex.match(/../gu) ?? [], (pair) => parseInt(pair, 16)) };
    }
    if (c === 91 || (c === 60 && bytes[cursor] === 60)) {
      const dict = c === 60;
      if (dict) cursor += 1;
      const output = [];
      while (cursor < bytes.length) {
        skip();
        if ((!dict && bytes[cursor] === 93) || (dict && bytes[cursor] === 62 && bytes[cursor + 1] === 62)) {
          cursor += dict ? 2 : 1;
          if (dict && (output.length % 2 || output.some((item, i) => i % 2 === 0 && item.kind !== "name"))) throw new Error("Malformed dictionary");
          return { kind: dict ? "dict" : "array", value: output };
        }
        const item = value(depth + 1);
        if (item.kind === "operator") throw new Error("Operator inside composite operand");
        output.push(item);
      }
      throw new Error("Unterminated composite operand");
    }
    if (c === undefined || delimiter(c)) throw new Error("Unexpected content delimiter");
    while (cursor < bytes.length && !delimiter(bytes[cursor])) cursor += 1;
    const token = ascii(start, cursor);
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/u.test(token)) {
      const number = Number(token);
      if (!Number.isFinite(number)) throw new Error("Invalid number");
      return { kind: "number", value: number };
    }
    if (["true", "false", "null"].includes(token)) return { kind: "literal", value: token };
    return { kind: "operator", value: token };
  }
  const operations = [];
  let operands = [];
  while (cursor < bytes.length) {
    skip();
    if (cursor === bytes.length) break;
    const token = value();
    if (token.kind === "operator") {
      operations.push({ operator: token.value, operands }); operands = [];
      if (token.value === "BI") throw new Error("Inline images are outside the Canvas writer subset");
    } else operands.push(token);
  }
  if (operands.length) throw new Error("Dangling operands");
  return operations;
}
