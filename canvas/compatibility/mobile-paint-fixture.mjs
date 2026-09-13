export function mobilePaintFixture() {
  const fills = [
    "#3698", "#33669988", "rgba(51,102,153,0.5333333333)",
    { type: "color", color: "#336699", opacity: 8 / 15 },
    { type: "color", color: "#33669988", opacity: 0.5 },
    "transparent",
  ];
  return { module: "mobile", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{
    id: "mobile-fixture", name: "Mobile Fixture", role: "ios", type: "frame", width: 393, height: 852, layout: "none", fill: "#F6F2EA",
    children: [
      { id: "registration", type: "rectangle", x: 20, y: 60, width: 10, height: 10, fill: "#E400FF" },
      ...fills.map((fill, index) => ({ id: `paint-${index}`, type: "rectangle", x: 20, y: 100 + index * 90, width: 300, height: 70, fill })),
    ],
  }] };
}
