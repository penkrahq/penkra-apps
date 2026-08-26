import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePencilMeshPatch, normalizePencilMeshGradient } from "./pencil-mesh-gradient.mjs";

test("normalizes Pencil's exact documented auto-handle model", () => {
  const mesh = normalizePencilMeshGradient({
    columns: 3,
    rows: 2,
    colors: ["#000", "#111", "#222", "#333", "#444", "#555"],
    points: [[0, 0], [0.5, 0], [1, 0], [0, 1], [0.5, 1], [1, 1]],
  });
  assert.deepEqual(mesh.points[0], {
    position: [0, 0],
    leftHandle: [-0.125, 0],
    rightHandle: [0.125, 0],
    topHandle: [0, -0.25],
    bottomHandle: [0, 0.25],
  });
  assert.deepEqual(evaluatePencilMeshPatch(mesh, 0, 0, 0, 0), [0, 0]);
  assert.deepEqual(evaluatePencilMeshPatch(mesh, 0, 0, 1, 1), [0.5, 1]);
});

test("keeps explicit mesh handles instead of replacing them with auto handles", () => {
  const mesh = normalizePencilMeshGradient({
    columns: 2,
    rows: 2,
    colors: ["#000", "#111", "#222", "#333"],
    points: [
      { position: [0, 0], rightHandle: [0.4, 0], bottomHandle: [0, 0.4] },
      [1, 0], [0, 1], [1, 1],
    ],
  });
  assert.deepEqual(mesh.points[0].rightHandle, [0.4, 0]);
  assert.deepEqual(mesh.points[0].bottomHandle, [0, 0.4]);
});
