import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { resolve } from "node:path";
import {
  CASE_IDS, DENSITIES, FONT_SCALES, appendJustifyMeasurement, evidencePaths,
  measureJustifyCapture, prepareJustifyCase, writeJustifyMeasurement, writeJustifyReference,
} from "./luna-android-justify-generate.mjs";

const exec = promisify(execFile);
const adb = "/Users/emmanuelgyekyeatta-penkra/Library/Android/sdk/platform-tools/adb";
const composeDir = resolve(import.meta.dirname, "../compatibility/mobile-fixtures/compose");
const apk = resolve(composeDir, "app/build/outputs/apk/debug/app-debug.apk");
const evidenceDir = resolve(process.env.LUNA_ANDROID_JUSTIFY_EVIDENCE_DIR ?? resolve(import.meta.dirname, "../research/luna-android-justify-20260906"));
const reportPath = resolve(evidenceDir, "measurements.json");

async function adbRun(args, options = {}) {
  try {
    const result = await exec(adb, ["-s", "emulator-5554", ...args], { encoding: options.buffer ? "buffer" : "utf8", maxBuffer: 30 * 1024 * 1024 });
    return result.stdout;
  } catch (error) {
    if (options.allowFailure) return error;
    throw new Error(`adb ${args.join(" ")} failed: ${error.stdout ?? ""}${error.stderr ?? error.message}`);
  }
}

function currentDensity(output) {
  const override = String(output).match(/Override density:\s*(\d+)/u);
  const physical = String(output).match(/Physical density:\s*(\d+)/u);
  return { value: Number((override ?? physical)?.[1]), overridden: Boolean(override) };
}

async function wait(ms) { await new Promise((resolvePromise) => setTimeout(resolvePromise, ms)); }

async function main() {
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(reportPath, "[]\n");
  const deviceList = await exec(adb, ["devices"], { encoding: "utf8" });
  if (!/emulator-5554\s+device/u.test(deviceList.stdout)) throw new Error(`emulator-5554 is not attached:\n${deviceList.stdout}`);
  const initialDensity = currentDensity(await adbRun(["shell", "wm", "density"]));
  const initialFontScale = String(await adbRun(["shell", "settings", "get", "system", "font_scale"])).trim();
  const initial = { density: initialDensity.value, densityWasOverridden: initialDensity.overridden, fontScale: Number(initialFontScale), device: "emulator-5554", avd: "penkra_api36_pixel8" };
  await writeFile(resolve(evidenceDir, "device-settings-initial.json"), `${JSON.stringify(initial, null, 2)}\n`);
  console.log(`device initial density=${initial.density} override=${initialDensity.overridden} fontScale=${initial.fontScale}`);
  try {
    for (const caseId of CASE_IDS) {
      await prepareJustifyCase(caseId, evidenceDir);
      const build = await exec("./gradlew", ["--no-daemon", "--max-workers", "2", ":app:assembleDebug"], { cwd: composeDir, encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
      await writeFile(resolve(evidenceDir, `build-${caseId}.log`), `${build.stdout}\n${build.stderr}`);
      await adbRun(["install", "-r", apk]);
      console.log(`case ${caseId}: APK assembled and installed`);
      for (const density of DENSITIES) for (const fontScale of FONT_SCALES) {
        await adbRun(["shell", "wm", "density", String(density)]);
        await adbRun(["shell", "settings", "put", "system", "font_scale", String(fontScale)]);
        await adbRun(["shell", "am", "force-stop", "com.penkra.canvas.fixture"]);
        await adbRun(["shell", "am", "start", "-n", "com.penkra.canvas.fixture/.MainActivity"]);
        // Density/font reconfiguration can leave the launcher splash visible
        // for several seconds before the Compose content is resumed.
        await wait(10000);
        const paths = evidencePaths(caseId, density, fontScale, evidenceDir);
        const capture = await adbRun(["exec-out", "screencap", "-p"], { buffer: true });
        await writeFile(paths.capturePath, capture);
        await writeJustifyReference(caseId, density, evidenceDir);
        const row = await measureJustifyCapture(caseId, density, fontScale, paths.capturePath, evidenceDir);
        await writeJustifyMeasurement(row, evidenceDir);
        await appendJustifyMeasurement(row, reportPath);
        console.log(`case ${caseId} density=${density} fontScale=${fontScale}: ${row.status} compared=${row.comparedPixels} mismatched=${row.mismatchedPixels}`);
      }
    }
  } finally {
    if (initialDensity.overridden) await adbRun(["shell", "wm", "density", String(initialDensity.value)], { allowFailure: true });
    else await adbRun(["shell", "wm", "density", "reset"], { allowFailure: true });
    await adbRun(["shell", "settings", "put", "system", "font_scale", String(initial.fontScale)], { allowFailure: true });
    const restored = { density: currentDensity(await adbRun(["shell", "wm", "density"], { allowFailure: true })), fontScale: String(await adbRun(["shell", "settings", "get", "system", "font_scale"], { allowFailure: true })).trim() };
    await writeFile(resolve(evidenceDir, "device-settings-restored.json"), `${JSON.stringify(restored, null, 2)}\n`);
    console.log(`device restored density=${restored.density.value} override=${restored.density.overridden} fontScale=${restored.fontScale}`);
  }
}

await main();
