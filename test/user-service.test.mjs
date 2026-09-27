import test from "node:test";
import assert from "node:assert/strict";

import { userServicePlan } from "../src/service/user-service.mjs";

test("user service plans one provider-neutral login lifecycle for each supported desktop OS", () => {
  const options = { home: "/home/operator", port: 4317, configPath: "mousecat.config.json" };
  const windows = userServicePlan({ ...options, platform: "win32" });
  const linux = userServicePlan({ ...options, platform: "linux" });
  const mac = userServicePlan({ ...options, platform: "darwin" });

  assert.equal(windows.mechanism, "hkcu-run");
  assert.match(windows.command, /wscript\.exe/u);
  assert.ok(windows.command.length < 260);
  assert.match(windows.launcherContent, /runner\.mjs/u);
  assert.match(windows.launcherContent, /--port 4317/u);
  assert.equal(linux.mechanism, "systemd-user");
  assert.match(linux.content, /WantedBy=default\.target/u);
  assert.match(linux.content, /Restart=on-failure/u);
  assert.equal(mac.mechanism, "launch-agent");
  assert.match(mac.content, /<key>RunAtLoad<\/key><true\/>/u);
  assert.match(mac.content, /dev\.mousecat\.operator/u);
});

test("user service rejects unsupported platforms without inventing a system mechanism", () => {
  const plan = userServicePlan({ platform: "aix", home: "/home/operator" });
  assert.equal(plan.mechanism, "unsupported");
});
