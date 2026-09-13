import fontkit from "@pdf-lib/fontkit";
import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRawStream, PDFRef, decodePDFRawStream } from "pdf-lib";
import { readPdfContent } from "./pdf-content.mjs";

export function inspectPdfxFonts(pdf) {
  const issues = [];
  const add = (code, object, clause = "6.5") => issues.push({ code, clause, object });
  const resolve = (value) => value instanceof PDFRef ? pdf.context.lookup(value) : value;
  const get = (dict, key) => dict instanceof PDFDict ? resolve(dict.get(PDFName.of(key))) : undefined;
  const name = (value) => value instanceof PDFName ? value.decodeText() : undefined;
  const number = (value) => value instanceof PDFNumber ? value.asNumber() : undefined;
  const fonts = new Map();
  function fontFor(dict, path) {
    if (fonts.has(dict)) return fonts.get(dict);
    fonts.set(dict, null);
    if (!(dict instanceof PDFDict) || name(get(dict, "Subtype")) !== "Type0" || name(get(dict, "Encoding")) !== "Identity-H") { add("FONT_ENCODING_OUTSIDE_SUBSET", path); return null; }
    const descendants = get(dict, "DescendantFonts");
    const descendant = descendants instanceof PDFArray && descendants.size() === 1 ? resolve(descendants.get(0)) : null;
    if (!(descendant instanceof PDFDict) || name(get(descendant, "Subtype")) !== "CIDFontType2" || name(get(descendant, "CIDToGIDMap")) !== "Identity") { add("FONT_CID_MAPPING_OUTSIDE_SUBSET", path); return null; }
    const descriptor = get(descendant, "FontDescriptor");
    const program = get(descriptor, "FontFile2");
    if (!(program instanceof PDFRawStream)) { add("FONT_NOT_EMBEDDED", path, "6.5.1"); return null; }
    let font;
    try { font = fontkit.create(decodePDFRawStream(program).decode()); }
    catch { add("FONT_PROGRAM_INVALID", path, "6.5.1"); return null; }
    if (!Number.isInteger(font.numGlyphs) || !Number.isFinite(font.unitsPerEm) || font.unitsPerEm <= 0) { add("FONT_PROGRAM_INVALID", path); return null; }
    const widths = new Map();
    const w = get(descendant, "W");
    const values = w instanceof PDFArray ? w.asArray().map(resolve) : [];
    const defaultWidth = get(descendant, "DW") === undefined ? 1000 : number(get(descendant, "DW"));
    try {
      if (w !== undefined && !(w instanceof PDFArray)) throw new Error("Invalid width array");
      for (let index = 0; index < values.length;) {
        const first = number(values[index++]);
        const next = values[index++];
        if (!Number.isInteger(first) || first < 0 || first > 65535) throw new Error("Invalid CID");
        const set = (cid, width) => {
          if (cid > 65535 || widths.has(cid) || !Number.isFinite(width)) throw new Error("Invalid width");
          widths.set(cid, width);
        };
        if (next instanceof PDFArray) next.asArray().forEach((value, offset) => set(first + offset, number(resolve(value))));
        else {
          const last = number(next), width = number(values[index++]);
          if (!Number.isInteger(last) || last < first || last > 65535) throw new Error("Invalid CID range");
          for (let cid = first; cid <= last; cid += 1) set(cid, width);
        }
      }
      if (!Number.isFinite(defaultWidth)) throw new Error("Invalid default width");
    } catch { add("FONT_WIDTH_TABLE_INVALID", path, "6.5.3"); return null; }
    const result = { font, widths, defaultWidth, checked: new Set(), path };
    fonts.set(dict, result);
    return result;
  }
  function checkString(token, active, path) {
    if (token?.kind !== "string") { add("TEXT_OPERAND_INVALID", path, "6.1"); return; }
    if (!active) { add("TEXT_FONT_UNRESOLVED", path, "6.3"); return; }
    const bytes = token.value;
    if (bytes.length % 2) { add("FONT_CODE_LENGTH_INVALID", path, "6.5.4"); return; }
    for (let index = 0; index < bytes.length; index += 2) {
      const cid = bytes[index] * 256 + bytes[index + 1];
      if (active.checked.has(cid)) continue;
      active.checked.add(cid);
      if (cid === 0) { add("FONT_NOTDEF_USED", active.path, "6.5.2"); continue; }
      if (cid >= active.font.numGlyphs) { add("FONT_GLYPH_MISSING", active.path, "6.5.1"); continue; }
      const glyph = active.font.getGlyph(cid);
      const expected = glyph.advanceWidth * 1000 / active.font.unitsPerEm;
      const declared = active.widths.get(cid) ?? active.defaultWidth;
      // Numerical serialization precision only, not a visual/reflow tolerance.
      if (!Number.isFinite(expected) || Math.abs(expected - declared) > 0.00001) add("FONT_WIDTH_MISMATCH", `${active.path}/CID[${cid}]`, "6.5.3");
    }
  }
  for (const [index, page] of pdf.getPages().entries()) {
    const path = `Page[${index}]`;
    const resources = resolve(page.node.Resources());
    const fontResources = get(resources, "Font");
    const contents = get(page.node, "Contents");
    const streams = contents instanceof PDFArray ? contents.asArray().map(resolve) : contents ? [contents] : [];
    let active = null;
    const stack = [];
    for (const stream of streams) {
      if (!(stream instanceof PDFRawStream)) { add("CONTENT_STREAM_INVALID", path, "6.1"); continue; }
      let operations;
      try { operations = readPdfContent(decodePDFRawStream(stream).decode()); }
      catch { add("CONTENT_SYNTAX_INVALID_OR_UNSUPPORTED", path, "6.1"); continue; }
      for (const { operator, operands } of operations) {
        if (operator === "q") stack.push(active);
        else if (operator === "Q") { if (!stack.length) add("GRAPHICS_STACK_UNDERFLOW", path, "6.1"); else active = stack.pop(); }
        else if (operator === "Tf") {
          if (operands.length !== 2 || operands[0].kind !== "name" || operands[1].kind !== "number") { active = null; add("TEXT_FONT_OPERAND_INVALID", path, "6.1"); }
          else active = fontFor(get(fontResources, operands[0].value), `${path}/Font/${operands[0].value}`);
        } else if (["Tj", "'", '"'].includes(operator)) checkString(operands.at(-1), active, path);
        else if (operator === "TJ") {
          if (operands.length !== 1 || operands[0].kind !== "array") add("TEXT_OPERAND_INVALID", path, "6.1");
          else for (const item of operands[0].value) if (item.kind !== "number") checkString(item, active, path);
        } else if (operator === "Do") {
          const xobject = get(get(resources, "XObject"), operands[0]?.value);
          if (!(xobject instanceof PDFRawStream)) add("XOBJECT_UNRESOLVED", path, "6.3");
          else if (name(get(xobject.dict, "Subtype")) === "Form") add("FONT_FORM_CONTENT_OUTSIDE_SUBSET", path);
        }
      }
    }
    if (stack.length) add("GRAPHICS_STACK_UNBALANCED", path, "6.1");
  }
  return { issues, checkedFonts: [...fonts.values()].filter(Boolean).length, checkedGlyphs: [...fonts.values()].filter(Boolean).reduce((sum, font) => sum + font.checked.size, 0) };
}
