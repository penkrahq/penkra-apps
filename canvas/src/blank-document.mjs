/** Build the same minimal valid document for UI and operation-driven creation. */
export function createBlankDocumentSource({ id = crypto.randomUUID(), module = "web" } = {}) {
  const preset = modulePreset(module);
  return {
    module,
    axes: {},
    variables: {},
    paragraphStyles: {},
    imports: {},
    flows: [],
    children: [
      {
        id,
        type: "frame",
        name: preset.name,
        x: 120,
        y: 100,
        width: preset.width,
        height: preset.height,
        role: preset.role,
        ...(preset.size ? { size: preset.size } : {}),
        ...(preset.physical ? { physical: preset.physical } : {}),
        fill: "#ffffff",
        children: [],
      },
    ],
  };
}

function modulePreset(module) {
  if (module === "deck") return { name: "Slide 1", width: 1280, height: 720, role: "slide", size: "widescreen", physical: { w: 13.333, h: 7.5, unit: "in" } };
  if (module === "print") return { name: "Page 1", width: 794, height: 1123, role: "page", size: "a4", physical: { w: 210, h: 297, unit: "mm" } };
  if (module === "mobile") return { name: "Screen", width: 393, height: 852, role: "ios", size: "iphone" };
  if (module === "web") return { name: "Home", width: 720, height: 480, role: "route" };
  throw new Error(`Unknown Canvas module ${module}.`);
}
