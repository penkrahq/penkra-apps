import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// Reproducible native alternative to the pinned Docker validator. Requires
// Java, unzip and GPG; never changes the user's keyring or existing installs.
const version = "1.30.2";
const fingerprint = "13DD102B4DD69354D12DE5A83184863278B17FE7";
const destination = resolve(process.argv[2] ?? fileURLToPath(new URL(`../tmp/tools/verapdf-${version}`, import.meta.url)));
const execute = promisify(execFile);
if (await access(destination).then(() => true, () => false)) throw new Error(`Destination already exists: ${destination}`);
const temporary = await mkdtemp(join(tmpdir(), "canvas-verapdf-install-"));
try {
  const archive = `https://software.verapdf.org/rel/1.30/verapdf-greenfield-${version}-installer.zip`;
  const downloads = await Promise.all([archive, `${archive}.asc`, "https://software.verapdf.org/keys/KEY"].map(async url => {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
    return Buffer.from(await response.arrayBuffer());
  }));
  for (const [index, name] of ["installer.zip", "installer.zip.asc", "KEY"].entries()) await writeFile(join(temporary, name), downloads[index]);
  const keyring = join(temporary, "gnupg");
  await mkdir(keyring); await chmod(keyring, 0o700);
  const publicKeys = join(keyring, "publisher.gpg");
  await execute("gpg", ["--homedir", keyring, "--batch", "--dearmor", "--output", publicKeys, join(temporary, "KEY")], { timeout: 15_000 });
  // gpgv needs no signing agent or user trust database, including on macOS
  // where a long temporary directory can exceed Unix socket path limits.
  const signature = await execute("gpgv", ["--homedir", keyring, "--keyring", publicKeys, "--status-fd", "1", join(temporary, "installer.zip.asc"), join(temporary, "installer.zip")], { timeout: 15_000 });
  assert.ok(signature.stdout.split("\n").some(line => line.startsWith(`[GNUPG:] VALIDSIG ${fingerprint} `)), "The installer must be signed by the pinned publisher key");
  await execute("unzip", ["-q", join(temporary, "installer.zip"), "-d", temporary], { timeout: 30_000 });
  const escape = value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const configuration = join(temporary, "install.xml");
  await writeFile(configuration, `<AutomatedInstallation langpack="eng">
<com.izforge.izpack.panels.htmlhello.HTMLHelloPanel id="welcome"/>
<com.izforge.izpack.panels.target.TargetPanel id="install_dir"><installpath>${escape(destination)}</installpath></com.izforge.izpack.panels.target.TargetPanel>
<com.izforge.izpack.panels.packs.PacksPanel id="sdk_pack_select">
<pack index="0" name="veraPDF GUI" selected="true"/>
<pack index="1" name="veraPDF Mac and *nix Scripts" selected="true"/>
<pack index="2" name="veraPDF Validation model" selected="false"/>
<pack index="3" name="veraPDF Documentation" selected="false"/>
<pack index="4" name="veraPDF Sample Plugins" selected="false"/>
</com.izforge.izpack.panels.packs.PacksPanel>
<com.izforge.izpack.panels.install.InstallPanel id="install"/>
<com.izforge.izpack.panels.finish.FinishPanel id="finish"/>
</AutomatedInstallation>`);
  await execute("java", ["-jar", join(temporary, `verapdf-greenfield-${version}`, `verapdf-izpack-installer-${version}.jar`), configuration], { timeout: 90_000 });
  const installed = await execute(join(destination, "verapdf"), ["--version"], { timeout: 15_000 });
  assert.match(installed.stdout, /\b1\.30\.2\b/u);
  console.log(JSON.stringify({ version, destination, fingerprint, installerSha256: createHash("sha256").update(downloads[0]).digest("hex") }));
} finally { await rm(temporary, { recursive: true, force: true }); }
