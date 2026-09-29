#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { startOperatorServer } from "../src/operator/server.mjs";

// Never attaches to an installed service or submits an actual operator judgment.
const output = resolve(".mousecat/browser-check");
await mkdir(output, { recursive: true });
const browser = await chromium.launch(process.platform === "win32" ? { channel: "msedge" } : {});
const errors = [];
const receipts = [];
try {
  for (const viewport of [{ width: 1680, height: 950 }, { width: 760, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
    const app = await startOperatorServer({ port: 0, demo: true });
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() !== "error") return;
      const url = new URL(message.location().url || app.url);
      const declaredCoverageGap = url.pathname === "/api/history" && url.searchParams.get("ref") === "note:demo/unindexed-notebook" && /404/u.test(message.text());
      if (!declaredCoverageGap) errors.push(message.text());
    });
    page.on("requestfailed", request => errors.push(request.failure()?.errorText || "request failed"));
    try {
      await page.goto(app.url);
      await page.locator("#projects-state").waitFor({ state: "visible" });
      await page.locator(".project-entry").filter({ hasText: "water sharing demo" }).click();
      await page.getByRole("link", { name: "Compare discovery proposals", exact: true }).click();
      const card = page.locator('.decision-card[data-interaction-id="demo-discovery-review"]');
      await card.locator(".card-disclosure").evaluate(node => { node.open = true; });
      assert.match(await page.locator(".atlas-family-jump").filter({ hasText: "Compare discovery proposals" }).innerText(), /Compare discovery proposals/);
      const waiting = page.locator("#return-prepared-label");
      assert.equal(await waiting.isVisible(), true);
      assert.match(await waiting.innerText(), /Review 4 waiting/);
      await card.locator('input[data-option-index="0"]').check();
      const notes = "Keep drinking completion unknown.";
      await card.locator("textarea[data-freeform]").fill(notes);
      await card.getByText("Brief and source history", { exact: true }).click();
      assert.equal(await card.getByText(/The complete brief cites/).isVisible(), true);
      await card.getByText("Input, rationale and evidence", { exact: true }).click();
      await card.getByRole("link", { name: "Read the two synthetic observations", exact: true }).click();
      await page.locator("#history-reader h3").waitFor({ state: "visible" });
      await page.waitForFunction(() => document.activeElement?.matches("#history-reader h3"));
      const resultLink = page.locator("#history-reader").getByRole("link", { name: "What the water trial actually showed", exact: true });
      await resultLink.focus();
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => document.activeElement?.textContent === "What the water trial actually showed");
      await page.getByText("In this record", { exact: true }).click();
      await page.locator(".history-outline").getByRole("button", { name: "Unknown", exact: true }).click();
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Unknown");
      await page.locator("#history-reader").getByRole("link", { name: "follow-up notebook", exact: true }).click();
      await page.waitForFunction(() => document.activeElement?.textContent === "Reference not indexed");
      await page.locator("#history-close").click();
      await page.locator("#history-dialog").waitFor({ state: "hidden" });
      assert.equal(await card.locator("textarea[data-freeform]").inputValue(), notes);
      assert.equal(await card.locator('input[data-option-index="0"]').isChecked(), true);
      await page.locator("#return-prepared-button").click();
      await page.locator("#draft-review-dialog").waitFor({ state: "visible" });
      await page.locator("#draft-review-list").getByText("Revisit examples and context", { exact: true }).click();
      assert.match(await page.locator("#draft-review-list").innerText(), /No live dataset admission/);
      await page.locator("#return-drafts-button").click();
      await page.waitForFunction(() => !document.querySelector("#draft-review-dialog").open);
      const result = await (await fetch(app.url + "/api/history?ref=demo-discovery-review")).json();
      assert.equal(result.record.standing, "answered");
      assert.equal(result.record.items[0].response.selectedOption, "bounded");
      assert.equal(result.record.items[0].response.notes, notes);
      await page.locator('#question-breadcrumb a[href="#questions"]').click();
      await page.locator(".atlas-question-state").filter({ visible: true }).first().waitFor({ state: "visible", timeout: 5000 });
      const overlaps = await page.evaluate(() => {
        const boxes = [...document.querySelectorAll(".atlas-family:not([hidden]) .atlas-cell:not([hidden])")].map(node => node.getBoundingClientRect());
        return boxes.some((box, i) => boxes.slice(i + 1).some(other => Math.min(box.right, other.right) > Math.max(box.left, other.left) && Math.min(box.bottom, other.bottom) > Math.max(box.top, other.top)));
      });
      assert.equal(overlaps, false, `outline controls overlap at ${viewport.width}`);
      await page.locator("#history-toggle").click();
      await page.locator("#history-results").getByRole("link", { name: "Earlier evidence boundary", exact: true }).click();
      const revision = page.getByRole("combobox", { name: "Record revision", exact: true });
      const older = await revision.locator("option").last().getAttribute("value");
      await revision.selectOption(older);
      await page.waitForFunction(() => document.activeElement?.matches("#history-reader h3") && new URLSearchParams(location.hash.split("?")[1]).has("revision"));
      await page.locator("#history-close").click();
      for (const theme of ["manuscript", "bw", "light"]) {
        await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
        const layout = await page.evaluate(() => ({
          document: document.documentElement.scrollWidth <= innerWidth,
          workspace: document.querySelector("#decision-scroll").scrollWidth <= document.querySelector("#decision-scroll").clientWidth,
        }));
        assert.equal(layout.document, true, `document overflow at ${viewport.width} / ${theme}`);
        assert.equal(layout.workspace, true, `reading pane overflow at ${viewport.width} / ${theme}`);
      }
      await page.evaluate(() => { document.documentElement.dataset.theme = "manuscript"; });
      await page.screenshot({ path: resolve(output, `questions-${viewport.width}.png`) });
      receipts.push({ viewport, evidenceClickthrough: true, keyboardFocus: true, preservedDraft: true, exactSyntheticReturn: true, themes: 3 });
    } finally {
      await context.close();
      await app.close();
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, syntheticOnly: true, receipts, errors }, null, 2));
} finally {
  await browser.close();
}
