import assert from "node:assert/strict";
import test from "node:test";
import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import { vectorForNode, scaledVectorCommands, drawingMlCommands, commandsToSvgPath } from "./vector-path.mjs";

const vector = (geometry, fillRule = "nonzero") => vectorForNode({ id: "test", type: "path", geometry, fillRule, viewBox: [0, 0, 100, 100] });

test("native path conversion preserves explicit moves and closes only Z commands", async () => {
  const path = vector("M0 0 L20 20 L0 0 M0 0 L30 0 Z M50 50 L90 90");
  const commands = scaledVectorCommands(path, 100, 100);
  assert.deepEqual(commands.map((command) => command.type), ["move", "line", "line", "move", "line", "close", "move", "line"]);
  assert.deepEqual(await drawingMlCommands(path, 100), []);
});

test("native paths normalize relative, smooth, quadratic and arc commands", () => {
  const commands = scaledVectorCommands(vector("m10 10 h10 v10 q10 20 20 0 t20 0 a10 10 0 0 1 10 10 s10 10 20 0"), 200, 300);
  assert.deepEqual(commands[0], { type: "move", x: 20, y: 30 });
  assert.ok(commands.filter((command) => command.type === "cubic").length >= 4);
  assert.ok(commands.every((command) => ["move", "line", "cubic", "close"].includes(command.type)));
});

test("native paths reject malformed and non-finite geometry instead of partial parsing", () => {
  for (const d of ["M0 0 L10", "M0 0 X10 10", "M0 0 L1e999 5"]) assert.throws(() => vector(d), { code: "CANVAS_VECTOR_INVALID" });
});

test("DrawingML fill lowering preserves both source rules under either destination rule", async () => {
  const ck = await getCanvasKit();
  const cases = [
    "M0 0 H70 V70 H0 Z M30 30 H100 V100 H30 Z",
    "M0 50 C0 -10 100 -10 100 50 C100 110 0 110 0 50 Z M25 50 C25 20 75 20 75 50 C75 80 25 80 25 50 Z",
    "M0 0 L100 100 L0 100 L100 0 Z",
    "M0 0 H100 V100 H0 Z M0 0 H100 V100 H0 Z",
    "M10 10 L90 10 L50 90",
    "M50 0 C116 0 116 100 50 100 C-16 100 -16 0 50 0 Z M50 25 C83 25 83 75 50 75 C17 75 17 25 50 25 Z",
  ];
  for (const d of cases) for (const sourceRule of ["evenodd", "nonzero"]) {
    const original = ck.Path.MakeFromSVGString(d);
    const drawingCommands = await drawingMlCommands(vector(d, sourceRule));
    const commands = scaledVectorCommands({ commands: drawingCommands, viewBox: [0, 0, 100000, 100000] }, 100, 100);
    const lowered = commands.length ? ck.Path.MakeFromSVGString(commandsToSvgPath(commands)) : new ck.Path();
    try {
      original.setFillType(sourceRule === "evenodd" ? ck.FillType.EvenOdd : ck.FillType.Winding);
      for (const destinationRule of [ck.FillType.Winding, ck.FillType.EvenOdd]) {
        lowered.setFillType(destinationRule);
        for (let x = 0.37; x < 100; x += 2) for (let y = 0.63; y < 100; y += 2) assert.equal(lowered.contains(x, y), original.contains(x, y), `${sourceRule}: ${d} at ${x},${y}`);
      }
    } finally { original.delete(); lowered.delete(); }
  }
});
