import assert from "node:assert/strict";
import test from "node:test";

import { designValidationIssues } from "./document-review.mjs";

test("slot layer limits report guidance without invalidating authored content", () => {
  const document = {
    children: [
      {
        id: "list", type: "frame",
        properties: { items: { type: "slot", target: "body", minItems: 1, maxItems: 2 } },
        children: [{ id: "body", type: "frame", children: [] }],
      },
      {
        id: "use", type: "ref", ref: "list",
        slots: { items: [
          { id: "a", type: "rectangle" },
          { id: "b", type: "rectangle" },
          { id: "c", type: "rectangle" },
        ] },
      },
    ],
  };

  assert.deepEqual(
    designValidationIssues(document).filter((issue) => issue.kind === "slot-layer-guidance"),
    [
      { nodeId: "body", kind: "slot-layer-guidance", message: "Slot items contains 0 layer(s); its design-system guidance is 1–2." },
      { nodeId: "use", kind: "slot-layer-guidance", message: "Slot items contains 3 layer(s); its design-system guidance is 1–2." },
    ],
  );
});
