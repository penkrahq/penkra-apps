import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const runner = fileURLToPath(new URL("../scripts/test.mjs", import.meta.url));
for (const invalidKind of ["missing", "directory", "glob"]) {
  test(`strict runner rejects ${invalidKind} paths before executing any fixture`, { timeout: 15_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "canvas-test-runner-"));
    try {
      const sentinel = join(root, "executed");
      const fixture = join(root, "fixture.mjs");
      await writeFile(fixture, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(sentinel)}, 'executed');`);
      const invalid = invalidKind === "directory" ? root : join(root, invalidKind === "glob" ? "*.mjs" : "missing.mjs");
      const env = { ...process.env };
      delete env.NODE_TEST_CONTEXT;
      const result = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [runner, fixture, invalid], { env, timeout: 10_000 });
        let stderr = "";
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        child.stdout.resume();
        child.on("error", reject);
        child.on("close", (code) => resolve({ code, stderr }));
      });
      assert.equal(result.code, 1);
      assert.match(result.stderr, /CANVAS_TEST_FILE_INVALID/u);
      await assert.rejects(access(sentinel), { code: "ENOENT" });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
test("strict runner rejects CLI flags before executing any fixture", { timeout: 15_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "canvas-test-runner-"));
  try {
    const sentinel = join(root, "executed");
    const fixture = join(root, "fixture.mjs");
    await writeFile(fixture, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(sentinel)}, 'executed');`);
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [runner, "--test-name-pattern=probe", fixture], { env, timeout: 10_000 });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.stdout.resume();
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stderr }));
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /CANVAS_TEST_ARGUMENT_INVALID/u);
    await assert.rejects(access(sentinel), { code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
for (const [name, body, expected] of [
  ["pass", "test('pass', () => {});", 0],
  ["failure", "test('fail', () => { throw new Error('fixture'); });", 1],
  ["timeout", "test('timeout', { timeout: 30 }, async () => { await new Promise(resolve => setTimeout(resolve, 100)); });", 1],
  ["cancelled", "const controller = new AbortController(); test('cancelled', { signal: controller.signal }, async () => { await new Promise(resolve => setTimeout(resolve, 100)); }); setTimeout(() => controller.abort(), 30);", 1],
]) {
  test(`strict suite exit status: ${name}`, { timeout: 15_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "canvas-test-runner-"));
    try {
      const fixture = join(root, "fixture.mjs");
      await writeFile(fixture, `import test from 'node:test';\n${body}\n`);
      const result = await new Promise((resolve, reject) => {
        const env = { ...process.env };
        delete env.NODE_TEST_CONTEXT;
        const child = spawn(process.execPath, [runner, fixture], { env, timeout: 10_000 });
        let output = "";
        child.stdout.on("data", chunk => { output += chunk; });
        child.stderr.on("data", chunk => { output += chunk; });
        child.on("error", reject);
        child.on("close", (code) => resolve({ code, output }));
      });
      assert.equal(result.code, expected, result.output);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
