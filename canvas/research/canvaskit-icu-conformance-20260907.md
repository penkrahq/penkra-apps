# Packaged CanvasKit ICU conformance

Date: 2026-09-07

The exact CanvasKit WASM loaded by the owned Canvas engine was exercised through its paragraph API. This closes the earlier distinction between merely finding ICU symbols in the binary and observing the required behavior.

- Arabic: `مرحبا` used Noto Naskh Arabic from the owned OpenPencil assets. The joined run measured more than ten pixels narrower than the sum of separately shaped characters, and logical UTF-16 indices occupied strictly descending x positions under RTL direction.
- Emoji: every UTF-16 code unit in `👩🏽‍💻` reported the same `[1, 8)` grapheme range between independent `A` and `B` ranges.
- CJK: the narrow-width `你好世界你好世界` fixture broke at UTF-16 indices 2, 4, 6, and 8.
- Thai: `ภาษาไทยทดสอบการตัดคำ` broke at indices 4, 7, 12, 15, 18, and 20, matching its six lexical segments.

Command:

```text
node --test src/canvaskit-icu-conformance.test.mjs src/openpencil-artifact.test.mjs
```

Result: 7 passed, 0 failed, 0 cancelled, 0 skipped. The companion artifact test also confirms `ParagraphBuilder.RequiresClientICU() === false` and the retained `icudt74l` symbol. These tests establish paragraph shaping, bidi placement, grapheme segmentation, and line-breaking behavior for the bounded corpus; they are not a claim that every font covers every Unicode character.
