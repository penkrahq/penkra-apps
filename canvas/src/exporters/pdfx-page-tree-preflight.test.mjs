import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PDFDocument, PDFName, PDFNumber, PDFRef } from "pdf-lib";
import { preflightPdfx4 } from "./pdfx-preflight.mjs";

const CANDIDATE = new URL("../../research/luna-pdfx-document-negative-matrix-20260907/valid-candidate-control-classic-xref.pdf", import.meta.url);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const treeIssues = (report) => report.issues.filter(({ code }) => code === "PDF_PAGE_TREE_INVALID");
const issueSummary = (report) => report.issues.map(({ code, object, detail }) => ({ code, object, detail }));
const PREFLIGHT_MODULE = pathToFileURL(fileURLToPath(new URL("./pdfx-preflight.mjs", import.meta.url))).href;
const CHILD_PREFLIGHT_PROGRAM = `
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const bytes = Buffer.from(Buffer.concat(chunks).toString("utf8").trim(), "base64");
  const { preflightPdfx4 } = await import(process.env.PDFX_PREFLIGHT_MODULE);
  const report = await preflightPdfx4(bytes);
  process.stdout.write(JSON.stringify({ issues: report.issues, conformant: report.conformant }));
`;

async function boundedPreflight(bytes) {
  let timer;
  try {
    return await Promise.race([
      preflightPdfx4(bytes),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("page-tree preflight timeout")), 2500); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function runIsolatedChild(program, bytes, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", program], {
      env: { ...process.env, PDFX_PREFLIGHT_MODULE: PREFLIGHT_MODULE },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let forceTimer;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceTimer = setTimeout(() => child.kill("SIGKILL"), 150);
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      clearTimeout(forceTimer);
      resolve({ code, signal, stderr, stdout, timedOut });
    });
    if (bytes) child.stdin.end(Buffer.from(bytes).toString("base64"));
    else child.stdin.end();
  });
}

async function isolatedPreflight(bytes) {
  const result = await runIsolatedChild(CHILD_PREFLIGHT_PROGRAM, bytes, 5000);
  assert.equal(result.timedOut, false, `isolated preflight timed out: ${result.stderr}`);
  assert.equal(result.code, 0, result.stderr);
  return JSON.parse(result.stdout);
}

async function mutatedCandidate(mutate) {
  const source = new Uint8Array(await readFile(CANDIDATE));
  const pdf = await PDFDocument.load(source, { updateMetadata: false, throwOnInvalidObject: true });
  mutate(pdf);
  const bytes = await pdf.save({ useObjectStreams: false });
  await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  return bytes;
}

async function rawMutatedCandidate(kind) {
  const source = Buffer.from(await readFile(CANDIDATE));
  const pdf = await PDFDocument.load(source, { updateMetadata: false, throwOnInvalidObject: true });
  const rootRef = pdf.catalog.get(PDFName.of("Pages"));
  const leafRef = pdf.catalog.Pages().Kids().get(0);
  const old = `/Kids [ ${leafRef.objectNumber} 0 R ]`;
  let replacement;
  if (kind === "cycle") replacement = `/Kids [ ${rootRef.objectNumber} 0 R ]`;
  else {
    replacement = `/Kids 7${" ".repeat(old.length - "/Kids 7".length)}`;
  }
  const text = source.toString("latin1");
  assert.equal(text.split(old).length, 2, `${kind} raw page-tree pattern was not unique`);
  const bytes = Buffer.from(text.replace(old, replacement), "latin1");
  await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  return bytes;
}

test("retained valid candidate has a clean page-tree report", { timeout: 4000 }, async () => {
  const bytes = new Uint8Array(await readFile(CANDIDATE));
  const before = sha256(bytes);
  const first = await boundedPreflight(bytes);
  const second = await boundedPreflight(bytes);
  assert.deepEqual(treeIssues(first), []);
  assert.deepEqual(issueSummary(first), issueSummary(second));
  assert.equal(first.conformant, false);
  assert.equal(sha256(bytes), before, "preflight mutated the retained candidate bytes");
});

const CASES = [
  { name: "Count999", mutate: (pdf) => pdf.catalog.Pages().set(PDFName.of("Count"), PDFNumber.of(999)) },
  { name: "missingParent", mutate: (pdf) => {
    const pages = pdf.catalog.Pages();
    const leaf = pdf.context.lookup(pages.Kids().get(0));
    leaf.delete(PDFName.of("Parent"));
  } },
  { name: "wrongParent", mutate: (pdf) => {
    const pages = pdf.catalog.Pages();
    const leaf = pdf.context.lookup(pages.Kids().get(0));
    leaf.set(PDFName.of("Parent"), PDFRef.of(999999));
  } },
  { name: "duplicatechild", mutate: (pdf) => {
    const pages = pdf.catalog.Pages();
    pages.Kids().push(pages.Kids().get(0));
  } },
  { name: "cycle", raw: "cycle" },
  { name: "malformedKids", raw: "malformedKids" },
];

for (const { name, mutate, raw } of CASES) {
  test(`preflight rejects serialized page-tree ${name}`, { timeout: 7000 }, async () => {
    const bytes = raw ? await rawMutatedCandidate(raw) : await mutatedCandidate(mutate);
    const before = sha256(bytes);
    const run = raw ? isolatedPreflight : boundedPreflight;
    const first = await run(bytes);
    const second = await run(bytes);
    const issues = treeIssues(first);
    assert.ok(issues.length > 0, `${name} produced no page-tree issue`);
    assert.deepEqual(new Set(issues.map(({ code }) => code)), new Set(["PDF_PAGE_TREE_INVALID"]));
    assert.deepEqual(issueSummary(first), issueSummary(second), `${name} report order changed`);
    assert.equal(first.conformant, false);
    assert.equal(sha256(bytes), before, `${name} preflight mutated input bytes`);
  });
}

test("parent timeout terminates a deliberately nonterminating child control", { timeout: 2000 }, async () => {
  const started = Date.now();
  const result = await runIsolatedChild("for (;;) {}", null, 350);
  assert.equal(result.timedOut, true);
  assert.ok(Date.now() - started < 2000, "timeout control exceeded parent bound");
  assert.ok(result.signal || result.code !== 0, "nonterminating control was not terminated");
});
