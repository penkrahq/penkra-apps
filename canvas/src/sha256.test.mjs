import { describe, expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";

import { sha256 } from "./sha256.mjs";

describe("sha256", () => {
  test.each([
    "",
    "abc",
    "SchoolBase — yɛn sukuu",
    "a".repeat(55),
    "a".repeat(56),
    "a".repeat(64),
    "a".repeat(129),
  ])("matches the platform digest for string input", (value) => {
    expect(sha256(value)).toBe(createHash("sha256").update(value).digest("hex"));
  });

  test("hashes only the visible portion of a typed array", () => {
    const bytes = randomBytes(160);
    const view = new Uint8Array(bytes.buffer, bytes.byteOffset + 17, 97);
    expect(sha256(view)).toBe(createHash("sha256").update(view).digest("hex"));
  });
});
