import test from "node:test";
import assert from "node:assert/strict";
import { renderDescription } from "../src/operator/public/operator-model.js";

// Minimal DOM contract: fail if untrusted text is ever routed through an HTML sink.
function documentFixture() {
  return { createElement(tag) {
    return {
      tag, children: [], dataset: {}, textContent: "",
      append(...children) { this.children.push(...children); },
      set innerHTML(_) { throw new Error("HTML interpretation is forbidden"); },
    };
  } };
}
function descendants(node) { return [node, ...node.children.flatMap(descendants)]; }

test("existing literal references become clickthroughs without rewriting the original plan", () => {
  const digest = "a".repeat(64);
  const commit = "b".repeat(40);
  const root = renderDescription(documentFixture(), [
    "Earlier ruling skill-3647c923478ac89b; source " + digest + ".",
    "", "<details>", "<summary>Supporting evidence</summary>", "",
    "- Source base " + commit,
    "- [Named decision](mousecat:skill-3647c923478ac89b)",
    "- field-test:plan-sha256:" + digest, "</details>",
    "", "<script>doNotRun()</script>"
  ].join("\n"));
  const links = descendants(root).filter(node => node.tag === "a");
  assert.deepEqual(links.map(node => new URLSearchParams(node.href.split("?")[1]).get("ref")),
    ["skill-3647c923478ac89b", digest, commit, "skill-3647c923478ac89b", "field-test:plan-sha256:" + digest]);
  assert.equal(descendants(root).filter(node => node.tag === "script").length, 0);
});

test("review documents preserve table cells and collapsed supporting text", () => {
  const root = renderDescription(documentFixture(), [
    "## Result", "Readable proposal.", "", "| Step | Check |", "| --- | --- |",
    "| A \\| B | Exact comparison |", "", "<details>", "<summary>Boundaries</summary>",
    "", "- First boundary", "- Second boundary", "", "</details>", "", "Final paragraph."
  ].join("\n"));
  const nodes = descendants(root);
  assert.deepEqual(nodes.filter(n => n.tag === "td").map(n => [n.textContent, n.dataset.label]),
    [["A | B", "Step"], ["Exact comparison", "Check"]]);
  const details = nodes.find(n => n.tag === "details");
  assert.equal(Boolean(details.open), false);
  assert.deepEqual(descendants(details).filter(n => n.tag === "li").map(n => n.textContent),
    ["First boundary", "Second boundary"]);
  assert.equal(root.children.at(-1).textContent, "Final paragraph.");
});

test("host markup and scripts remain literal text in every rendered block", () => {
  const attack = '<img src=x onerror="alert(1)"><script>alert(1)</script>';
  const root = renderDescription(documentFixture(), [
    "## " + attack, attack, "", "- " + attack, "", "| Subject |", "| --- |", "| " + attack + " |",
    "", "<details>", "<summary>" + attack + "</summary>", attack, "</details>"
  ].join("\n"));
  const nodes = descendants(root);
  assert.equal(nodes.filter(n => ["script", "img"].includes(n.tag)).length, 0);
  for (const tag of ["h5", "p", "li", "td", "summary"]) {
    assert.ok(nodes.some(n => n.tag === tag && n.textContent === attack), tag);
  }
});

test("plain text and incomplete formatting stay readable", () => {
  const root = renderDescription(documentFixture(), "First line\nSecond line\n\n<details>\nUnpaired text\n\n1. One\n2. Two");
  const nodes = descendants(root);
  assert.equal(nodes.find(n => n.tag === "p").textContent, "First line\nSecond line");
  assert.equal(nodes.filter(n => n.tag === "details").length, 0);
  assert.equal(nodes.filter(n => n.tag === "li").length, 2);
});
