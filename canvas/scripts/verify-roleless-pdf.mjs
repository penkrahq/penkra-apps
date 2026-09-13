import { resolve } from "node:path";
import { extractDocumentNode } from "../src/export-service.mjs";

const document = { version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{
  id: "poster", type: "frame", layout: "none", width: 480, height: 320, fill: "#ffffff",
  children: [
    { id: "title", type: "text", x: 28, y: 24, width: 424, height: 44, content: "Roleless PDF", fontFamily: "Inter", fontSize: 28, fill: "#123456", marks: [], paragraphs: [{ from: 0, to: 12 }] },
    { id: "caption", type: "text", x: 28, y: 70, width: 424, height: 32, content: "Native paths and embedded text", fontFamily: "Inter", fontSize: 16, fill: "#345678", marks: [], paragraphs: [{ from: 0, to: 30 }] },
    { id: "donut", type: "path", x: 28, y: 125, width: 150, height: 150, viewBox: [0, 0, 100, 100], geometry: "M0 0H100V100H0Z M25 25H75V75H25Z", fillRule: "evenodd", fill: "#167d9a" },
    { id: "pentagon", type: "polygon", x: 220, y: 125, width: 150, height: 150, viewBox: [0, 0, 100, 100], geometry: "M50 0L100 38L81 100L19 100L0 38Z", fill: "#d77729" },
  ],
}] };
const destination = resolve(process.argv[2] ?? "tmp/pdfs/roleless-extraction.pdf");
console.log(JSON.stringify(await extractDocumentNode(document, { nodeId: "poster", format: "pdf", destination }), null, 2));
