import { readFileSync } from "node:fs";

export const MINOR_HARD_CAP = 12;
export const KOHAI_HARD_CAP = 16;
export const PATCH_HARD_CAP = 24;
export const MATURITY_LADDER = Object.freeze(["pre-alpha", "alpha", "beta", "rc"]);

let cachedPackageVersion = null;

function formatRoot({ major, minor, kohai, patch, maturity }) {
  return `${major}.${minor}.${kohai}.${patch}${maturity ? `-${maturity}` : ""}`;
}

export function parseRootVersion(value) {
  const raw = String(value == null ? "" : value).trim();
  const match = /^(\d+)\.(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u.exec(raw);
  if (!match) {
    return {
      ok: false,
      raw,
      violation: `root VERSION must use major.minor.kohai.patch-maturity form, got "${raw}"`,
    };
  }

  const prerelease = match[5] || "";
  const parts = prerelease ? prerelease.split(".") : [];
  const maturity = parts[0] || null;
  if (parts.length > 1 || (maturity && !MATURITY_LADDER.includes(maturity))) {
    return {
      ok: false,
      raw,
      violation: `root VERSION prerelease must be one maturity suffix: ${MATURITY_LADDER.join(", ")}`,
    };
  }

  const parsed = {
    ok: true,
    raw,
    major: Number(match[1]),
    minor: Number(match[2]),
    kohai: Number(match[3]),
    patch: Number(match[4]),
    maturity,
    minorCap: MINOR_HARD_CAP,
    kohaiCap: KOHAI_HARD_CAP,
    patchCap: PATCH_HARD_CAP,
    violation: null,
  };

  if (parsed.minor > MINOR_HARD_CAP) {
    parsed.ok = false;
    parsed.violation = `minor ${parsed.minor} exceeds cap ${MINOR_HARD_CAP}`;
  } else if (parsed.kohai > KOHAI_HARD_CAP) {
    parsed.ok = false;
    parsed.violation = `kohai ${parsed.kohai} exceeds cap ${KOHAI_HARD_CAP}`;
  } else if (parsed.patch > PATCH_HARD_CAP) {
    parsed.ok = false;
    parsed.violation = `patch ${parsed.patch} exceeds cap ${PATCH_HARD_CAP}`;
  }

  return parsed;
}

export function projectRootVersionToPackageVersion(rootVersion, options = {}) {
  const parsed = parseRootVersion(rootVersion);
  if (!parsed.ok) return { ok: false, error: parsed.violation };
  if (parsed.patch !== 0 && options.allowLossyPatchProjection !== true) {
    return {
      ok: false,
      error: `root patch coordinate ${parsed.patch} cannot be losslessly projected to npm SemVer`,
    };
  }
  const projection = {
    ok: true,
    version: `${parsed.major}.${parsed.minor}.${parsed.kohai}${parsed.maturity ? `-${parsed.maturity}` : ""}`,
  };
  if (parsed.patch !== 0) {
    projection.lossless = false;
    projection.omittedRootPatch = parsed.patch;
  }
  return projection;
}

function bumpPatch(parsed) {
  if (parsed.patch < PATCH_HARD_CAP) return { ...parsed, patch: parsed.patch + 1 };
  if (parsed.kohai < KOHAI_HARD_CAP) return { ...parsed, kohai: parsed.kohai + 1, patch: 0 };
  if (parsed.minor < MINOR_HARD_CAP) return { ...parsed, minor: parsed.minor + 1, kohai: 0, patch: 0 };
  return { ...parsed, major: parsed.major + 1, minor: 0, kohai: 0, patch: 0 };
}

function bumpKohai(parsed) {
  if (parsed.kohai < KOHAI_HARD_CAP) return { ...parsed, kohai: parsed.kohai + 1, patch: 0 };
  if (parsed.minor < MINOR_HARD_CAP) return { ...parsed, minor: parsed.minor + 1, kohai: 0, patch: 0 };
  return { ...parsed, major: parsed.major + 1, minor: 0, kohai: 0, patch: 0 };
}

export function computeNextRootVersion(current, tier) {
  const parsed = parseRootVersion(current);
  if (!parsed.ok) return { ok: false, error: parsed.violation };

  const normalized = String(tier || "").toLowerCase().trim();
  let next;
  if (normalized === "patch" || normalized === "hotfix") {
    next = bumpPatch(parsed);
  } else if (normalized === "kohai") {
    next = bumpKohai(parsed);
  } else if (normalized === "minor") {
    next = parsed.minor < MINOR_HARD_CAP
      ? { ...parsed, minor: parsed.minor + 1, kohai: 0, patch: 0 }
      : { ...parsed, major: parsed.major + 1, minor: 0, kohai: 0, patch: 0 };
  } else if (normalized === "major") {
    next = { ...parsed, major: parsed.major + 1, minor: 0, kohai: 0, patch: 0 };
  } else {
    return { ok: false, error: "tier must be hotfix, patch, kohai, minor, or major" };
  }

  return {
    ok: true,
    tier: normalized,
    next: formatRoot(next),
  };
}

export function packageVersion() {
  if (cachedPackageVersion) return cachedPackageVersion;
  const pkg = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8"));
  cachedPackageVersion = pkg.version;
  return cachedPackageVersion;
}

export default {
  KOHAI_HARD_CAP,
  MATURITY_LADDER,
  MINOR_HARD_CAP,
  PATCH_HARD_CAP,
  computeNextRootVersion,
  packageVersion,
  parseRootVersion,
  projectRootVersionToPackageVersion,
};
