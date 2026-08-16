import { icons } from "lucide";

export function lucideIconGeometry(name) {
  if (typeof name !== "string") return null;
  const icon = icons[toPascalCase(name)];
  if (!icon) return null;
  const geometry = icon.map(([element, attributes]) => primitivePath(element, attributes));
  if (geometry.some((path) => path === null)) return null;
  return `M0 0 M24 24 ${geometry.join(" ")}`;
}

export function phosphorIconGeometry(name) {
  if (name !== "push-pin-fill") return null;
  return "M0 0 M256 256 M235.33 104l-53.47 53.65c4.56 12.67 6.45 33.89-13.19 60A15.93 15.93 0 0 1 157 224c-.38 0-.75 0-1.13 0a16 16 0 0 1-11.32-4.69L96.29 171 53.66 213.66a8 8 0 0 1-11.32-11.32L85 159.71l-48.3-48.3A16 16 0 0 1 38 87.63c25.42-20.51 49.75-16.48 60.4-13.14L152 20.7a16 16 0 0 1 22.63 0l60.69 60.68A16 16 0 0 1 235.33 104Z";
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
