import { pencilIconDefinition } from "./pencil-icon-provider.mjs";
import { pencilResourceAsset, resolvePencilResourcePath } from "./pencil-resources.mjs";
import { executePencilScript } from "./pencil-script-runtime.mjs";
import {
  parsePencilShader,
  resolvePencilShaderUniforms,
  transpilePencilShaderWebGL1,
} from "./pencil-shader-runtime.mjs";
import { normalizePencilMeshGradient } from "./pencil-mesh-gradient.mjs";

const NUMERIC_PROPERTIES = new Set([
  "x",
  "y",
  "width",
  "height",
  "gap",
  "opacity",
  "rotation",
  "strokeWidth",
  "fontSize",
  "lineHeight",
  "letterSpacing",
  "thickness",
  "weight",
  "radius",
  "spread",
  "blur",
  "startAngle",
  "sweepAngle",
  "innerRadius",
  "polygonCount",
  "position",
  "top",
  "right",
  "bottom",
  "left",
]);

const BOOLEAN_PROPERTIES = new Set([
  "enabled",
  "clip",
  "flipX",
  "flipY",
  "underline",
  "strikethrough",
]);
const STRING_PROPERTIES = new Set([
  "fontFamily",
  "fontWeight",
  "fontStyle",
  "content",
  "model",
  "library",
  "icon",
  "color",
]);
const NUMERIC_ARRAY_PROPERTIES = new Set(["cornerRadius", "padding"]);
const VARIABLE_PROPERTIES = new Set([
  ...NUMERIC_PROPERTIES,
  ...BOOLEAN_PROPERTIES,
  ...STRING_PROPERTIES,
  ...NUMERIC_ARRAY_PROPERTIES,
  "fill",
  "stroke",
  "colors",
]);

export function prepareOpenPencilRenderDocument(source, options = {}) {
  const document = structuredClone(source);
  const variables = source?.variables && typeof source.variables === "object"
    ? source.variables
    : {};
  const defaultTheme = Object.fromEntries(
    Object.entries(source?.themes ?? {})
      .filter(([, values]) => Array.isArray(values) && typeof values[0] === "string")
      .map(([axis, values]) => [axis, values[0]]),
  );
  const issues = [];
  const assets = options.assets instanceof Map ? options.assets : new Map();
  const containerPath = typeof options.containerPath === "string" ? options.containerPath : "";
  const libraryTrail = options.libraryTrail instanceof Set ? options.libraryTrail : new Set();

  const resolveReference = (reference, theme, trail = []) => {
    const name = reference.slice(1);
    if (trail.includes(name)) {
      return { ok: false, reason: `Variable cycle: ${[...trail, name].join(" → ")}` };
    }
    const definition = variables[name];
    if (!definition || typeof definition !== "object" || !("value" in definition)) {
      return { ok: false, reason: `Variable ${reference} was not found.` };
    }
    const selected = selectVariableValue(definition.value, theme);
    if (!selected.ok) return selected;
    if (isKnownVariableReference(selected.value, variables)) {
      return resolveReference(selected.value, theme, [...trail, name]);
    }
    return { ok: true, value: structuredClone(selected.value) };
  };

  const resolveValue = (value, property, theme, nodeId) => {
    if (isVariableReference(value, property)) {
      const resolved = resolveReference(value, theme);
      if (!resolved.ok) {
        issues.push(variableIssue(nodeId, value, resolved.reason));
        return safeFallback(property, value);
      }
      if (!validPropertyValue(property, resolved.value)) {
        issues.push(variableIssue(
          nodeId,
          value,
          `Variable ${value} resolved to an invalid ${property} value.`,
        ));
        return safeFallback(property, value);
      }
      return resolved.value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => resolveValue(item, property, theme, nodeId));
    }
    if (value && typeof value === "object") {
      return resolveObject(value, theme, nodeId);
    }
    return value;
  };

  const resolveObject = (object, inheritedTheme, inheritedNodeId = null) => {
    const theme = isRecord(object.theme)
      ? { ...inheritedTheme, ...object.theme }
      : inheritedTheme;
    const nodeId = typeof object.id === "string" ? object.id : inheritedNodeId;
    for (const [property, value] of Object.entries(object)) {
      if (property === "theme") continue;
      if (object.type === "script" && property === "inputs" && isRecord(value)) {
        object[property] = Object.fromEntries(Object.entries(value).map(([name, inputValue]) => {
          if (!isKnownVariableReference(inputValue, variables)) return [name, inputValue];
          const resolved = resolveReference(inputValue, theme);
          if (!resolved.ok) {
            issues.push(variableIssue(nodeId, inputValue, resolved.reason));
            return [name, inputValue];
          }
          return [name, resolved.value];
        }));
        continue;
      }
      if (object.type === "shader" && property === "uniforms" && isRecord(value)) {
        object[property] = Object.fromEntries(Object.entries(value).map(([name, uniformValue]) => {
          if (!isKnownVariableReference(uniformValue, variables)) return [name, uniformValue];
          const resolved = resolveReference(uniformValue, theme);
          if (!resolved.ok) {
            issues.push(variableIssue(nodeId, uniformValue, resolved.reason));
            return [name, uniformValue];
          }
          return [name, resolved.value];
        }));
        continue;
      }
      object[property] = resolveValue(value, property, theme, nodeId);
    }
    if (object.type === "icon") compileIcon(object, issues, nodeId);
    normalizePencilNode(object, issues, nodeId);
    canonicalizeResourceReference(object, containerPath);
    if (object.type === "shader") compileShader(object, assets, issues, nodeId);
    if (object.type === "mesh_gradient") compileMeshGradient(object, issues, nodeId);
    if (object.type === "script") compileScript(object, assets, issues, nodeId, (child) => {
      resolveObject(child, theme, nodeId);
    });
    if (["note", "context", "prompt"].includes(object.type)) compileStickyNode(object, (child) => {
      resolveObject(child, theme, nodeId);
    });
    return object;
  };

  for (const node of document.children ?? []) resolveObject(node, defaultTheme);
  document.children.push(...prepareImportedComponents(source, assets, issues, containerPath, libraryTrail));
  compileDescendantIcons(document.children, issues);
  return { document, issues };
}

function compileDescendantIcons(nodes, issues) {
  const byId = new Map();
  const visit = (node) => {
    if (typeof node?.id === "string") byId.set(node.id, node);
    for (const child of node?.children ?? []) visit(child);
  };
  for (const node of nodes ?? []) visit(node);

  const apply = (node) => {
    if (node?.type === "ref" && isRecord(node.descendants)) {
      for (const [path, override] of Object.entries(node.descendants)) {
        if (!isRecord(override)) continue;
        const source = byId.get(path.split("/").at(-1));
        if (source?.type !== "icon") continue;
        const effective = {
          type: "icon",
          library: override.library ?? source.library,
          icon: override.icon ?? source.icon,
          weight: override.weight ?? source.weight,
        };
        const definition = pencilIconDefinition(effective.library, effective.icon, effective.weight);
        if (definition) {
          override.__canvasIcon = definition;
          override.__canvasIconFill = structuredClone(override.fill ?? source.fill ?? "#000000");
        }
        else issues.push(iconIssue(
          node.id,
          `${effective.library ?? "Unknown"} icon ${effective.icon ?? "(unnamed)"} is not supported.`,
        ));
      }
    }
    for (const child of node?.children ?? []) apply(child);
  };
  for (const node of nodes ?? []) apply(node);
}

function compileStickyNode(node, prepareChild) {
  const style = {
    note: { title: "Note", header: "#FFF1D6", background: "#FFF7E5", outline: "#8B6311", text: "#664500" },
    context: { title: "Context", header: "#FFFFFF", background: "#F0F0F0", outline: "#767676", text: "#2C2C2C" },
    prompt: { title: "Prompt", header: "#C3E8FF", background: "#E8F6FF", outline: "#009DFF", text: "#006CAF" },
  }[node.type];
  const id = node.id;
  const generated = (suffix, value) => ({ id: `${id}::sticky::${suffix}`, __canvasGenerated: true, ...value });
  const text = (suffix, content, options = {}) => generated(suffix, {
    type: "text",
    content,
    fill: options.fill ?? style.text,
    fontFamily: "JetBrains Mono",
    fontSize: options.fontSize ?? 14,
    fontWeight: options.fontWeight ?? 400,
    lineHeight: options.lineHeight ?? 21,
    textGrowth: options.textGrowth ?? "fixed-width-height",
    width: options.width,
    height: options.height,
  });
  const title = generated("title-row", {
    type: "frame",
    layout: "horizontal",
    alignItems: "center",
    gap: 2,
    width: "hug_content",
    height: 21,
    children: [
      text("title", style.title, { fontWeight: 500, width: "hug_content", height: 21 }),
      generated("chevron", {
        type: "path",
        width: 16,
        height: 16,
        geometry: "M4 7L8 11L12 7",
        viewBox: [0, 0, 16, 16],
        stroke: style.text,
        strokeWidth: 1,
      }),
    ],
  });
  const header = generated("header", {
    type: "frame",
    layout: "horizontal",
    alignItems: "center",
    padding: 12,
    width: "fill_container",
    height: 45,
    fill: style.header,
    children: [title],
  });
  const divider = generated("divider", {
    type: "path",
    width: "fill_container",
    height: 0,
    geometry: `M0 0H${Math.max(250, Number(node.width) || 250)}`,
    stroke: style.outline,
    strokeWidth: 1,
    strokeDashPattern: [4, 4],
  });
  const content = text("content", typeof node.content === "string" ? node.content : "", {
    width: "fill_container",
    height: node.type === "prompt" ? 116 : 150,
  });
  const bodyChildren = [content];
  if (node.type === "prompt") {
    bodyChildren.push(generated("footer", {
      type: "frame",
      layout: "horizontal",
      alignItems: "center",
      justifyContent: "end",
      padding: [8, 0, 0, 0],
      width: "fill_container",
      height: 34,
      children: [generated("copy", {
        type: "frame",
        layout: "horizontal",
        alignItems: "center",
        justifyContent: "center",
        padding: [4, 12, 4, 12],
        cornerRadius: 6,
        width: "hug_content",
        height: 26,
        fill: style.text,
        children: [text("copy-label", "Copy", { fill: "#FFFFFF", fontSize: 12, fontWeight: 500, lineHeight: 18, width: "hug_content", height: 18 })],
      })],
    }));
  }
  const body = generated("body", {
    type: "frame",
    layout: "vertical",
    padding: 12,
    width: "fill_container",
    height: 174,
    fill: style.background,
    children: bodyChildren,
  });
  node.__canvasSticky = true;
  node.width = Math.max(250, Number(node.width) || 250);
  node.height = 219;
  node.layout = "vertical";
  node.gap = 0;
  node.clip = true;
  node.cornerRadius = 8;
  node.fill = style.background;
  node.stroke = {
    fills: [style.outline],
    thickness: 1,
    align: "inside",
  };
  node.children = [header, divider, body];
  for (const child of node.children) prepareChild(child);
}

function compileMeshGradient(fill, issues, nodeId) {
  try {
    fill.__canvasMesh = normalizePencilMeshGradient(fill);
  } catch (error) {
    issues.push(meshIssue(nodeId, error?.message ?? String(error)));
  }
}

function compileShader(fill, assets, issues, nodeId) {
  if (typeof fill.url !== "string" || fill.url.length === 0) {
    issues.push(shaderIssue(nodeId, "No Pencil shader file is selected."));
    return;
  }
  const asset = pencilResourceAsset(assets, fill.url);
  if (!asset) {
    issues.push(shaderIssue(nodeId, `Pencil shader resource ${fill.url} is unavailable.`));
    return;
  }
  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(asset.bytes);
    const definition = parsePencilShader(source);
    const values = resolvePencilShaderUniforms(definition, fill.uniforms);
    const textures = [];
    for (const uniform of definition.uniforms.filter(({ type, automatic }) => type === "sampler2D" && !automatic)) {
      const url = resolvePencilResourcePath(fill.url, values[uniform.name]);
      const texture = pencilResourceAsset(assets, url);
      if (!texture) throw new Error(`Pencil shader texture ${url} is unavailable.`);
      values[uniform.name] = url;
      textures.push({ name: uniform.name, url, sha256: texture.sha256 });
    }
    fill.__canvasShader = {
      source,
      webglSource: transpilePencilShaderWebGL1(definition),
      uniforms: definition.uniforms,
      values,
      textures,
    };
  } catch (error) {
    issues.push(shaderIssue(nodeId, error?.message ?? String(error)));
  }
}

function prepareImportedComponents(source, assets, issues, containerPath, libraryTrail) {
  const components = [];
  const knownIds = collectNodeIds(source?.children);
  const origins = new Set();
  for (const [alias, reference] of Object.entries(source?.imports ?? {})) {
    if (typeof alias !== "string" || alias.length === 0) {
      issues.push(libraryIssue(null, "A Pencil library import has an empty alias."));
      continue;
    }
    let path;
    try {
      path = resolvePencilResourcePath(containerPath, reference);
    } catch (error) {
      issues.push(libraryIssue(null, error?.message ?? String(error)));
      continue;
    }
    if (libraryTrail.has(path)) {
      issues.push(libraryIssue(null, `Pencil library import cycle reaches ${path}.`));
      continue;
    }
    const asset = pencilResourceAsset(assets, path);
    if (!asset) {
      issues.push(libraryIssue(null, `Pencil library ${alias} resource ${path} is unavailable.`));
      continue;
    }
    let library;
    try {
      library = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(asset.bytes));
      if (!library || typeof library !== "object" || !Array.isArray(library.children)) throw new Error("invalid document");
    } catch {
      issues.push(libraryIssue(null, `Pencil library ${alias} at ${path} is not a valid UTF-8 .pen document.`));
      continue;
    }
    const prepared = prepareOpenPencilRenderDocument(library, {
      assets,
      containerPath: path,
      libraryTrail: new Set([...libraryTrail, path]),
    });
    issues.push(...prepared.issues);
    for (const component of prepared.document.children.filter((node) => node?.reusable === true)) {
      const origin = component.__canvasImportedOrigin ?? path;
      if (origins.has(`${origin}\0${component.id}`)) continue;
      const componentIds = collectNodeIds([component]);
      const collision = [...componentIds].find((id) => knownIds.has(id));
      if (collision) {
        issues.push(libraryIssue(collision, `Imported Pencil component ${component.id} conflicts with existing node id ${collision}.`));
        continue;
      }
      for (const id of componentIds) knownIds.add(id);
      component.__canvasImported = true;
      component.__canvasImportedOrigin = origin;
      origins.add(`${origin}\0${component.id}`);
      components.push(component);
    }
  }
  return components;
}

function canonicalizeResourceReference(object, containerPath) {
  if ((object.type === "image" || object.type === "shader") && typeof object.url === "string") {
    object.url = resolvePencilResourcePath(containerPath, object.url);
  }
  if (object.type === "script" && typeof object.scriptUri === "string") {
    object.scriptUri = resolvePencilResourcePath(containerPath, object.scriptUri);
  }
}

function collectNodeIds(nodes, output = new Set()) {
  for (const node of nodes ?? []) {
    if (typeof node?.id === "string") output.add(node.id);
    collectNodeIds(node?.children, output);
  }
  return output;
}

function compileScript(node, assets, issues, nodeId, prepareChild) {
  if (typeof node.scriptUri !== "string" || node.scriptUri.length === 0) {
    issues.push(scriptIssue(nodeId, "No Pencil script file is selected."));
    return;
  }
  const asset = pencilResourceAsset(assets, node.scriptUri);
  if (!asset) {
    issues.push(scriptIssue(nodeId, `Pencil script resource ${node.scriptUri} is unavailable.`));
    return;
  }
  try {
    const code = new TextDecoder("utf-8", { fatal: true }).decode(asset.bytes);
    const result = executePencilScript(code, {
      width: node.width,
      height: node.height,
      inputs: node.inputs,
    });
    node.children = namespaceScriptOutput(result.nodes, node.id);
    node.__canvasScript = true;
    for (const child of node.children) prepareChild(child);
  } catch (error) {
    issues.push(scriptIssue(nodeId, error?.message ?? String(error)));
  }
}

function namespaceScriptOutput(nodes, scriptId) {
  const ids = new Map();
  const output = structuredClone(nodes);
  const assign = (node, path) => {
    const originalId = typeof node.id === "string" && node.id.length > 0 ? node.id : null;
    if (originalId && ids.has(originalId)) throw new Error(`Pencil script output repeats node id ${originalId}.`);
    const generatedId = `${scriptId}::script::${path.join(".")}`;
    if (originalId) ids.set(originalId, generatedId);
    node.id = generatedId;
    node.__canvasGenerated = true;
    for (let index = 0; index < (node.children ?? []).length; index += 1) {
      assign(node.children[index], [...path, index]);
    }
  };
  for (let index = 0; index < output.length; index += 1) assign(output[index], [index]);
  const rewrite = (node) => {
    if (typeof node.ref === "string" && ids.has(node.ref)) node.ref = ids.get(node.ref);
    if (isRecord(node.descendants)) {
      node.descendants = Object.fromEntries(Object.entries(node.descendants).map(([path, value]) => [
        path.split("/").map((part) => ids.get(part) ?? part).join("/"),
        value,
      ]));
    }
    for (const child of node.children ?? []) rewrite(child);
  };
  for (const node of output) rewrite(node);
  return output;
}

function normalizePencilNode(node, issues, nodeId) {
  if (!node || typeof node !== "object" || !node.type) return;
  node.width = normalizePencilSize(node.width);
  node.height = normalizePencilSize(node.height);

  if (node.type === "frame") {
    node.layout ??= "horizontal";
    node.width ??= "hug_content";
    node.height ??= "hug_content";
  }
  if (node.justifyContent === "space_between") node.justifyContent = "space-between";
  if (node.textAlign === "justify") node.textAlign = "justified";
  if (node.textAlignVertical === "middle") node.textAlignVertical = "center";

  if (node.stroke !== undefined && !isOpenPencilStroke(node.stroke)) {
    const fills = Array.isArray(node.stroke) ? node.stroke : [node.stroke];
    for (const fill of fills) {
      const supported = typeof fill === "string"
        || fill?.type === "color"
        || fill?.type === "solid"
        || fill?.type === "gradient";
      if (supported) continue;
      issues.push({
        nodeId,
        kind: "stroke",
        message: `${fill?.type ?? "Unknown"} stroke fill is preserved but is not represented by the current Canvas renderer.`,
      });
    }
    node.stroke = {
      fills,
      thickness: node.strokeWidth ?? 1,
      align: ({ inner: "inside", outer: "outside" })[node.strokeAlignment] ?? "center",
      join: node.strokeLinejoin,
      cap: node.strokeLinecap,
      ...(node.strokeDashPattern ? { dashPattern: node.strokeDashPattern } : {}),
    };
  }
}

function normalizePencilSize(value) {
  if (typeof value !== "string") return value;
  return /^fit_content(?:\([^)]*\))?$/.test(value) ? "hug_content" : value;
}

function isOpenPencilStroke(value) {
  return isRecord(value)
    && (Object.hasOwn(value, "fill") || Object.hasOwn(value, "fills"))
    && Object.hasOwn(value, "thickness");
}

function compileIcon(node, issues, nodeId) {
  const definition = pencilIconDefinition(node.library, node.icon, node.weight);
  if (!definition) {
    issues.push(iconIssue(
      nodeId,
      `${node.library ?? "Unknown"} icon ${node.icon ?? "(unnamed)"} is not supported.`,
    ));
    return;
  }
  node.__canvasIcon = definition;
}

function selectVariableValue(value, theme) {
  if (!Array.isArray(value)) return { ok: true, value };
  let selected;
  let found = false;
  let fallback;
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || !("value" in entry)) continue;
    fallback ??= entry.value;
    const conditions = isRecord(entry.theme) ? Object.entries(entry.theme) : [];
    if (!conditions.every(([axis, mode]) => theme[axis] === mode)) continue;
    // Pencil 2.17 defines variable arrays as ordered cascades: the last value
    // whose complete theme condition matches wins.
    selected = entry.value;
    found = true;
  }
  if (found) return { ok: true, value: selected };
  if (fallback !== undefined) return { ok: true, value: fallback };
  return { ok: false, reason: "Variable has no values." };
}

function isVariableReference(value, property) {
  return typeof value === "string" && value.startsWith("$") && VARIABLE_PROPERTIES.has(property);
}

function isKnownVariableReference(value, variables) {
  return typeof value === "string" && value.startsWith("$") && Object.hasOwn(variables, value.slice(1));
}

function validPropertyValue(property, value) {
  if (NUMERIC_PROPERTIES.has(property)) {
    if (["width", "height"].includes(property) && typeof value === "string") return true;
    return typeof value === "number" && Number.isFinite(value);
  }
  if (BOOLEAN_PROPERTIES.has(property)) return typeof value === "boolean";
  if (STRING_PROPERTIES.has(property)) return typeof value === "string";
  if (NUMERIC_ARRAY_PROPERTIES.has(property)) {
    return typeof value === "number" && Number.isFinite(value)
      || Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item));
  }
  return true;
}

function safeFallback(property, original) {
  if (NUMERIC_PROPERTIES.has(property)) {
    if (property === "opacity") return 1;
    if (property === "weight") return 400;
    return 0;
  }
  if (BOOLEAN_PROPERTIES.has(property)) return property === "enabled";
  if (STRING_PROPERTIES.has(property)) return property === "color" ? "#00000000" : "";
  if (NUMERIC_ARRAY_PROPERTIES.has(property)) return 0;
  if (property === "fill" || property === "stroke") return null;
  return original;
}

function variableIssue(nodeId, reference, message) {
  return {
    nodeId,
    kind: "variable",
    message: `${message} The original ${reference} reference is preserved in the Canvas document.`,
  };
}

function iconIssue(nodeId, message) {
  return {
    nodeId,
    kind: "icon",
    message: `${message} The original icon is preserved in the Canvas document.`,
  };
}

function scriptIssue(nodeId, message) {
  return {
    nodeId,
    kind: "script",
    message: `${message} The original script node is preserved in the Canvas document.`,
  };
}

function shaderIssue(nodeId, message) {
  return {
    nodeId,
    kind: "shader",
    message: `${message} The original shader fill is preserved in the Canvas document.`,
  };
}

function meshIssue(nodeId, message) {
  return {
    nodeId,
    kind: "mesh-gradient",
    message: `${message} The original mesh gradient fill is preserved in the Canvas document.`,
  };
}

function libraryIssue(nodeId, message) {
  return {
    nodeId,
    kind: "library",
    message: `${message} The original library import is preserved in the Canvas document.`,
  };
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
