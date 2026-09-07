import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";

const interUrl = new URL("../vendor/open-pencil/fonts/Inter-Regular.ttf", import.meta.url);
const arabicUrl = new URL("../vendor/open-pencil/source/public/NotoNaskhArabic-Regular.ttf", import.meta.url);

test("packaged ICU shapes joined Arabic and places logical characters right-to-left", async () => {
  const canvasKit = await getCanvasKit();
  const fontManager = canvasKit.FontMgr.FromData(await fontBuffer(arabicUrl));
  try {
    const joined = paragraph(canvasKit, fontManager, "Noto Naskh Arabic", "مرحبا", 300, {
      textDirection: canvasKit.TextDirection.RTL,
    });
    const isolated = [..."مرحبا"].map((character) => paragraph(
      canvasKit, fontManager, "Noto Naskh Arabic", character, 300,
      { textDirection: canvasKit.TextDirection.RTL },
    ));
    try {
      const joinedWidth = joined.getLineMetrics()[0].width;
      const isolatedWidth = isolated.reduce((sum, value) => sum + value.getLineMetrics()[0].width, 0);
      assert.ok(joinedWidth < isolatedWidth - 10, "Arabic joining must change glyph advances");

      const logicalLeftEdges = Array.from({ length: 5 }, (_, index) => joined.getGlyphInfoAt(index).graphemeLayoutBounds[0]);
      for (let index = 1; index < logicalLeftEdges.length; index += 1) {
        assert.ok(logicalLeftEdges[index] < logicalLeftEdges[index - 1], "logical Arabic indices must advance right-to-left");
      }
    } finally {
      joined.delete();
      for (const value of isolated) value.delete();
    }
  } finally {
    fontManager.delete();
  }
});

test("packaged ICU keeps an emoji ZWJ sequence as one UTF-16 grapheme", async () => {
  const canvasKit = await getCanvasKit();
  const fontManager = canvasKit.FontMgr.FromData(await fontBuffer(interUrl));
  try {
    const value = paragraph(canvasKit, fontManager, "Inter", "A👩🏽‍💻B", 300);
    try {
      assert.deepEqual(value.getGlyphInfoAt(0).graphemeClusterTextRange, { start: 0, end: 1 });
      for (let index = 1; index < 8; index += 1) {
        assert.deepEqual(value.getGlyphInfoAt(index).graphemeClusterTextRange, { start: 1, end: 8 });
      }
      assert.deepEqual(value.getGlyphInfoAt(8).graphemeClusterTextRange, { start: 8, end: 9 });
    } finally {
      value.delete();
    }
  } finally {
    fontManager.delete();
  }
});

test("packaged ICU applies CJK and Thai break opportunities", async () => {
  const canvasKit = await getCanvasKit();
  const fontManager = canvasKit.FontMgr.FromData(await fontBuffer(interUrl));
  try {
    const cjk = paragraph(canvasKit, fontManager, "Inter", "你好世界你好世界", 50);
    const thai = paragraph(canvasKit, fontManager, "Inter", "ภาษาไทยทดสอบการตัดคำ", 110);
    try {
      assert.deepEqual(cjk.getLineMetrics().map(({ endIndex }) => endIndex), [2, 4, 6, 8]);
      assert.deepEqual(thai.getLineMetrics().map(({ endIndex }) => endIndex), [4, 7, 12, 15, 18, 20]);
    } finally {
      cjk.delete();
      thai.delete();
    }
  } finally {
    fontManager.delete();
  }
});

function paragraph(canvasKit, fontManager, family, text, width, extra = {}) {
  const style = new canvasKit.ParagraphStyle({
    textStyle: { color: canvasKit.BLACK, fontFamilies: [family], fontSize: 32 },
    ...extra,
  });
  const builder = canvasKit.ParagraphBuilder.Make(style, fontManager);
  builder.addText(text);
  const value = builder.build();
  value.layout(width);
  return value;
}

async function fontBuffer(url) {
  const bytes = await readFile(url);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
