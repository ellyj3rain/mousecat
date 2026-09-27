import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadConfig } from "../src/core/config.mjs";

test("local config loading tolerates BOM-prefixed JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mousecat-config-"));
  const path = join(dir, "mousecat.config.json");

  try {
    await writeFile(path, "\uFEFF{\"hostProfile\":\"windows-local\"}", "utf8");
    const config = await loadConfig(path);

    assert.equal(config.hostProfile, "windows-local");
    assert.equal(config.adapterProfile, "generic-mcp");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
