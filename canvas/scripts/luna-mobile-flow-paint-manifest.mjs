import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { CASE_IDS, EVIDENCE_PACKAGE, IOS_STATES, ANDROID_STATES, writeImmutableManifest } from "./luna-mobile-flow-paint-capture.mjs";

const root = resolve(process.env.CANVAS_FLOW_PAINT_EVIDENCE_ROOT ?? new URL("../research/luna-mobile-flow-paint-20260907", import.meta.url).pathname);
const sourceReceipt = JSON.parse(await readFile(resolve(root, "source-hashes.json"), "utf8"));
const manifest = await writeImmutableManifest(root, {
  sourceSha256: sourceReceipt.sourceSha256,
  caseIds: CASE_IDS,
  matrices: {
    ios: IOS_STATES.map(({ key }) => key),
    android: ANDROID_STATES.map(({ key }) => key),
  },
  requiredReceipts: ["selection nonce", "readiness/root", "two equal full-frame SHA-256 values", "crop dimensions", "source/APK/binary hashes"],
});
console.log(JSON.stringify({ package: EVIDENCE_PACKAGE, root, immutable: manifest.immutable, files: manifest.files.length }, null, 2));
