import { fileURLToPath } from "node:url";

const projectRef = "project:water-sharing-demo";
const sessionId = "operator-demo";
const permit = { profileId: "operator-interaction" };
const evidenceRef = "source:operator-demo:observations.jsonl";

// Explicitly synthetic work goes through the same validated contracts as real work.
// The CLI supplies a separate, memory-only runtime with no private connectors.
export function seedOperatorDemo(runtime) {
  const current = runtime.status();
  if (current.counts.interactions > 0 || current.counts.queueItems > 0) return current;
  function call(name, args) {
    const result = runtime.handleTool(name, args);
    if (result.ok === false) throw new Error(`Demo fixture refused: ${result.code}`);
    return result;
  }
  call("mousecat.session", { action: "start", sessionId, facts: { synthetic: true } });
  call("mousecat.projects", { action: "register", permit, surface: {
    surfaceId: "operator-demo", projectRef, projectKind: "simulation",
    root: fileURLToPath(new URL("../../fixtures/operator-demo/", import.meta.url)),
    identityMarkers: ["README.md"],
    governingDocuments: [{ role: "readme", path: "README.md", label: "Water-sharing trial", excerptLines: 80 }],
    dataSources: [{ name: "observations", path: "observations.jsonl", label: "Synthetic trial observations", format: "jsonl" }],
  } });
  for (const path of ["README.md", "observations.jsonl"]) {
    call("mousecat.history", { action: "index", surfaceId: "operator-demo", path, permit });
  }
  call("mousecat.history", { action: "register", permit, record: {
    ref: "note:demo/trial-result", kind: "result", title: "What the water trial actually showed",
    project: projectRef, standing: "reported", source: { kind: "host", host: "demo", sessionId, label: "Synthetic fixture" },
    body: "## Observed\nThe sink inspection found water.\n\n## Unknown\nNo drinking action or sustained survival outcome was observed.\n\n## Next experiment\nCheck whether the person chooses and completes drinking after inspection. The [follow-up notebook](mousecat:note:demo/unindexed-notebook) has not been indexed; its reference is retained as a coverage gap.",
    links: [{ relation: "based-on", target: evidenceRef, basis: "Explicit synthetic observation reference" }],
  } });
  function ask(interactionId, title, items) {
    call("mousecat.widget", { action: "ask", request: {
      source: "mousecat.synthetic-demo", sessionId, projectRef, interactionId, title,
      items, constraints: { recommendationFirst: true, allowFreeform: true },
    } });
  }
  ask("demo-evidence-boundary", "Earlier evidence boundary", [{
    id: "boundary", title: "Keep unknown outcomes unknown", prompt: "How should unobserved follow-up be recorded?",
    options: [{ label: "Retain as unknown", value: "unknown" }, { label: "Infer success", value: "infer-success" }],
  }]);
  call("mousecat.widget", { action: "respond", interactionId: "demo-evidence-boundary", responses: [{
    itemId: "boundary", selectedOption: "unknown", notes: "Synthetic example answer; not an actual operator ruling.",
  }] });
  ask("demo-discovery-review", "Compare discovery proposals", [{
    id: "water-strategy", title: "Which claim does the evidence support?",
    prompt: "Choose what this trial can teach about finding water.",
    description: "The complete brief cites " + evidenceRef + ". The inspection succeeded, but subsequent drinking was not observed. [Read the trial result](mousecat:note:demo/trial-result).",
    metadata: { lineage: { evidenceRef, threadId: "demo-evidence-boundary" } },
    options: [
      { label: "Keep the bounded association (Recommended)", value: "bounded", description: "Retain inspection → water available as a candidate; drinking remains unknown." },
      { label: "Request another experiment", value: "experiment", description: "Observe drinking and compare the next decision before teaching the association." },
      { label: "Reject the proposed learning", value: "reject", description: "Retain the observations without promoting a teaching target." },
    ],
    mlReview: {
      schema: "mousecat.ml-review/1", subject: "Water-affordance discovery (synthetic)",
      scenario: "Rowan and Mika share a shelter. A sink works, but their cupboard contains no bottled water. The trial records an inspection and a search; their next actions are unknown.",
      systemRole: "A host compares proposals with observed outcomes before proposing a teaching target.",
      causalPath: [{ label: "Observation", value: "Inspect a sink and record water availability." }, { label: "Review", value: "Choose the claim the observed result can support." }, { label: "Later test", value: "Verify drinking and sustained use in a separate experiment." }],
      playerImpact: "A person could investigate a nearby water source before repeating an unsuccessful cupboard search.",
      decisionPrecedent: "The answer decides whether inspection evidence may support a bounded association while subsequent actions remain unknown.",
      actualInput: [{ label: "Observed actions", value: "One sink inspection and one unsuccessful cupboard search." }],
      proposedLearning: [{ label: "Ordinary cognition", value: "Continue searching remembered supplies." }, { label: "Associative discovery", value: "Inspect a nearby sink as another possible water source; no plumbing competence is granted." }],
      approvalEffects: ["Return the chosen policy to this isolated demonstration host.", "Store the exact response in the demonstration history."],
      remainingExclusions: ["No live dataset admission, training, simulation mutation, or claim of sustained survival."],
      evidence: [{ label: "Observations", value: "[Read the two synthetic observations](mousecat:" + evidenceRef + ")" }, { label: "Trial result", value: "[Observed result and unknown follow-up](mousecat:note:demo/trial-result)" }],
    },
  }]);
  ask("demo-next-experiment", "Plan the follow-up trial", [{
    id: "scope", title: "What should the next experiment observe?", shape: "checklist",
    prompt: "Select the outcomes needed to distinguish the proposals.",
    description: "## Goal\nDistinguish inspection from successful drinking.\n\n## Observations\nRecord resource use and subsequent decisions.\n\n## Boundary\nKeep uncertain outcomes as diagnostics. [Earlier evidence boundary](mousecat:demo-evidence-boundary).",
    options: [{ label: "A completed drinking action", value: "drink" }, { label: "Changed thirst", value: "thirst" }, { label: "The next resource decision", value: "next-decision" }],
  }, {
    id: "constraint", title: "Any condition the next trial must preserve?", shape: "freeform",
    prompt: "Record a constraint or qualification for this synthetic experiment.",
  }]);
  ask("demo-trial-order", "Order the experiments", [{
    id: "order", title: "Which uncertainty should be tested first?", shape: "ranking",
    prompt: "Rank these follow-up experiments.",
    options: [{ label: "Drinking completion", value: "completion" }, { label: "Resource depletion", value: "depletion" }, { label: "Knowledge sharing", value: "sharing" }],
  }]);
  call("mousecat.queue", { action: "enqueue", sessionId, source: "mousecat.synthetic-demo", items: [
    { id: "demo-desktop", prompt: "Inspect the demo at a desktop viewport", shape: "review" },
    { id: "demo-mobile", prompt: "Inspect the demo at a mobile viewport", shape: "review" },
  ] });
  return runtime.status();
}
