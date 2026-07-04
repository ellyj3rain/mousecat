import test from "node:test";
import assert from "node:assert/strict";

import {
  computeNextRootVersion,
  parseRootVersion,
  projectRootVersionToPackageVersion,
} from "../src/core/governance/version.mjs";

test("root VERSION uses the Kohai-aware four-coordinate form", () => {
  const parsed = parseRootVersion("0.1.4.0-alpha");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.major, 0);
  assert.equal(parsed.minor, 1);
  assert.equal(parsed.kohai, 4);
  assert.equal(parsed.patch, 0);
  assert.equal(parsed.maturity, "alpha");
});

test("npm projection omits only a zero root patch coordinate", () => {
  assert.deepEqual(projectRootVersionToPackageVersion("0.1.4.0-alpha"), {
    ok: true,
    version: "0.1.4-alpha",
  });
  assert.equal(projectRootVersionToPackageVersion("0.1.4.1-alpha").ok, false);
  assert.deepEqual(projectRootVersionToPackageVersion("0.1.4.1-alpha", { allowLossyPatchProjection: true }), {
    ok: true,
    version: "0.1.4-alpha",
    lossless: false,
    omittedRootPatch: 1,
  });
});

test("Kohai is the third numeric tier and rolls before minor", () => {
  assert.equal(computeNextRootVersion("0.1.2.0-alpha", "kohai").next, "0.1.3.0-alpha");
  assert.equal(computeNextRootVersion("0.1.16.0-alpha", "kohai").next, "0.2.0.0-alpha");
  assert.equal(computeNextRootVersion("0.1.2.24-alpha", "patch").next, "0.1.3.0-alpha");
});
