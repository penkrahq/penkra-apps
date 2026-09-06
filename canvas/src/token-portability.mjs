import { resolveVariableReferences, variableReferences } from "./variable-references.mjs";

const CANVAS_EXTENSION = "com.penkra.canvas";
export const PORTABLE_TOKEN_TYPES = Object.freeze([
  "color", "dimension", "number", "string", "fontFamily", "duration",
]);

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
    Object.defineProperty(group, leaf, { enumerable: true, writable: true, configurable: true, value: {
      $type: definition.tokenType,
      $value: toDtcgValue(definition.cascade[0].value, definition.tokenType),
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
  const resolveEntry = (owner, index, trail = []) => {
    if (trail.includes(owner)) throw tokenError(`Variable cycle: ${[...trail, owner].join(" -> ")}.`);
    const definition = variables[owner];
    if (!plainObject(definition) || !PORTABLE_TOKEN_TYPES.includes(definition.tokenType)
      || !Array.isArray(definition.cascade) || definition.cascade.length === 0) {
      throw tokenError(`Variable ${owner} must declare a supported tokenType and non-empty cascade.`);
    }
    const entry = definition.cascade[index] ?? definition.cascade[0];
    if (!plainObject(entry) || !Object.hasOwn(entry, "value")) throw tokenError(`Variable ${owner} has an invalid cascade entry.`);
    const resolved = resolveVariableReferences(entry.value, (reference) => {
      if (!Object.hasOwn(variables, reference)) throw tokenError(`Variable ${owner} references missing variable ${reference}.`);
      const target = variables[reference];
      const whole = typeof entry.value === "string" && variableReferences(entry.value).length === 1
        && variableReferences(entry.value)[0][0] === entry.value;
      if (whole && target.tokenType !== definition.tokenType) {
        throw tokenError(`Variable ${owner} (${definition.tokenType}) aliases ${reference} (${target.tokenType}).`);
      }
      return resolveEntry(reference, index, [...trail, owner]);
    });
    assertTokenValue(definition.tokenType, resolved, owner);
    return resolved;
  };
  for (const [name, definition] of Object.entries(variables)) {
    if (!plainObject(definition) || !Array.isArray(definition.cascade)) {
      throw tokenError(`Variable ${name} must declare a supported tokenType and non-empty cascade.`);
    }
    definition.cascade.forEach((_, index) => resolveEntry(name, index));
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
    || (plainObject(value) && typeof value.colorSpace === "string" && Array.isArray(value.components)
      && value.components.every((item) => item === "none" || finite(item))
      && (value.alpha === undefined || (finite(value.alpha) && value.alpha >= 0 && value.alpha <= 1)));
  if (!valid) throw tokenError(`Variable ${name} value does not satisfy ${type}.`);
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
