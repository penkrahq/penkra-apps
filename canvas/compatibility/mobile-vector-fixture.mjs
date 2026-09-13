import { vectorCases } from "./vector-fixture.mjs";

export function mobileVectorFixture() {
  return {
    module: "mobile", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [{
      id: "mobile-fixture", name: "Mobile Fixture", type: "frame", role: "ios", layout: "none", width: 393, height: 852,
      fill: "#F6F2EA", children: [
        { id: "registration", type: "rectangle", x: 20, y: 60, width: 10, height: 10, fill: "#F4A261" },
        ...["evenodd", "nonzero"].flatMap((fillRule, ruleIndex) => vectorCases.map(([name, geometry, viewBox], index) => {
          const position = ruleIndex * vectorCases.length + index;
          return {
            id: `${name}-${fillRule}`, description: `${name}-${fillRule}`, type: name === "polygon" ? "polygon" : "path",
            x: 20 + position % 4 * 88, y: 100 + Math.floor(position / 4) * 120,
            width: 65, height: 55, geometry, viewBox: viewBox ?? [0, 0, 100, 100], fillRule, fill: "#0B4A6F",
          };
        })),
      ],
    }],
  };
}
