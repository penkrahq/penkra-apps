const SEMANTIC_NODE_TYPES = new Set(["icon", "note", "context", "prompt", "script"]);

export function isPencilAuthorableNode(node, sceneEditable = false) {
  return Boolean(node && (sceneEditable || SEMANTIC_NODE_TYPES.has(node.type)));
}

export function pencilAuthoringSections(node) {
  const sections = [];
  if (node.type === "icon") {
    sections.push(section("Icon", [
      field("library", node.library ?? "lucide"),
      field("icon", node.icon ?? ""),
      field("weight", node.weight ?? 400, "number"),
    ]));
  }
  if (["note", "context", "prompt"].includes(node.type)) {
    sections.push(section("Content", [
      field("content", node.content ?? "", "textarea", true),
      ...(node.type === "prompt" ? [field("model", node.model ?? "")] : []),
    ]));
  }
  if (node.type === "script") {
    sections.push(section("Script", [
      field("scriptUri", node.scriptUri ?? "", "text", true),
      field("inputs", node.inputs ?? {}, "json", true),
    ]));
  }

  const fill = Array.isArray(node.fill) ? null : node.fill;
  if (fill?.type === "gradient") {
    sections.push(section("Gradient", [
      nestedField("fill", ["gradientType"], fill.gradientType ?? "linear"),
      nestedField("fill", ["rotation"], fill.rotation ?? 0, "number"),
      nestedField("fill", ["colors"], fill.colors ?? [], "json", true),
      nestedField("fill", ["center"], fill.center ?? { x: 0.5, y: 0.5 }, "json", true),
      nestedField("fill", ["size"], fill.size ?? { height: 1 }, "json", true),
    ]));
  } else if (fill?.type === "shader") {
    sections.push(section("Shader", [
      nestedField("fill", ["url"], fill.url ?? "", "text", true),
      nestedField("fill", ["uniforms"], fill.uniforms ?? {}, "json", true),
      nestedField("fill", ["enabled"], fill.enabled !== false, "boolean"),
    ]));
  } else if (fill?.type === "mesh_gradient") {
    sections.push(section("Mesh gradient", [
      nestedField("fill", ["columns"], fill.columns ?? 2, "number"),
      nestedField("fill", ["rows"], fill.rows ?? 2, "number"),
      nestedField("fill", ["colors"], fill.colors ?? [], "json", true),
      nestedField("fill", ["points"], fill.points ?? [], "json", true),
    ]));
  } else if (Array.isArray(node.fill) || (fill && typeof fill === "object" && !["color", "solid"].includes(fill.type))) {
    sections.push(section("Paints", [field("fill", node.fill, "json", true)]));
  }

  if (node.effect !== undefined) {
    sections.push(section("Effects", [field("effect", node.effect, "json", true)]));
  }
  if (node.theme !== undefined) {
    sections.push(section("Theme override", [field("theme", node.theme, "json", true)]));
  }
  if (node.reusable === true || node.slot !== undefined) {
    sections.push(section("Component", [
      field("reusable", node.reusable === true, "boolean"),
      field("slot", node.slot ?? [], "json", true),
    ]));
  }
  return sections;
}

export function parsePencilAuthoringValue(kind, raw, checked = false) {
  if (kind === "boolean") return Boolean(checked);
  if (kind === "number") {
    const value = Number(raw);
    if (!String(raw).trim() || !Number.isFinite(value)) throw new Error("Enter a valid number.");
    return value;
  }
  if (kind === "json") {
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error(`Enter valid JSON: ${error.message}`);
    }
  }
  return raw;
}

function section(title, fields) {
  return { title, fields };
}

function field(property, value, kind = "text", full = false) {
  return { property, value, kind, full, path: [] };
}

function nestedField(property, path, value, kind = "text", full = false) {
  return { property, value, kind, full, path };
}
