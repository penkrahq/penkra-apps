import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import { rasterizeSvgImage, takeDocumentScreenshots } from "./document-screenshot.mjs";

test("rasterizes SVG geometry into a CanvasKit-decodable PNG", async () => {
  const svg = new TextEncoder().encode(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 8">
      <path fill="#ef4444" d="M0 0h12v8H0z"/>
    </svg>
  `);
  const bytes = await rasterizeSvgImage(svg);
  const ck = await getCanvasKit();
  const image = ck.MakeImageFromEncoded(bytes);
  assert.ok(image, "CanvasKit should decode the rasterized SVG PNG");
  try {
    assert.equal(image.width(), 12);
    assert.equal(image.height(), 8);
    const pixels = image.readPixels(0, 0, {
      width: image.width(),
      height: image.height(),
      colorType: ck.ColorType.RGBA_8888,
      alphaType: ck.AlphaType.Unpremul,
      colorSpace: ck.ColorSpace.SRGB,
    });
    assert.ok(pixels);
    assert.deepEqual([...pixels.subarray(0, 4)], [239, 68, 68, 255]);
  } finally {
    image.delete();
  }
});

test("text uses a color emoji fallback in the screenshot renderer", async () => {
  const [screenshot] = await takeDocumentScreenshots({ version: "2.17", children: [
    { id: "screen", type: "frame", width: 200, height: 80, fill: "#ffffff", children: [
      { id: "label", type: "text", x: 10, y: 10, width: 170, height: 50,
        fontSize: 32, content: "Hello 👋🏽 🌍" },
    ] },
  ] }, [{ nodeIds: ["screen"] }]);
  const ck = await getCanvasKit();
  const image = ck.MakeImageFromEncoded(Buffer.from(screenshot.data, "base64"));
  assert.ok(image);
  try {
    const pixels = image.readPixels(0, 0, { width: image.width(), height: image.height(),
      colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul,
      colorSpace: ck.ColorSpace.SRGB });
    let colored = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const [red, green, blue] = pixels.subarray(index, index + 3);
      if (Math.max(red, green, blue) - Math.min(red, green, blue) > 40) colored++;
    }
    assert.ok(colored > 100, `expected color emoji pixels, found ${colored}`);
  } finally { image.delete(); }
});

test("an image-filled component child appears in a ref screenshot", async () => {
  const source = new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20" fill="#ef4444"/></svg>',
  );
  const png = await rasterizeSvgImage(source);
  const assets = new Map([["images/red.svg", {
    path: "images/red.svg", mimeType: "image/svg+xml", sha256: "f".repeat(64),
    bytes: source, renderBytes: png,
  }]]);
  const [screenshot] = await takeDocumentScreenshots({ version: "2.17", children: [
    { id: "source", type: "frame", reusable: true, width: 20, height: 20, children: [
      { id: "art", type: "rectangle", width: 20, height: 20,
        fill: { type: "image", url: "images/red.svg", mode: "fit" } },
    ] },
    { id: "instance", type: "ref", ref: "source", x: 30 },
  ] }, [{ nodeIds: ["instance"] }], assets);
  const ck = await getCanvasKit();
  const image = ck.MakeImageFromEncoded(Buffer.from(screenshot.data, "base64"));
  assert.ok(image);
  try {
    const pixels = image.readPixels(0, 0, { width: image.width(), height: image.height(),
      colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul,
      colorSpace: ck.ColorSpace.SRGB });
    assert.deepEqual([...pixels.subarray(0, 4)], [239, 68, 68, 255]);
  } finally { image.delete(); }
});

test("an explicit export bound constrains a raster with far-off descendants", async () => {
  const [screenshot] = await takeDocumentScreenshots({
    version: "2.17",
    children: [{
      id: "top",
      type: "frame",
      width: 1280,
      height: 88,
      children: [{
        id: "overflow",
        type: "rectangle",
        x: 30000,
        width: 324,
        height: 88,
        fill: "#ffffff",
      }],
    }],
  }, [{
    nodeIds: ["top"],
    bounds: { minX: 0, minY: 0, maxX: 1280, maxY: 88 },
  }]);

  assert.equal(screenshot.width, 1280);
  assert.equal(screenshot.height, 88);
});

test("screenshot renders nested refs in inherited and overridden appearance modes", async () => {
  const document = {
    version: "2.17",
    axes: { appearance: { modes: [{ name: "light" }, { name: "dark" }] } },
    variables: { bg: { tokenType: "color", cascade: [{ value: "#ffffff" }, { value: "#111214", when: { appearance: "dark" } }] } },
    children: [
      { id: "tile", type: "frame", width: 20, height: 20, fill: "${bg}" },
      { id: "row", type: "frame", width: 20, height: 20, children: [{ id: "nested-tile", type: "ref", ref: "tile" }] },
      { id: "screen", type: "frame", width: 60, height: 20, modes: { appearance: "dark" }, children: [
        { id: "dark-row", type: "ref", ref: "row", layoutPosition: "absolute" },
        { id: "light-row", type: "ref", ref: "row", x: 30, layoutPosition: "absolute", modes: { appearance: "light" } },
      ] },
    ],
  };
  const [screenshot] = await takeDocumentScreenshots(document, [{ nodeIds: ["screen"] }]);
  const ck = await getCanvasKit();
  const image = ck.MakeImageFromEncoded(Buffer.from(screenshot.data, "base64"));
  assert.ok(image);
  try {
    const pixels = image.readPixels(0, 0, {
      width: image.width(), height: image.height(), colorType: ck.ColorType.RGBA_8888,
      alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB,
    });
    const pixel = (x, y) => [...pixels.subarray((y * image.width() + x) * 4, (y * image.width() + x) * 4 + 4)];
    assert.deepEqual(pixel(10, 10), [17, 18, 20, 255]);
    assert.deepEqual(pixel(40, 10), [255, 255, 255, 255]);
  } finally {
    image.delete();
  }
});

test("renders a placed SVG from retained geometry instead of its raster fallback", async () => {
  const svg = new TextEncoder().encode(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
      <path fill="#ef4444" d="M0 0h10v10H0z"/>
      <path fill="#ffffff" d="M4 0h2v10H4z"/>
    </svg>
  `);
  const path = "images/vector.svg";
  const [screenshot] = await takeDocumentScreenshots({
    version: "2.17",
    children: [{
      id: "vector",
      type: "rectangle",
      x: 500,
      y: 700,
      width: 100,
      height: 100,
      fill: { type: "image", url: path, mode: "stretch" },
    }],
  }, [{ nodeIds: ["vector"] }], new Map([[path, {
    path,
    mimeType: "image/svg+xml",
    sha256: "e".repeat(64),
    bytes: svg,
    renderBytes: new Uint8Array([0, 1, 2, 3]),
  }]]), { scale: 4 });

  const ck = await getCanvasKit();
  const image = ck.MakeImageFromEncoded(Buffer.from(screenshot.data, "base64"));
  assert.ok(image);
  try {
    assert.equal(image.width(), 400);
    assert.equal(image.height(), 400);
    const pixels = image.readPixels(0, 0, {
      width: image.width(),
      height: image.height(),
      colorType: ck.ColorType.RGBA_8888,
      alphaType: ck.AlphaType.Unpremul,
      colorSpace: ck.ColorSpace.SRGB,
    });
    assert.deepEqual([...pixels.subarray((200 * 400 + 80) * 4, (200 * 400 + 80) * 4 + 4)], [239, 68, 68, 255]);
    assert.deepEqual([...pixels.subarray((200 * 400 + 200) * 4, (200 * 400 + 200) * 4 + 4)], [255, 255, 255, 255]);
  } finally {
    image.delete();
  }
});

test("an exact nested component-instance screenshot includes its overridden text", async () => {
  const document = {
    version: "2.15",
    children: [
      {
        type: "frame",
        id: "component",
        x: 0,
        y: 0,
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
