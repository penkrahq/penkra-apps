import { icons } from "lucide";
import feather from "@iconify-json/feather/icons.json" with { type: "json" };
import materialSymbols from "@iconify-json/material-symbols/icons.json" with { type: "json" };
import phosphor from "@iconify-json/ph/icons.json" with { type: "json" };

const ICON_PROVIDERS = new Map([
  ["lucide", (name) => lucideIcon(name)],
  ["feather", (name) => iconifyIcon(feather, name, "stroke")],
  ["Material Symbols Outlined", (name, weight) => materialIcon(name, "outline", weight)],
  ["Material Symbols Rounded", (name, weight) => materialIcon(name, "outline-rounded", weight)],
  ["Material Symbols Sharp", (name, weight) => materialIcon(name, "outline-sharp", weight)],
  ["phosphor", (name, weight) => phosphorIcon(name, weight)],
]);

export function pencilIconDefinition(library, name, weight = 400) {
  if (typeof library !== "string" || typeof name !== "string") return null;
  return ICON_PROVIDERS.get(library)?.(name, normalizeWeight(weight)) ?? null;
}

function lucideIcon(name) {
  if (typeof name !== "string") return null;
  const icon = icons[toPascalCase(name)];
  if (!icon) return null;
  const geometry = icon.map(([element, attributes]) => primitivePath(element, attributes));
  if (geometry.some((path) => path === null)) return null;
  return {
    geometry: geometry.map(isolateSvgSubpath).join(" "),
    viewBox: [0, 0, 24, 24],
    paint: "stroke",
    strokeWidth: 2,
  };
}

function materialIcon(name, suffix, weight) {
  if (weight < 100 || weight > 700) return null;
  const catalogName = name.replaceAll("_", "-");
  if (!resolveIconifyAlias(materialSymbols, `${catalogName}-${suffix}`)) return null;
  return {
    fontFamily: ({
      outline: "Material Symbols Outlined",
      "outline-rounded": "Material Symbols Rounded",
      "outline-sharp": "Material Symbols Sharp",
    })[suffix],
    content: catalogName.replaceAll("-", "_"),
    weight,
    paint: "font",
  };
}

function phosphorIcon(name, weight) {
  const suffix = ({ 100: "thin", 300: "light", 400: "", 700: "bold" })[weight];
  if (suffix === undefined) return null;
  return iconifyIcon(phosphor, suffix && !name.endsWith(`-${suffix}`) ? `${name}-${suffix}` : name, "fill");
}

function normalizeWeight(value) {
  const weight = Number(value);
  return Number.isFinite(weight) ? weight : 400;
}

function iconifyIcon(collection, requestedName, paint) {
  const resolved = resolveIconifyAlias(collection, requestedName);
  if (!resolved) return null;
  const layers = [...resolved.body.matchAll(/<path\b([^>]*)>/gu)].flatMap((match) => {
    const attributes = match[1];
    const path = attributes.match(/\bd=(?:"([^"]+)"|'([^']+)')/u);
    if (!path) return [];
    const opacity = attributes.match(/\bopacity=(?:"([^"]+)"|'([^']+)')/u);
    return [{
      geometry: isolateSvgSubpath(path[1] ?? path[2]),
      opacity: opacity ? Number(opacity[1] ?? opacity[2]) : 1,
    }];
  });
  if (layers.length === 0 || layers.some(({ opacity }) => !Number.isFinite(opacity))) return null;
  return {
    geometry: layers.map(({ geometry }) => geometry).join(" "),
    layers: layers.some(({ opacity }) => opacity !== 1) ? layers : undefined,
    viewBox: [0, 0, resolved.width, resolved.height],
    paint,
    strokeWidth: paint === "stroke" ? 2 : undefined,
  };
}

function resolveIconifyAlias(collection, name, trail = new Set()) {
  if (trail.has(name)) return null;
  const icon = collection.icons?.[name];
  if (icon) {
    return {
      ...icon,
      width: icon.width ?? collection.width ?? 16,
      height: icon.height ?? collection.height ?? 16,
    };
  }
  const alias = collection.aliases?.[name];
  if (!alias?.parent) return null;
  trail.add(name);
  return resolveIconifyAlias(collection, alias.parent, trail);
}

function isolateSvgSubpath(path) {
  // An initial relative moveto is relative to the origin in its own SVG path,
  // but relative to the preceding endpoint after paths are combined. Resetting
  // the current point before every source path preserves the complete command,
  // including relative coordinate pairs after its first moveto.
  return `M0 0 ${String(path)}`;
}

function primitivePath(element, attributes) {
  if (element === "path") return attributes.d ?? null;
  if (element === "line") {
    return `M${attributes.x1} ${attributes.y1} L${attributes.x2} ${attributes.y2}`;
  }
  if (element === "polyline") return pointsPath(attributes.points, false);
  if (element === "polygon") return pointsPath(attributes.points, true);
  if (element === "circle") {
    return ellipsePath(attributes.cx, attributes.cy, attributes.r, attributes.r);
  }
  if (element === "ellipse") {
    return ellipsePath(attributes.cx, attributes.cy, attributes.rx, attributes.ry);
  }
  if (element === "rect") return rectanglePath(attributes);
  return null;
}

function pointsPath(points, closed) {
  const coordinates = String(points ?? "").match(/-?\d*\.?\d+/gu)?.map(Number) ?? [];
  if (coordinates.length < 2 || coordinates.length % 2 !== 0) return null;
  const commands = [];
  for (let index = 0; index < coordinates.length; index += 2) {
    commands.push(`${index === 0 ? "M" : "L"}${coordinates[index]} ${coordinates[index + 1]}`);
  }
  return `${commands.join(" ")}${closed ? " Z" : ""}`;
}

function ellipsePath(cxValue, cyValue, rxValue, ryValue) {
  const cx = Number(cxValue);
  const cy = Number(cyValue);
  const rx = Number(rxValue);
  const ry = Number(ryValue);
  if (![cx, cy, rx, ry].every(Number.isFinite)) return null;
  return `M${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}`;
}

function rectanglePath(attributes) {
  const x = Number(attributes.x ?? 0);
  const y = Number(attributes.y ?? 0);
  const width = Number(attributes.width);
  const height = Number(attributes.height);
  const radius = Math.min(Number(attributes.rx ?? attributes.ry ?? 0), width / 2, height / 2);
  if (![x, y, width, height, radius].every(Number.isFinite)) return null;
  if (radius <= 0) return `M${x} ${y} H${x + width} V${y + height} H${x} Z`;
  return `M${x + radius} ${y} H${x + width - radius} A${radius} ${radius} 0 0 1 ${x + width} ${y + radius} V${y + height - radius} A${radius} ${radius} 0 0 1 ${x + width - radius} ${y + height} H${x + radius} A${radius} ${radius} 0 0 1 ${x} ${y + height - radius} V${y + radius} A${radius} ${radius} 0 0 1 ${x + radius} ${y} Z`;
}

function toPascalCase(value) {
  return value.split("-").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join("");
}
