import assert from "node:assert/strict";
import test from "node:test";

import {
  applySvgConversionRequests,
  convertSvgAssetToCanvasNode,
  inspectSvgVectorCandidate,
  inspectSvgVectorSupport,
} from "./svg-vectors.mjs";

const encoder = new TextEncoder();

function svgAsset(source, path = "images/logo.svg") {
  return {
    path,
    mimeType: "image/svg+xml",
    sha256: "a".repeat(64),
    bytes: encoder.encode(source),
  };
}

const SIMPLE_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 20">
    <rect x="1" y="2" width="3" height="4" fill="#ff0000"/>
    <circle cx="7" cy="8" r="2" fill="#00ff00"/>
  </svg>
`;

test("audits retained rendering and editable conversion separately", () => {
  assert.deepEqual(inspectSvgVectorSupport(encoder.encode(SIMPLE_SVG)).conversionIssues, []);

  const filtered = inspectSvgVectorSupport(encoder.encode(
    '<svg xmlns="http://www.w3.org/2000/svg"><path filter="url(#blur)" d="M0 0h1v1z"/></svg>',
  ));
  assert.equal(filtered.renderSupported, true);
  assert.equal(filtered.conversionSupported, false);
  assert.ok(filtered.conversionIssues.some((issue) => issue.includes("filter")));

  const text = inspectSvgVectorSupport(encoder.encode(
    '<svg xmlns="http://www.w3.org/2000/svg"><text>Logo</text></svg>',
  ));
  assert.equal(text.renderSupported, false);
  assert.equal(text.conversionSupported, false);
});

test("identifies a selected placed SVG without mistaking raster images for vectors", () => {
  const asset = svgAsset(SIMPLE_SVG);
  const node = { id: "logo", fill: { type: "image", url: asset.path, mode: "fit" } };
  assert.equal(inspectSvgVectorCandidate(node, new Map([[asset.path, asset]])).asset, asset);
  assert.equal(inspectSvgVectorCandidate(node, new Map([[asset.path, { ...asset, path: "images/logo.png", mimeType: "image/png" }]])), null);
  assert.equal(inspectSvgVectorCandidate({ id: "shape", fill: "#fff" }, new Map()), null);
});

test("converts a simple placed SVG into editable Canvas paths without mutating the source", () => {
  const sourceNode = {
    id: "logo",
    type: "rectangle",
    name: "Logo",
    x: 10,
    y: 20,
    width: 100,
    height: 100,
    fill: { type: "image", url: "images/logo.svg", mode: "fit" },
  };
  const before = structuredClone(sourceNode);
  const converted = convertSvgAssetToCanvasNode({
    sourceNode,
    asset: svgAsset(SIMPLE_SVG),
    createdId: "logo-editable",
  });

  assert.deepEqual(sourceNode, before);
  assert.equal(converted.id, "logo-editable");
  assert.equal(converted.type, "frame");
  assert.equal(converted.name, "Logo — Editable");
  assert.equal(converted.children.length, 2);
  assert.deepEqual(
    converted.children.map(({ x, y, width, height }) => ({ x, y, width, height })),
    [
      { x: 25, y: 0, width: 50, height: 100 },
      { x: 25, y: 0, width: 50, height: 100 },
    ],
  );
  assert.deepEqual(converted.children.map((child) => child.fill.color), ["#ff0000ff", "#00ff00ff"]);
});

test("applies copy and replace conversions deterministically", () => {
  const asset = svgAsset(SIMPLE_SVG);
  const assets = new Map([[asset.path, asset]]);
  const document = {
    version: "2.17",
    children: [{
      id: "logo",
      type: "rectangle",
      x: 4,
      y: 6,
      width: 20,
      height: 40,
      fill: { type: "image", url: asset.path, mode: "stretch" },
    }],
  };
  const [copy] = applySvgConversionRequests(document, [{
    sourceNodeId: "logo", createdId: "logo-editable", mode: "copy", offset: 24,
  }], assets);
  assert.deepEqual(copy, {
    sourceNodeId: "logo",
    createdNodeId: "logo-editable",
    shapeCount: 2,
    mode: "copy",
    fidelity: "exact",
    warnings: [],
  });
  assert.equal(document.children[0].id, "logo");
  assert.deepEqual(
    { id: document.children[1].id, x: document.children[1].x, y: document.children[1].y },
    { id: "logo-editable", x: 28, y: 30 },
  );

  applySvgConversionRequests(document, [{
    sourceNodeId: "logo", createdId: "logo-native", mode: "replace",
  }], assets);
  assert.deepEqual(document.children.map((node) => node.id), ["logo-native", "logo-editable"]);
});

test("fails closed when editable conversion would lose SVG features", () => {
  const asset = svgAsset(
    '<svg xmlns="http://www.w3.org/2000/svg"><path opacity=".5" d="M0 0h10v10z"/></svg>',
  );
  assert.throws(() => convertSvgAssetToCanvasNode({
    sourceNode: { id: "logo", type: "rectangle", width: 10, height: 10, fill: { type: "image", url: asset.path, mode: "fit" } },
    asset,
    createdId: "logo-editable",
  }), (error) => error.code === "CANVAS_SVG_CONVERSION_INCOMPLETE" && error.unsupported.includes("opacity is not editable without loss"));
});
