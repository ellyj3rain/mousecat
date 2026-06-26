import { readFile } from "node:fs/promises";

import { UPSTREAMS } from "./catalog.mjs";

export function defaultConfig() {
  return {
    hostProfile: "local-dev",
    upstreams: Object.fromEntries(
      UPSTREAMS.map((upstream) => [upstream.id, { enabled: upstream.defaultEnabled !== false }]),
    ),
    credentials: {
      policy: "references-only",
    },
  };
}

function mergeConfig(base, override) {
  const upstreams = { ...base.upstreams };
  for (const [id, value] of Object.entries(override?.upstreams || {})) {
    upstreams[id] = { ...(upstreams[id] || {}), ...value };
  }
  return {
    ...base,
    ...override,
    upstreams,
    credentials: {
      ...base.credentials,
      ...(override?.credentials || {}),
    },
  };
}

export async function loadConfig(path = "mousecat.config.json") {
  const base = defaultConfig();
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return mergeConfig(base, parsed);
  } catch (error) {
    if (error.code === "ENOENT") return base;
    throw error;
  }
}
