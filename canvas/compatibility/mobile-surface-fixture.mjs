export function mobileSurfaceFixture() {
  const child = (id) => ({ id, type: "rectangle", x: 50, y: 15, width: 200, height: 40, fill: "#F4A261" });
  const component = { id: "component", type: "frame", layout: "none", width: 300, height: 70, fill: "#0B4A6F", children: [child("component-ink")] };
  return {
    module: "mobile", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [{
      id: "mobile-fixture", name: "Mobile Fixture", type: "frame", role: "ios", layout: "none", width: 393, height: 852,
      fill: "#F6F2EA", children: [
        { id: "registration", type: "rectangle", x: 20, y: 60, width: 10, height: 10, fill: "#E400FF" },
        ...[1, 0.5].flatMap((opacity, row) => ["frame", "group", "ref"].map((type, index) => {
          const id = `${type}-${row}`;
          return { id, type, x: 20, y: 100 + (row * 3 + index) * 90, width: 300, height: 70, opacity,
            ...(type === "ref" ? { ref: "component" } : {
              layout: "none", ...(type === "frame" ? { fill: "#0B4A6F" } : {}),
              children: [...(type === "group" ? [{ id: `${id}-background`, type: "rectangle", width: 300, height: 70, fill: "#0B4A6F" }] : []), child(`${id}-ink`)],
            }),
          };
        })),
      ],
    }, component],
  };
}
