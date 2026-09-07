import assert from "node:assert/strict";
import test from "node:test";
import { buildCapabilityVerificationIR } from "../exporter-ir.mjs";
import { capabilityPathInventory } from "../canvas-schema.mjs";
import { exportCompose, exportSwiftUI } from "./mobile.mjs";

const paths = capabilityPathInventory();

function sourceDocument(role, overrides = {}) {
  return {
    version: "2.17",
    module: "mobile",
    lang: overrides.lang,
    axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [{
      id: "screen", name: "Semantic Screen", type: "frame", role, width: 320, height: 180,
      ...overrides.screen,
      children: overrides.children ?? [],
    }],
  };
}

function ir(role, document) {
  return buildCapabilityVerificationIR(document, { role, frames: ["screen"] }, paths);
}

test("SwiftUI preserves root language, node/run precedence, heading levels, and paragraph text", () => {
  const document = sourceDocument("ios", {
    lang: "en-Latn-US",
    children: [{
      id: "copy", type: "text", x: 10, y: 10, width: 280, height: 120,
      lang: "de-DE", content: "Überschrift\n日本語", headingLevel: 2,
      paragraphs: [{ from: 0, to: 11, headingLevel: 2 }, { from: 11, to: 15 }],
      marks: [],
    }],
  });
  const swift = exportSwiftUI(ir("ios", document)).get("SemanticScreen.swift");
  assert.match(swift, /environment\(\\\.locale, Locale\(identifier: "en-Latn-US"\)\)/u);
  assert.match(swift, /accessibilityHeading\(\.h2\)/u);
  assert.match(swift, /languageIdentifier = "de-DE"/u);
  assert.match(swift, /AttributedString\("Überschrift"\)/u);
  assert.match(swift, /日本語/u);
});

test("SwiftUI gives an explicit run language precedence over the node language", () => {
  const document = sourceDocument("ios", {
    lang: "en-US",
    children: [{
      id: "copy", type: "text", width: 200, height: 40, lang: "de-DE", content: "日本語",
      marks: [{ type: "lang", from: 0, to: 3, value: "ja-JP" }], paragraphs: [{ from: 0, to: 3 }],
    }],
  });
  const swift = exportSwiftUI(ir("ios", document)).get("SemanticScreen.swift");
  assert.match(swift, /languageIdentifier = "ja-JP"/u);
  assert.doesNotMatch(swift, /languageIdentifier = "de-DE"/u);
});

test("SwiftUI emits paragraph alignment when all paragraphs agree and preserves fixed text growth", () => {
  const document = sourceDocument("ios", {
    children: [{
      id: "copy", type: "text", width: 280, height: 80, content: "First\nSecond", textGrowth: "fixed-width-height",
      textAlign: "center", paragraphs: [{ from: 0, to: 6, effectiveAlign: "center" }, { from: 6, to: 12, effectiveAlign: "center" }], marks: [],
    }],
  });
  const swift = exportSwiftUI(ir("ios", document)).get("SemanticScreen.swift");
  assert.match(swift, /multilineTextAlignment\(\.center\)/u);
  assert.match(swift, /frame\(width: 280, height: 80/u);
  assert.match(swift, /Text\("First\\n"\)/u);
});

test("SwiftUI rejects mixed paragraph alignments and unsupported landmark/link-name semantics explicitly", () => {
  const mixed = sourceDocument("ios", { children: [{ id: "copy", type: "text", width: 200, height: 80, content: "A\nB", paragraphs: [{ from: 0, to: 2, align: "start" }, { from: 2, to: 3, align: "end" }] }] });
  assert.throws(() => exportSwiftUI(ir("ios", mixed)), { code: "CANVAS_MOBILE_SEMANTICS_UNSUPPORTED" });
  for (const field of ["landmark", "linkName"]) {
    const document = sourceDocument("ios", { screen: { [field]: field === "landmark" ? "main" : "Open" } });
    assert.throws(() => exportSwiftUI(ir("ios", document)), { code: "CANVAS_MOBILE_SEMANTICS_UNSUPPORTED" });
  }
});

test("SwiftUI preserves mixed run languages with attributed Text values", () => {
  const document = sourceDocument("ios", { children: [{ id: "copy", type: "text", width: 200, height: 40, content: "Hello世界", marks: [{ type: "lang", from: 5, to: 7, value: "ja-JP" }] }] });
  const swift = exportSwiftUI(ir("ios", document)).get("SemanticScreen.swift");
  assert.match(swift, /Text\("Hello"\)/u);
  assert.match(swift, /languageIdentifier = "ja-JP"/u);
  assert.match(swift, /Text\(\{ var value = AttributedString\("世界"\)/u);
});

test("Compose preserves paragraph boundaries, per-paragraph alignment, headings, and unchanged plain text", () => {
  const document = sourceDocument("android", {
    lang: "en-US",
    children: [{
      id: "copy", type: "text", width: 280, height: 100, content: "One\nDeux", fontSize: 20,
      paragraphs: [{ from: 0, to: 4, align: "start", headingLevel: 1 }, { from: 4, to: 8, align: "end" }],
      marks: [],
    }, { id: "plain", type: "text", width: 100, height: 20, content: "Plain", marks: [], paragraphs: [] }],
  });
  const kotlin = exportCompose(ir("android", document)).get("SemanticScreen.kt");
  assert.match(kotlin, /ParagraphStyle\(textAlign = androidx\.compose\.ui\.text\.style\.TextAlign\.Start\)/u);
  assert.match(kotlin, /ParagraphStyle\(textAlign = androidx\.compose\.ui\.text\.style\.TextAlign\.End\)/u);
  assert.match(kotlin, /semantics \{ heading\(\) \}/u);
  assert.match(kotlin, /append\("One\\n"\)/u);
  assert.match(kotlin, /append\("Deux"\)/u);
  assert.match(kotlin, /append\("Plain"\)/u);
  assert.match(kotlin, /localeList = androidx\.compose\.ui\.text\.intl\.LocaleList\(androidx\.compose\.ui\.text\.intl\.Locale\("en-US"\)\)/u);
  assert.doesNotMatch(kotlin, /contentDescription = "One|contentDescription = "Deux/u);
});

test("Compose lowers root, node, and run BCP-47 precedence through SpanStyle localeList", () => {
  const document = sourceDocument("android", {
    lang: "en-US",
    children: [
      { id: "node-language", type: "text", width: 100, height: 20, content: "Bonjour", lang: "fr-FR", paragraphs: [{ from: 0, to: 7 }], marks: [] },
      { id: "run-language", type: "text", width: 100, height: 20, content: "Hello世界", lang: "de-DE", paragraphs: [{ from: 0, to: 7 }], marks: [{ type: "lang", from: 5, to: 7, value: "ja-JP" }] },
    ],
  });
  const kotlin = exportCompose(ir("android", document)).get("SemanticScreen.kt");
  assert.match(kotlin, /LocaleList\(androidx\.compose\.ui\.text\.intl\.Locale\("fr-FR"\)\)/u);
  assert.match(kotlin, /LocaleList\(androidx\.compose\.ui\.text\.intl\.Locale\("de-DE"\)\)/u);
  assert.match(kotlin, /LocaleList\(androidx\.compose\.ui\.text\.intl\.Locale\("ja-JP"\)\)/u);
  assert.doesNotMatch(kotlin, /contentDescription = "Bonjour|contentDescription = "Hello/u);
});

test("mobile rich text preserves delimiter newlines when paragraph ranges exclude them", () => {
  const document = sourceDocument("ios", { children: [{ id: "copy", type: "text", width: 200, height: 40, content: "One\nTwo", paragraphs: [{ from: 0, to: 3 }, { from: 4, to: 7 }], marks: [] }] });
  const swift = exportSwiftUI(ir("ios", document)).get("SemanticScreen.swift");
  assert.match(swift, /Text\("One"\)[\s\S]*Text\("\\n"\)[\s\S]*Text\("Two"\)/u);
  const androidDocument = sourceDocument("android", { children: [{ id: "copy", type: "text", width: 200, height: 40, content: "One\nTwo", paragraphs: [{ from: 0, to: 3 }, { from: 4, to: 7 }], marks: [] }] });
  const kotlin = exportCompose(ir("android", androidDocument)).get("SemanticScreen.kt");
  assert.match(kotlin, /append\("One"\)[\s\S]*append\("\\n"\)[\s\S]*append\("Two"\)/u);
});

test("heading levels 1 through 6 map to SwiftUI's real accessibility heading API", () => {
  for (const level of [1, 2, 3, 4, 5, 6]) {
    const document = sourceDocument("ios", { children: [{ id: "copy", type: "text", content: `H${level}`, headingLevel: level, paragraphs: [{ from: 0, to: 2, headingLevel: level }], marks: [] }] });
    const swift = exportSwiftUI(ir("ios", document)).get("SemanticScreen.swift");
    assert.match(swift, new RegExp(`accessibilityHeading\\(\\.h${level}\\)`));
  }
});
