export const mobileFixtureFontNames = { 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold" };

export function mobileFontFixture({ sizes = false, mixedSizes = false } = {}) {
  sizes ||= mixedSizes;
  return { module: "mobile", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{
    id: "screen", name: "Font Screen", role: "ios", type: "frame", width: 393, height: 852, layout: "none", fill: "#F6F2EA",
    children: [
      { id: "registration", type: "rectangle", x: 20, y: 60, width: 10, height: 10, fill: "#E400FF" },
      ...(sizes ? [24, 28.25, 32, 40, 48] : Object.keys(mobileFixtureFontNames)).map((value, index) => {
        const content = mixedSizes ? `Aa ${value}: Bb` : sizes ? `Size ${value}: Aa` : `Inter ${value}: Aa0123`;
        return { id: `${sizes ? "size" : "weight"}-${value}`, type: "text", x: 20, y: 100 + index * 110, width: 340, height: 64,
          content, fontFamily: "Inter", fontWeight: sizes ? 700 : Number(value), fontSize: mixedSizes ? 24 : sizes ? value : 28, fill: "#123456",
          marks: mixedSizes ? [{ type: "fontSize", from: 3, to: content.length, value }] : [], paragraphs: [{ from: 0, to: content.length }] };
      }),
    ],
  }] };
}
