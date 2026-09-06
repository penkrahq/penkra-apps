import { buildCapabilityVerificationIR } from "../src/exporter-ir.mjs";
import { addMobileFontFiles, mobileFontCatalog } from "../src/exporters/mobile-fonts.mjs";
import { exportSwiftUI } from "../src/exporters/mobile.mjs";
import { buildTextDecorationDocument, CANDIDATE_PATHS, CASES, readInterFonts } from "./luna-ios-text-fixture.mjs";

export const EXACT_CASE_IDS = Object.freeze(CASES.map(({ id }) => id).filter((id) => !["case-05", "case-09"].includes(id)));
export const ITALIC_CASE_IDS = Object.freeze(["case-05", "case-09"]);

export function buildTextIR(caseIds = EXACT_CASE_IDS, document = buildTextDecorationDocument()) {
  return buildCapabilityVerificationIR(document, { role: "ios", frames: caseIds }, CANDIDATE_PATHS);
}

export async function readExactFontSources() {
  const fonts = await readInterFonts();
  return { "Inter:400": fonts["Inter-Regular.ttf"], "Inter:700": fonts["Inter-Bold.ttf"] };
}

export function exportExactFontFiles(ir, catalog) {
  const files = exportSwiftUI(ir, { fontCatalog: catalog });
  addMobileFontFiles(files, catalog, "ios");
  return files;
}

export function buildFontCatalog(ir, sources) {
  return mobileFontCatalog(ir, sources);
}
