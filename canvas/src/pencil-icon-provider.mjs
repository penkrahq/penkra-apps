import { icons } from "lucide";
import feather from "@iconify-json/feather/icons.json" with { type: "json" };
import materialSymbols from "@iconify-json/material-symbols/icons.json" with { type: "json" };
import phosphor from "@iconify-json/ph/icons.json" with { type: "json" };
import svgpath from "svgpath";

const ICON_PROVIDERS = new Map([
  ["lucide", (name) => lucideIcon(name)],
  ["feather", (name) => iconifyIcon(feather, name, "stroke")],
  ["Material Symbols Outlined", (name, weight) => materialIcon(name, "outline", weight)],
  ["Material Symbols Rounded", (name, weight) => materialIcon(name, "outline-rounded", weight)],
  ["Material Symbols Sharp", (name, weight) => materialIcon(name, "outline-sharp", weight)],
  ["phosphor", (name, weight) => phosphorIcon(name, weight)],
]);
export const CANVAS_ICON_LIBRARIES = Object.freeze([...ICON_PROVIDERS.keys()]);
const iconCatalogs = new Map();

export function pencilIconDefinition(library, name, weight = 400) {
  if (typeof library !== "string" || typeof name !== "string") return null;
  return ICON_PROVIDERS.get(library)?.(name, normalizeWeight(weight)) ?? null;
}

export function searchCanvasIcons(query, options = {}) {
  const normalizedQuery = String(query ?? "").trim().toLowerCase();
  if (!normalizedQuery) throw new TypeError("Icon search requires a non-empty query.");
  const limit = options.limit ?? 40;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new TypeError("Icon search limit must be an integer from 1 through 100.");
  }
  const libraries = options.library === undefined
    ? CANVAS_ICON_LIBRARIES
    : CANVAS_ICON_LIBRARIES.includes(options.library)
      ? [options.library]
      : (() => { throw new TypeError(`Unknown Canvas icon library ${JSON.stringify(options.library)}.`); })();
  const terms = normalizedQuery.split(/\s+/u);
  const matches = libraries.flatMap((library) => iconCatalog(library)
    .filter((icon) => terms.every((term) => icon.includes(term)))
    .map((icon) => ({ library, icon, rank: iconRank(icon, normalizedQuery) })));
  matches.sort((left, right) => left.rank - right.rank
    || left.icon.length - right.icon.length
    || left.icon.localeCompare(right.icon)
    || left.library.localeCompare(right.library));
  return {
    items: matches.slice(0, limit).map(({ library, icon }) => ({ library, icon })),
    total: matches.length,
    truncated: matches.length > limit,
  };
}

function iconCatalog(library) {
  if (iconCatalogs.has(library)) return iconCatalogs.get(library);
  let names;
  if (library === "lucide") names = Object.keys(icons).map(pascalToKebab);
  else if (library === "feather") names = iconifyNames(feather);
  else if (library === "phosphor") names = iconifyNames(phosphor);
  else {
    const suffix = ({
      "Material Symbols Outlined": "-outline",
      "Material Symbols Rounded": "-outline-rounded",
      "Material Symbols Sharp": "-outline-sharp",
    })[library];
    names = iconifyNames(materialSymbols)
      .filter((name) => name.endsWith(suffix))
      .map((name) => name.slice(0, -suffix.length).replaceAll("-", "_"));
  }
  const catalog = Object.freeze([...new Set(names)].sort());
  iconCatalogs.set(library, catalog);
  return catalog;
}

function iconifyNames(collection) {
  return [...Object.keys(collection.icons ?? {}), ...Object.keys(collection.aliases ?? {})];
}

function pascalToKebab(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/gu, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/gu, "$1-$2")
    .toLowerCase();
}

function iconRank(icon, query) {
  if (icon === query) return 0;
  if (icon.startsWith(`${query}-`) || icon.startsWith(`${query}_`)) return 1;
  if (icon.split(/[-_]/u).includes(query)) return 2;
  return 3;
}

// Serialization needs path data even where the interactive Canvas uses the
// bundled Material Symbols font.
export function pencilIconVectorDefinition(library, name, weight = 400) {
  if (typeof library !== "string" || typeof name !== "string") return null;
  const normalized = normalizeWeight(weight);
  if (library === "Material Symbols Outlined") return iconifyIcon(materialSymbols, `${name.replaceAll("_", "-")}-outline`, "fill");
  if (library === "Material Symbols Rounded") return iconifyIcon(materialSymbols, `${name.replaceAll("_", "-")}-outline-rounded`, "fill");
  if (library === "Material Symbols Sharp") return iconifyIcon(materialSymbols, `${name.replaceAll("_", "-")}-outline-sharp`, "fill");
  return ICON_PROVIDERS.get(library)?.(name, normalized) ?? null;
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
  if (/-(?:thin|light|bold|fill|duotone)$/u.test(name)) {
    return iconifyIcon(phosphor, name, "fill");
  }
  const suffix = ({ 100: "thin", 300: "light", 400: "", 700: "bold" })[weight];
  if (suffix === undefined) return null;
  return iconifyIcon(phosphor, suffix ? `${name}-${suffix}` : name, "fill");
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
      geometry: paint === "fill"
        ? closeSvgFillSubpaths(path[1] ?? path[2])
        : isolateSvgSubpath(path[1] ?? path[2]),
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

function closeSvgFillSubpaths(path) {
  const normalized = svgpath(String(path)).abs().unshort().unarc().toString();
  let firstMove = true;
  const closed = normalized.replace(/M/gu, () => {
    if (firstMove) {
      firstMove = false;
      return "M";
    }
    return "Z M";
  });
  return `${closed} Z`;
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
