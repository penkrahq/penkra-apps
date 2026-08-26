import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import { getCanvasKit } from "../vendor/open-pencil/engine.mjs";
import { takeDocumentScreenshots } from "./document-screenshot.mjs";

test("an exact nested component-instance screenshot includes its overridden text", async () => {
  const document = {
    version: "2.15",
    children: [
      {
        type: "frame",
        id: "component",
        x: 0,
        y: 0,
        reusable: true,
        width: 54,
        height: 20,
        fill: "#f2f2f2",
        cornerRadius: 6,
        padding: [3, 8],
        alignItems: "center",
        children: [{
          type: "text",
          id: "label",
          content: "queued",
          fill: "#111111",
          fontFamily: "Inter",
          fontSize: 11,
          fontWeight: "normal",
        }],
      },
      {
        type: "frame",
        id: "screen",
        x: 100,
        y: 100,
        width: 100,
        height: 60,
        children: [{
          type: "ref",
          id: "chip",
          ref: "component",
          fill: "#e1e1fe",
          descendants: {
            label: { content: "add entity", fill: "#304ffe" },
          },
        }],
      },
    ],
  };
  const [screenshot] = await takeDocumentScreenshots(document, [{ nodeIds: ["chip"] }]);

  assert.equal(screenshot.mimeType, "image/png");
  assert.ok(screenshot.width >= 54);
  assert.ok(screenshot.height >= 20);
  const ck = await getCanvasKit();
  const image = ck.MakeImageFromEncoded(Buffer.from(screenshot.data, "base64"));
  assert.ok(image, "CanvasKit should decode its screenshot PNG");
  try {
    const pixels = image.readPixels(0, 0, {
      width: image.width(),
      height: image.height(),
      colorType: ck.ColorType.RGBA_8888,
      alphaType: ck.AlphaType.Unpremul,
      colorSpace: ck.ColorSpace.SRGB,
    });
    assert.ok(pixels, "decoded screenshot should expose RGBA pixels");
    const blueInk = pixelBounds(pixels, image.width(), ([red, green, blue, alpha]) => (
      alpha > 0 && blue > red + 40 && blue > green + 20
    ));
    const chipFill = pixelBounds(pixels, image.width(), ([red, green, blue, alpha]) => (
      alpha > 200 && red > 200 && green > 200 && blue > 240 && Math.abs(red - green) < 3
    ));
    assert.ok(blueInk.count > 0, "the descendant text override should render inside the instance");
    assert.ok(chipFill.count > 0, "the component-instance fill should render");
    assert.ok(blueInk.minX > chipFill.minX, "the label should retain left padding inside the chip");
    assert.ok(blueInk.maxX < chipFill.maxX, "the instance fill should grow around the overridden label");
    assert.ok(
      Math.abs(centerY(blueInk) - centerY(chipFill)) <= 2,
      `text ink should remain vertically centered in the chip (${JSON.stringify({ blueInk, chipFill })})`,
    );
  } finally {
    image.delete();
  }
});

function pixelBounds(pixels, width, matches) {
  const bounds = { count: 0, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let index = 0; index < pixels.length; index += 4) {
    if (!matches(pixels.subarray(index, index + 4))) continue;
    const pixel = index / 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    bounds.count += 1;
    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.maxY = Math.max(bounds.maxY, y);
  }
  return bounds;
}

function centerY(bounds) {
  return (bounds.minY + bounds.maxY) / 2;
}
