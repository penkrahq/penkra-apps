import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
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

test("a semantic Lucide icon renders its authored round line endings", async () => {
  const document = {
    version: "2.17",
    children: [{
      type: "icon",
      id: "check",
      width: 24,
      height: 24,
      library: "lucide",
      icon: "check",
      fill: "#000000",
    }],
  };
  const [screenshot] = await takeDocumentScreenshots(document, [{ nodeIds: ["check"] }]);
  const ck = await getCanvasKit();
  const image = ck.MakeImageFromEncoded(Buffer.from(screenshot.data, "base64"));
  assert.ok(image, "CanvasKit should decode the Lucide screenshot PNG");
  try {
    const pixels = image.readPixels(0, 0, {
      width: image.width(),
      height: image.height(),
      colorType: ck.ColorType.RGBA_8888,
      alphaType: ck.AlphaType.Unpremul,
      colorSpace: ck.ColorSpace.SRGB,
    });
    assert.equal(image.width(), 26);
    assert.equal(image.height(), 26);
    assert.ok(alphaAt(pixels, image.width(), 20, 6) > 150);
    assert.ok(
      alphaAt(pixels, image.width(), 21, 6) > 150,
      "the final diagonal should extend past its centerline endpoint with a round cap",
    );
  } finally {
    image.delete();
  }
});

test("a partial donut ellipse keeps its inner opening clear instead of filling a chord", async () => {
  const document = {
    version: "2.17",
    children: [{
      type: "ellipse",
      id: "usage-arc",
      width: 16,
      height: 16,
      fill: "#B9BEC9",
      innerRadius: 0.78,
      startAngle: 90,
      sweepAngle: -223,
    }],
  };
  const [screenshot] = await takeDocumentScreenshots(document, [{ nodeIds: ["usage-arc"] }]);
  const ck = await getCanvasKit();
  const image = ck.MakeImageFromEncoded(Buffer.from(screenshot.data, "base64"));
  assert.ok(image, "CanvasKit should decode the partial donut screenshot PNG");
  try {
    const pixels = image.readPixels(0, 0, {
      width: image.width(),
      height: image.height(),
      colorType: ck.ColorType.RGBA_8888,
      alphaType: ck.AlphaType.Unpremul,
      colorSpace: ck.ColorSpace.SRGB,
    });
    assert.ok(pixels, "decoded screenshot should expose RGBA pixels");
    const innerAlpha = alphaAt(pixels, image.width(), 4, 5);
    assert.ok(innerAlpha < 16, `the inner radius should not contain a closing chord (alpha ${innerAlpha})`);
    assert.ok(alphaAt(pixels, image.width(), 14, 5) > 96, "the outer annular arc should remain visible");
    assert.ok(alphaAt(pixels, image.width(), 8, 1) > 96, "Pencil's 90-degree start should begin at the top");
    assert.ok(alphaAt(pixels, image.width(), 4, 0) < 16, "the counter-clockwise convention should not rotate the start toward the upper left");
  } finally {
    image.delete();
  }
});

test("a full donut ellipse preserves its inner opening", async () => {
  const document = {
    version: "2.17",
    children: [{
      type: "ellipse",
      id: "usage-track",
      width: 16,
      height: 16,
      fill: "#23252C",
      innerRadius: 0.78,
    }],
  };
  const [screenshot] = await takeDocumentScreenshots(document, [{ nodeIds: ["usage-track"] }]);
  const ck = await getCanvasKit();
  const image = ck.MakeImageFromEncoded(Buffer.from(screenshot.data, "base64"));
  assert.ok(image, "CanvasKit should decode the full donut screenshot PNG");
  try {
    const pixels = image.readPixels(0, 0, {
      width: image.width(),
      height: image.height(),
      colorType: ck.ColorType.RGBA_8888,
      alphaType: ck.AlphaType.Unpremul,
      colorSpace: ck.ColorSpace.SRGB,
    });
    assert.ok(pixels, "decoded screenshot should expose RGBA pixels");
    assert.ok(alphaAt(pixels, image.width(), 8, 8) < 16, "the full ring center should remain transparent");
    assert.ok(alphaAt(pixels, image.width(), 8, 1) > 96, "the full annular track should remain visible");
  } finally {
    image.delete();
  }
});

test("a multi-path curved Lucide icon renders its complete centerlines", async () => {
  const document = {
    version: "2.17",
    children: [{
      type: "icon",
      id: "refresh",
      width: 24,
      height: 24,
      library: "lucide",
      icon: "refresh-cw",
      fill: "#000000",
    }],
  };
  const [screenshot] = await takeDocumentScreenshots(document, [{ nodeIds: ["refresh"] }]);
  const ck = await getCanvasKit();
  const image = ck.MakeImageFromEncoded(Buffer.from(screenshot.data, "base64"));
  assert.ok(image, "CanvasKit should decode the curved Lucide screenshot PNG");
  try {
    const pixels = image.readPixels(0, 0, {
      width: image.width(),
      height: image.height(),
      colorType: ck.ColorType.RGBA_8888,
      alphaType: ck.AlphaType.Unpremul,
      colorSpace: ck.ColorSpace.SRGB,
    });
    assert.ok(pixels, "decoded screenshot should expose RGBA pixels");
    const rows = new Set();
    const columns = new Set();
    let ink = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] <= 100) continue;
      const pixel = (index - 3) / 4;
      ink += 1;
      columns.add(pixel % image.width());
      rows.add(Math.floor(pixel / image.width()));
    }
    assert.ok(ink > 100);
    assert.ok(rows.size >= 18);
    assert.ok(columns.size >= 18);
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

function alphaAt(pixels, width, x, y) {
  return pixels[(y * width + x) * 4 + 3];
}
