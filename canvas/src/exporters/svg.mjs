export function exportSvg(ir, output, options = {}) {
  const children = output.nodes.sort((a, b) => a.z - b.z).map((node) => svgNode(node, options)).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${output.width}" height="${output.height}" viewBox="0 0 ${output.width} ${output.height}" role="img">\n${children}\n</svg>\n`;
}
function svgNode(node, options) {
  const { x, y, w, h, rotation } = node.geometry;
  const transform = rotation ? ` transform="rotate(${rotation} ${x + w / 2} ${y + h / 2})"` : "";
  if (node.capability.verdict === "ignore") return "";
  if (node.capability.verdict === "raster") {
    const href = options.rasterHref?.(node.id);
    if (!href) throw new Error(`SVG rasterizer is required for ${node.id}.`);
    return `<image id="${esc(node.id)}" x="${x}" y="${y}" width="${w}" height="${h}" href="${esc(href)}"${transform}/>`;
  }
  if (node.type === "text") return `<text id="${esc(node.id)}" x="${x}" y="${y + (node.semantics.runs[0]?.fontSize ?? 16)}"${transform}>${node.semantics.runs.map((run) => `<tspan font-family="${esc(run.fontFamily ?? "sans-serif")}" font-size="${run.fontSize ?? 16}" font-weight="${run.weight ?? run.fontWeight ?? 400}" fill="${esc(color(run.fill) ?? "#000")}">${esc(node.semantics.content.slice(run.from, run.to))}</tspan>`).join("")}</text>`;
  const fill = color(node.paint.fill) ?? "none"; const stroke = color(node.paint.stroke?.fill ?? node.paint.stroke?.color) ?? "none";
  if (node.type === "ellipse") return `<ellipse id="${esc(node.id)}" cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${fill}" stroke="${stroke}"${transform}/>`;
  if (node.type === "line") return `<line id="${esc(node.id)}" x1="${x}" y1="${y}" x2="${x + w}" y2="${y + h}" stroke="${stroke}"${transform}/>`;
  return `<rect id="${esc(node.id)}" x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" opacity="${node.paint.opacity}"${transform}/>`;
}
function color(value) { return typeof value === "string" ? value : value?.color; }
function esc(value) { return String(value).replace(/[&<>"']/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
