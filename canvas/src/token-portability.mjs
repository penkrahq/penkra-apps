import { resolveVariableReferences, variableReferences } from "./variable-references.mjs";
import { resolveCascade } from "./canvas-resolver.mjs";

const CANVAS_EXTENSION = "com.penkra.canvas";
export const PORTABLE_TOKEN_TYPES = Object.freeze([
  "color", "dimension", "number", "fontFamily", "duration",
]);
const CANVAS_TOKEN_TYPES = [...PORTABLE_TOKEN_TYPES, "string"];

export function exportDtcgTokens(variables) {
  validateCanvasVariables(variables);
  const output = {
    $schema: "https://www.designtokens.org/schemas/2025.10/format.json",
  };
  for (const name of Object.keys(variables).sort()) {
    const segments = tokenPath(name);
    let group = output;
    for (const segment of segments.slice(0, -1)) {
      if (Object.hasOwn(group, segment) && isToken(group[segment])) {
        throw tokenError(`Token path ${name} collides with token ${segments.slice(0, segments.indexOf(segment) + 1).join(".")}.`);
      }
      if (!Object.hasOwn(group, segment)) Object.defineProperty(group, segment, { value: {}, enumerable: true, writable: true, configurable: true });
      group = group[segment];
    }
    const leaf = segments.at(-1);
    if (Object.hasOwn(group, leaf)) throw tokenError(`Token path ${name} collides with another token or group.`);
    const definition = variables[name];
    if (!PORTABLE_TOKEN_TYPES.includes(definition.tokenType)) throw tokenError(`Canvas token ${name} has no supported DTCG type mapping for ${definition.tokenType}.`);
    Object.defineProperty(group, leaf, { enumerable: true, writable: true, configurable: true, value: {
      $type: definition.tokenType,
      $value: toDtcgValue(resolveCascade(definition.cascade, { modes: {}, props: {} }), definition.tokenType),
      $extensions: {
        [CANVAS_EXTENSION]: {
          tokenType: definition.tokenType,
          cascade: structuredClone(definition.cascade),
        },
      },
    } });
  }
  return output;
}

export function importDtcgTokens(source) {
  if (!plainObject(source)) throw tokenError("DTCG token source must be an object.");
  const variables = {};
  const visit = (group, path, inheritedType) => {
    if (!plainObject(group)) throw tokenError(`DTCG group ${path.join(".") || "(root)"} must be an object.`);
    const groupType = group.$type ?? inheritedType;
    for (const [name, value] of Object.entries(group)) {
      if (name.startsWith("$")) continue;
      if (name.includes(".")) throw tokenError(`DTCG name segment ${name} may not contain a dot.`);
      const next = [...path, name];
      if (isToken(value)) {
        const extension = value.$extensions?.[CANVAS_EXTENSION];
        const tokenType = extension?.tokenType ?? value.$type ?? groupType;
        if (!PORTABLE_TOKEN_TYPES.includes(tokenType)) throw tokenError(`Token ${next.join(".")} has unsupported type ${String(tokenType)}.`);
        variables[next.join(".")] = extension
          ? { tokenType, cascade: structuredClone(extension.cascade) }
          : { tokenType, cascade: [{ value: fromDtcgValue(value.$value) }] };
      } else visit(value, next, groupType);
    }
  };
  visit(source, [], undefined);
  validateCanvasVariables(variables);
  return variables;
}

export function validateCanvasVariables(variables) {
  if (!plainObject(variables)) throw tokenError("Canvas variables must be an object.");
  for (const name of Object.keys(variables)) tokenPath(name);
  const modeValues = new Map();
  for (const [name, definition] of Object.entries(variables)) {
    if (!plainObject(definition) || !CANVAS_TOKEN_TYPES.includes(definition.tokenType)
      || !Array.isArray(definition.cascade) || definition.cascade.length === 0) {
      throw tokenError(`Variable ${name} must declare a supported tokenType and non-empty cascade.`);
    }
    for (const entry of definition.cascade) {
      if (!plainObject(entry) || !Object.hasOwn(entry, "value")) throw tokenError(`Variable ${name} has an invalid cascade entry.`);
      if (entry.when !== undefined && !plainObject(entry.when)) throw tokenError(`Variable ${name} has invalid mode conditions.`);
      for (const [axis, mode] of Object.entries(entry.when ?? {})) {
        if (!["appearance", "viewport"].includes(axis) || typeof mode !== "string" || !mode) throw tokenError(`Variable ${name} has invalid mode conditions.`);
        if (!modeValues.has(axis)) modeValues.set(axis, new Set());
        modeValues.get(axis).add(mode);
      }
    }
  }
  let contexts = [{}];
  for (const [axis, values] of modeValues) {
    if (contexts.length * (values.size + 1) > 1024) throw tokenError("Variable mode combinations exceed the validation limit of 1024.");
    contexts = contexts.flatMap((modes) => [modes, ...[...values].map((mode) => ({ ...modes, [axis]: mode }))]);
  }
  const resolveEntry = (owner, modes, trail = []) => {
    if (trail.includes(owner)) throw tokenError(`Variable cycle: ${[...trail, owner].join(" -> ")}.`);
    const definition = variables[owner];
    if (!plainObject(definition) || !CANVAS_TOKEN_TYPES.includes(definition.tokenType)
      || !Array.isArray(definition.cascade) || definition.cascade.length === 0) {
      throw tokenError(`Variable ${owner} must declare a supported tokenType and non-empty cascade.`);
    }
    const value = resolveCascade(definition.cascade, { modes, props: {} });
    const resolved = resolveVariableReferences(value, (reference) => {
      if (!Object.hasOwn(variables, reference)) throw tokenError(`Variable ${owner} references missing variable ${reference}.`);
      const target = variables[reference];
      const whole = typeof value === "string" && variableReferences(value).length === 1
        && variableReferences(value)[0][0] === value;
      if (whole && target.tokenType !== definition.tokenType) {
        throw tokenError(`Variable ${owner} (${definition.tokenType}) aliases ${reference} (${target.tokenType}).`);
      }
      return resolveEntry(reference, modes, [...trail, owner]);
    });
    assertTokenValue(definition.tokenType, resolved, owner);
    return resolved;
  };
  for (const [name, definition] of Object.entries(variables)) {
    if (!plainObject(definition) || !CANVAS_TOKEN_TYPES.includes(definition.tokenType)
      || !Array.isArray(definition.cascade) || definition.cascade.length === 0) {
      throw tokenError(`Variable ${name} must declare a supported tokenType and non-empty cascade.`);
    }
    for (const modes of contexts) resolveEntry(name, modes);
  }
  return true;
}

function toDtcgValue(value, type) {
  if (typeof value === "string") {
    const match = /^\$\{([A-Za-z][\w-]*(?:\.[\w-]+)*)\}$/u.exec(value);
    if (match) return `{${match[1]}}`;
  }
  if (type === "color" && typeof value === "string") return hexColor(value);
  if (type === "dimension" && typeof value === "number") return { value, unit: "px" };
  if (type === "duration" && typeof value === "number") return { value, unit: "ms" };
  return structuredClone(value);
}

function fromDtcgValue(value) {
  if (typeof value === "string") {
    const match = /^\{([A-Za-z][\w-]*(?:\.[\w-]+)*)\}$/u.exec(value);
    if (match) return `\${${match[1]}}`;
  }
  return structuredClone(value);
}

function assertTokenValue(type, value, name) {
  const finite = (candidate) => typeof candidate === "number" && Number.isFinite(candidate);
  let valid = false;
  if (type === "number") valid = finite(value);
  else if (type === "string") valid = typeof value === "string";
  else if (type === "fontFamily") valid = typeof value === "string" || (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string"));
  else if (type === "dimension") valid = finite(value) || (plainObject(value) && finite(value.value) && ["px", "rem"].includes(value.unit));
  else if (type === "duration") valid = finite(value) || (plainObject(value) && finite(value.value) && ["ms", "s"].includes(value.unit));
  else if (type === "color") valid = (typeof value === "string" && /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/iu.test(value))
    || validDtcgColor(value);
  if (!valid) throw tokenError(`Variable ${name} value does not satisfy ${type}.`);
}

function validDtcgColor(value) {
  // DTCG Color Module 2025.10, sections 4.1 and 4.2:
  // https://www.designtokens.org/tr/2025.10/color/#supported-color-spaces
  if (!plainObject(value) || !Array.isArray(value.components) || value.components.length !== 3) return false;
  const unit = (n) => Number.isFinite(n) && n >= 0 && n <= 1;
  const percent = (n) => Number.isFinite(n) && n >= 0 && n <= 100;
  const hue = (n) => Number.isFinite(n) && n >= 0 && n < 360;
  const chroma = (n) => Number.isFinite(n) && n >= 0;
  const ranges = new Map([
    ...["srgb", "srgb-linear", "display-p3", "a98-rgb", "prophoto-rgb", "rec2020", "xyz-d65", "xyz-d50"].map((space) => [space, [unit, unit, unit]]),
    ["hsl", [hue, percent, percent]], ["hwb", [hue, percent, percent]],
    ["lab", [percent, Number.isFinite, Number.isFinite]], ["lch", [percent, chroma, hue]],
    ["oklab", [unit, Number.isFinite, Number.isFinite]], ["oklch", [unit, chroma, hue]],
  ]).get(value.colorSpace);
  return Boolean(ranges) && value.components.every((component, index) => component === "none" || ranges[index](component))
    && (value.alpha === undefined || unit(value.alpha))
    && (value.hex === undefined || (typeof value.hex === "string" && /^#[\da-f]{6}$/iu.test(value.hex)));
}

function hexColor(value) {
  const match = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/iu.exec(value);
  if (!match) throw tokenError(`Color ${value} cannot be represented as a DTCG color.`);
  let hex = match[1];
  if (hex.length <= 4) hex = [...hex].map((part) => part + part).join("");
  const alpha = hex.length === 8 ? Number.parseInt(hex.slice(6), 16) / 255 : 1;
  return {
    colorSpace: "srgb",
    components: [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255),
    alpha,
    hex: `#${hex.slice(0, 6).toUpperCase()}`,
  };
}

function tokenPath(name) {
  if (typeof name !== "string" || !/^[A-Za-z][\w-]*(?:\.[\w-]+)*$/u.test(name)) {
    throw tokenError(`Variable name ${String(name)} is not a dot-separated token path.`);
  }
  return name.split(".");
}

function isToken(value) { return plainObject(value) && Object.hasOwn(value, "$value"); }
function plainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function tokenError(message) { const error = new Error(message); error.code = "CANVAS_TOKEN_INVALID"; return error; }
