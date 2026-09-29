import {
  renderInlineReferences,
  planResponseBatches,
  recordKey,
  renderDescription,
  reviewAttention,
  resolveActiveSkillRef,
  shapeUsesOptionSelection,
} from "/operator-model.js";

import { installHistory } from "/history.js";
import { installProjects } from "/project-view.js";
import { installNativeView } from "/native-view.js";
import { projectModel, inQuestionScope, projectRoute, questionRoute } from "/project-model.js";

const REDACTED = "[sensitive-redacted]";

const elements = {
  widget: document.querySelector("#widget"),
  reviewContextDialog: document.querySelector("#review-context-dialog"),
  reviewContextToggle: document.querySelector("#review-context-toggle"),
  reviewContextClose: document.querySelector("#review-context-close"),
  brandMark: document.querySelector(".brand-mark"),
  sourceLabel: document.querySelector("#source-label"),
  connectionStatus: document.querySelector("#connection-status"),
  connectionLabel: document.querySelector("#connection-label"),
  notice: document.querySelector("#notice"),
  idleState: document.querySelector("#idle-state"),
  decisionState: document.querySelector("#decision-state"),
  skillLabel: document.querySelector("#skill-label"),
  workspaceTitle: document.querySelector("#workspace-title"),
  workspaceDescription: document.querySelector("#workspace-description"),
  progressLabel: document.querySelector("#progress-label"),
  progressValue: document.querySelector("#progress-value"),
  preparedCount: document.querySelector("#prepared-count"),
  draftStateStatus: document.querySelector("#draft-state-status"),
  mutationStatus: document.querySelector("#mutation-status"),
  returnPreparedButton: document.querySelector("#return-prepared-button"),
  returnPreparedLabel: document.querySelector("#return-prepared-label"),
  decisionSearch: document.querySelector("#decision-search"),
  searchStatus: document.querySelector("#search-status"),
  outlineList: document.querySelector("#outline-list"),
  decisionScroll: document.querySelector("#decision-scroll"),
  decisionWall: document.querySelector("#decision-wall"),
  projectsToggle: document.querySelector("#projects-toggle"),
  questionsToggle: document.querySelector("#questions-toggle"),
  questionBreadcrumb: document.querySelector("#question-breadcrumb"),
  scopeEmpty: document.querySelector("#scope-empty"),
  projectsToggleLabel: document.querySelector("#projects-toggle-label"),
  projectsState: document.querySelector("#projects-state"),
  projectNav: document.querySelector("#project-nav"),
  projectDetail: document.querySelector("#project-detail"),
  contextSummaryLabel: document.querySelector("#context-summary-label"),
  skillMap: document.querySelector("#skill-map"),
  frameworkHeading: document.querySelector("#framework-heading"),
  frameworkPicker: document.querySelector("#framework-picker"),
  routingRule: document.querySelector("#routing-rule"),
  sessionList: document.querySelector("#session-list"),
  threadList: document.querySelector("#thread-list"),
  draftReviewDialog: document.querySelector("#draft-review-dialog"),
  draftReviewHeading: document.querySelector("#draft-review-heading"),
  draftReviewSummary: document.querySelector("#draft-review-summary"),
  reviewReadyCount: document.querySelector("#review-ready-count"),
  reviewIncompleteCount: document.querySelector("#review-incomplete-count"),
  draftReviewList: document.querySelector("#draft-review-list"),
  draftReviewStatus: document.querySelector("#draft-review-status"),
  closeDraftReview: document.querySelector("#close-draft-review"),
  cancelDraftReview: document.querySelector("#cancel-draft-review"),
  returnDraftsButton: document.querySelector("#return-drafts-button"),
  returnDraftsLabel: document.querySelector("#return-drafts-label"),
};

let currentSnapshot = null;
let busy = false;
let offline = false;
let refreshTimer = null;
let snapshotController = null;
let snapshotGeneration = 0;
let selectedFrameworkRef = null;
let lastActiveFrameworkRef = null;
let activeView = "projects";
let projectSelection = {};
let questionScope = {};
let lastWorkspaceHash = null;
let revealScopeOnRender = false;
const renderProjectView = installProjects(elements.projectNav, elements.projectDetail);
const nativeView = installNativeView(document.querySelector("#native-view-state"));
const nativeViewToggle = document.querySelector("#native-view-toggle");
let wallSignature = null;
let contextSignature = null;
let noticeSticky = false;
const drafts = new Map();
const expandedKeys = new Set();
const entryByKey = new Map();
const familyByKey = new Map();
const formByKey = new Map();
const articleByKey = new Map();
const atlasCellByKey = new Map();
const atlasGroupByKey = new Map();
const familySectionByKey = new Map();
let atlasScrollFrame = null;
let currentAtlasFamilyKey = null;
let reviewRenderSignature = null;
let lastReviewCount = null;
const baseDocumentTitle = document.title || "Mousecat";

function actionable(item) {
  return ["open", "deferred"].includes(item?.status);
}

function refreshIcons() {
  if (globalThis.lucide) globalThis.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
}

function setConnection(status, label) {
  elements.connectionStatus.dataset.status = status;
  elements.connectionLabel.textContent = label;
}

function showNotice(message, { sticky = false } = {}) {
  elements.notice.textContent = message;
  elements.notice.hidden = !message;
  noticeSticky = Boolean(message) && sticky;
}

function setBusy(nextBusy) {
  busy = nextBusy;
  elements.widget.setAttribute("aria-busy", String(nextBusy));
  for (const button of document.querySelectorAll(".command-button")) {
    const sensitive = button.closest(".decision-card")?.dataset.sensitive === "true";
    button.disabled = nextBusy || offline || sensitive || button.dataset.empty === "true";
  }
  for (const control of document.querySelectorAll(".decision-form input, .decision-form select, .decision-form textarea, .decision-form button")) {
    if (nextBusy) control.disabled = true;
    else if (!control.classList.contains("command-button")) control.disabled = false;
  }
  updatePreparedState();
}

function pendingInteractions(snapshot) {
  const interactions = snapshot?.widget?.interactions || (snapshot?.widget?.interaction ? [snapshot.widget.interaction] : []);
  return interactions.filter((interaction) => interaction.items?.some(actionable));
}

function displaySkill(interaction, controlPlane, activeSkillRef) {
  const descriptor = controlPlane?.skills?.find((skill) => skill.id === activeSkillRef);
  if (descriptor?.label) return descriptor.label;
  const raw = interaction?.skillRef
    ? String(interaction.skillRef)
    : String(interaction?.source || "").split(/[./]/u).at(-1);
  return raw.replace(/[-_]+/gu, " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function displaySource(interaction) {
  return String(interaction?.source || "Mousecat MCP");
}

function optionValue(option) {
  return option?.value ?? option?.label ?? null;
}

function optionDisplayLabel(option, index) {
  return String(option?.label || `Option ${index + 1}`).replace(/\s*\(recommended\)\s*$/iu, "");
}

function recommendedOptionIndex(item) {
  const options = Array.isArray(item?.options) ? item.options : [];
  const buttonIndex = Array.isArray(item?.buttons)
    ? item.buttons.findIndex((button) => button?.recommended === true)
    : -1;
  if (buttonIndex >= 0 && buttonIndex < options.length) return buttonIndex;
  const labelledIndex = options.findIndex((option) => /\(recommended\)/iu.test(String(option?.label || "")));
  if (labelledIndex >= 0) return labelledIndex;
  if (item?.recommendedDefault !== null && item?.recommendedDefault !== undefined) {
    const expected = String(item.recommendedDefault);
    return options.findIndex((option) => [optionValue(option), option?.label].some((value) => String(value) === expected));
  }
  return -1;
}

function humanize(value) {
  return String(value || "Decisions")
    .split(/[\\/]/u).at(-1)
    .replace(/[-_]+/gu, " ")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function draftKey(interaction, item) {
  return recordKey(interaction.interactionId, item.id);
}

function preferredScrollBehavior() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function lineageFor(item) {
  return item?.metadata?.lineage || {};
}

function splitTitle(item) {
  const title = item?.title && item.title !== REDACTED ? String(item.title) : "";
  const parts = title.split(/\s+[—–]\s+/u);
  return {
    family: parts.length > 1 ? parts[0] : "",
    card: parts.length > 1 ? parts.slice(1).join(" — ") : title,
  };
}

function familyLabel(item, familyRef) {
  return splitTitle(item).family || humanize(familyRef);
}

function cardTitle(item, ordinal) {
  return splitTitle(item).card || `Decision ${ordinal}`;
}

function decisionOrdinal(item, fallback) {
  const lineage = lineageFor(item);
  return Number.isInteger(lineage.ordinal) ? lineage.ordinal : Number.isInteger(lineage.sequence) ? lineage.sequence : fallback;
}

function statusLabel(item) {
  if (item?.prompt === REDACTED) return "Sensitive";
  return {
    open: "Open",
    deferred: "Later",
    answered: "Returned",
    held: "Held",
    ratified: "Ratified",
  }[item?.status] || humanize(item?.status || "Open");
}

function emptyState(label) {
  const item = document.createElement("p");
  item.className = "panel-empty";
  item.textContent = label;
  return item;
}

function mlReviewSearchText(review) {
  if (!review || typeof review !== "object") return [];
  return [
    review.subject,
    ...(review.scenePreview ? [JSON.stringify(review.scenePreview)] : []),
    review.scenario,
    review.systemRole,
    ...(review.causalPath || []).flatMap((step) => [step.label, step.value]),
    review.playerImpact,
    review.decisionPrecedent,
    ...(review.actualInput || []).flatMap((fact) => [fact.label, fact.value]),
    ...(review.proposedLearning || []).flatMap((fact) => [fact.label, fact.value]),
    ...(review.approvalEffects || []),
    ...(review.remainingExclusions || []),
    ...(review.evidence || []).flatMap((fact) => [fact.label, fact.value]),
  ];
}

function createMlTextGroup(title, value, className = "") {
  const section = document.createElement("section");
  section.className = `ml-review-group ${className}`.trim();
  const heading = document.createElement("h6");
  heading.textContent = title;
  const text = document.createElement("p");
  text.textContent = value;
  section.append(heading, text);
  return section;
}

function createMlPathGroup(steps) {
  const section = document.createElement("section");
  section.className = "ml-review-group ml-review-path";
  const heading = document.createElement("h6");
  heading.textContent = "How this reaches the game";
  const list = document.createElement("ol");
  for (const step of steps || []) {
    const item = document.createElement("li");
    const label = document.createElement("strong");
    label.textContent = step.label;
    const detail = document.createElement("span");
    detail.textContent = step.value;
    item.append(label, detail);
    list.append(item);
  }
  section.append(heading, list);
  return section;
}

function createMlFactGroup(title, facts, className = "") {
  const section = document.createElement("section");
  section.className = `ml-review-group ${className}`.trim();
  const heading = document.createElement("h6");
  heading.textContent = title;
  const list = document.createElement("dl");
  for (const fact of facts || []) {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    term.textContent = fact.label;
    const detail = document.createElement("dd");
    renderInlineReferences(document, detail, fact.value);
    row.append(term, detail);
    list.append(row);
  }
  section.append(heading, list);
  return section;
}

function createMlStatementGroup(title, statements, className = "") {
  const section = document.createElement("section");
  section.className = `ml-review-group ${className}`.trim();
  const heading = document.createElement("h6");
  heading.textContent = title;
  const list = document.createElement("ul");
  if ((statements || []).length === 0) {
    const item = document.createElement("li");
    item.textContent = "None declared.";
    list.append(item);
  } else {
    for (const statement of statements) {
      const item = document.createElement("li");
      item.textContent = statement;
      list.append(item);
    }
  }
  section.append(heading, list);
  return section;
}

function createMlReview(review, { compact = false } = {}) {
  const panel = document.createElement("section");
  panel.className = "ml-review-panel";
  panel.dataset.compact = String(compact);
  panel.setAttribute("aria-label", `ML decision context: ${review.subject}`);
  const narrative = createMlTextGroup("Situation", review.scenario, "ml-review-scenario");
  const comparison = document.createElement("div");
  comparison.className = "ml-review-comparison";
  for (const fact of review.proposedLearning || []) comparison.append(createMlFactGroup(fact.label, [fact], "ml-review-learning"));
  const supporting = document.createElement("details");
  supporting.className = "review-supporting";
  const summary = document.createElement("summary");
  summary.textContent = compact ? "Revisit examples and context" : "Input, rationale and evidence";
  supporting.append(summary);
  if (compact) supporting.append(narrative, comparison);
  else panel.append(narrative, comparison);
  panel.append(createMlTextGroup("What your answer sets", review.decisionPrecedent, "ml-review-precedent"));
  supporting.append(
    createMlFactGroup("Actual input", review.actualInput, "ml-review-input"),
    createMlPathGroup(review.causalPath),
    createMlTextGroup("Where this sits", review.systemRole),
    createMlTextGroup("Player-visible consequence", review.playerImpact),
    createMlStatementGroup("Still excluded", review.remainingExclusions, "ml-review-exclusions"),
    createMlFactGroup("Evidence", review.evidence, "ml-review-evidence"));
  panel.append(createMlStatementGroup("Effect of this review", review.approvalEffects, "ml-review-effects"), supporting);
  return panel;
}

function groupDecisionItems(interactions) {
  const groups = new Map();
  let fallbackOrdinal = 0;
  for (const interaction of interactions) {
    for (const item of interaction.items || []) {
      fallbackOrdinal += 1;
      const lineage = lineageFor(item);
      const familyRef = lineage.parentThreadId || `${interaction.interactionId}/decisions`;
      const groupKey = recordKey(interaction.interactionId, familyRef);
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          interaction,
          familyRef,
          label: splitTitle(item).family || (lineage.parentThreadId ? familyLabel(item, familyRef) : interaction.title || familyLabel(item, familyRef)),
          entries: [],
        });
      }
      groups.get(groupKey).entries.push({
        interaction,
        item,
        key: draftKey(interaction, item),
        ordinal: decisionOrdinal(item, fallbackOrdinal),
      });
    }
  }
  const sorted = [...groups.values()].sort((left, right) => left.entries[0].ordinal - right.entries[0].ordinal);
  let decisionIndex = 0;
  sorted.forEach((group, groupIndex) => {
    group.id = `decision-family-${groupIndex + 1}`;
    group.entries.forEach((entry) => {
      decisionIndex += 1;
      entry.domToken = `decision-${decisionIndex}`;
      entry.familyLabel = group.label;
      entry.familyRef = group.familyRef;
    });
  });
  return sorted;
}

function createOptionRow(domToken, option, index, type, recommended = false) {
  const label = document.createElement("label");
  label.className = "option-row";
  label.dataset.recommended = String(recommended);

  const input = document.createElement("input");
  input.type = type;
  input.name = `${domToken}-option`;
  input.value = String(index);
  input.dataset.optionIndex = String(index);
  input.dataset.focusKey = `option-${index}`;

  const copy = document.createElement("span");
  copy.className = "option-copy";
  const title = document.createElement("span");
  title.className = "option-title";
  title.textContent = optionDisplayLabel(option, index);
  if (recommended) {
    const badge = document.createElement("span");
    badge.className = "option-recommendation";
    badge.textContent = "Recommended";
    title.append(" ", badge);
  }
  copy.append(title);
  if (option.description) {
    const description = document.createElement("span");
    description.className = "option-description";
    description.textContent = option.description;
    copy.append(description);
  }

  label.append(input, copy);
  return label;
}

function renderOptions(item, domToken, ordinal, form) {
  const options = Array.isArray(item.options) ? item.options : [];
  if (options.length === 0 || !shapeUsesOptionSelection(item)) return;
  const fieldset = document.createElement("fieldset");
  fieldset.className = "option-fieldset";
  const legend = document.createElement("legend");
  legend.className = "sr-only";
  legend.textContent = `Response options for ${cardTitle(item, ordinal)}`;
  const list = document.createElement("div");
  list.className = "option-list";
  const type = item.shape === "checklist" || item.selectionMode === "multiple" ? "checkbox" : "radio";
  const recommendation = recommendedOptionIndex(item);
  options.forEach((option, index) => list.append(createOptionRow(domToken, option, index, type, index === recommendation)));
  fieldset.append(legend, list);
  form.append(fieldset);
}

function renderRanking(item, form) {
  const options = Array.isArray(item.options) ? item.options : [];
  const control = document.createElement("div");
  control.className = "shape-control";
  for (const [index, option] of options.entries()) {
    const row = document.createElement("label");
    row.className = "rank-row";
    const title = document.createElement("span");
    title.textContent = option.label || `Option ${index + 1}`;
    const select = document.createElement("select");
    select.dataset.rankIndex = String(index);
    select.dataset.focusKey = `rank-${index}`;
    select.setAttribute("aria-label", `Rank ${title.textContent}`);
    select.append(new Option("-", ""));
    options.forEach((_candidate, rankIndex) => select.append(new Option(String(rankIndex + 1), String(rankIndex + 1))));
    row.append(title, select);
    control.append(row);
  }
  form.append(control);
}

function renderParameter(item, form, domToken) {
  const metadata = item.metadata || {};
  const wrap = document.createElement("div");
  wrap.className = "parameter-wrap shape-control";
  const label = document.createElement("label");
  label.className = "parameter-label";
  label.htmlFor = `${domToken}-parameter`;
  label.textContent = item.shape === "continuum" ? "Position" : "Value";
  const input = document.createElement("input");
  input.className = "parameter-input";
  input.id = label.htmlFor;
  input.name = label.htmlFor;
  input.dataset.parameter = "true";
  input.dataset.focusKey = "parameter";
  const hasNumericRange = Number.isFinite(Number(metadata.min)) && Number.isFinite(Number(metadata.max));
  input.type = hasNumericRange ? "range" : "text";
  if (hasNumericRange) {
    input.min = String(metadata.min);
    input.max = String(metadata.max);
    input.step = String(metadata.step ?? 1);
    input.defaultValue = String(metadata.default ?? metadata.min);
    input.value = input.defaultValue;
  }
  const output = document.createElement("output");
  output.id = `${domToken}-parameter-output`;
  output.setAttribute("for", input.id);
  input.setAttribute("aria-describedby", output.id);
  output.setAttribute("aria-live", "polite");
  output.textContent = input.value;
  input.addEventListener("input", () => { output.textContent = input.value; });
  wrap.append(label, input, output);
  form.append(wrap);
}

function renderShapeControl(item, form, domToken) {
  if (item.shape === "ranking") renderRanking(item, form);
  if (item.shape === "parameter" || item.shape === "continuum") renderParameter(item, form, domToken);
}

function renderFreeform(item, form) {
  const freeformOnly = item.shape === "freeform";
  if (item.allowFreeform === false && !freeformOnly) return;
  const label = document.createElement("label");
  label.className = "freeform-wrap";
  const text = document.createElement("span");
  text.textContent = freeformOnly ? "Answer" : "Add context or an amendment";
  const textarea = document.createElement("textarea");
  textarea.rows = 3;
  textarea.maxLength = 4000;
  textarea.dataset.freeform = "true";
  textarea.dataset.focusKey = "freeform";
  label.append(text, textarea);
  form.append(label);
}

function captureForm(key, form, markDirty = false, update = true) {
  if (!form) return;
  const existing = drafts.get(key);
  drafts.set(key, {
    options: [...form.querySelectorAll("input[data-option-index]:checked")].map((input) => input.dataset.optionIndex),
    freeform: form.querySelector("[data-freeform]")?.value || "",
    ranks: [...form.querySelectorAll("select[data-rank-index]")].map((select) => select.value),
    parameter: form.querySelector("[data-parameter]")?.value ?? null,
    dirty: markDirty || existing?.dirty === true,
  });
  if (markDirty && noticeSticky) showNotice("");
  if (update) updatePreparedState();
}

function captureAllDrafts({ update = true } = {}) {
  for (const [key, form] of formByKey.entries()) {
    captureForm(key, form, false, false);
  }
  if (update) updatePreparedState();
}

function restoreDraft(key, form) {
  const draft = drafts.get(key);
  if (!draft) return;
  for (const input of form.querySelectorAll("input[data-option-index]")) {
    input.checked = draft.options.includes(input.dataset.optionIndex);
  }
  const freeform = form.querySelector("[data-freeform]");
  if (freeform) freeform.value = draft.freeform || "";
  [...form.querySelectorAll("select[data-rank-index]")].forEach((select, index) => {
    select.value = draft.ranks[index] || "";
  });
  const parameter = form.querySelector("[data-parameter]");
  if (parameter && draft.parameter !== null) {
    parameter.value = draft.parameter;
    parameter.dispatchEvent(new Event("input"));
  }
}

function selectedOptionValues(item, form) {
  return [...form.querySelectorAll("input[data-option-index]:checked")]
    .map((input) => item.options[Number(input.dataset.optionIndex)])
    .map(optionValue);
}

function collectRanking(item, form, validate = true) {
  const entries = [...form.querySelectorAll("select[data-rank-index]")].map((select) => ({
    value: optionValue(item.options[Number(select.dataset.rankIndex)]),
    rank: select.value ? Number(select.value) : null,
  }));
  const assigned = entries.filter((entry) => entry.rank !== null);
  if (validate && item.required && assigned.length !== entries.length) throw new Error("Assign every option a rank.");
  if (validate && new Set(assigned.map((entry) => entry.rank)).size !== assigned.length) throw new Error("Each assigned rank must be unique.");
  return assigned;
}

function collectResponse(item, form, { status = "answered", validate = true } = {}) {
  const notes = form.querySelector("[data-freeform]")?.value.trim() || "";
  const selectedOptions = selectedOptionValues(item, form);
  const response = {
    itemId: item.id,
    status,
    notes: notes || null,
  };
  const hasOptions = Array.isArray(item.options) && item.options.length > 0;

  if (item.shape === "checklist") {
    if (validate && item.required && selectedOptions.length === 0 && !notes) throw new Error("Select at least one option or write an answer.");
    response.checklist = selectedOptions;
    response.selectedOptions = selectedOptions;
    response.value = notes || selectedOptions;
  } else if (item.shape === "ranking") {
    response.ranking = collectRanking(item, form, validate);
    if (validate && item.required && response.ranking.length === 0 && !notes) throw new Error("Rank the available options or write an answer.");
    response.value = notes || response.ranking;
  } else if (item.shape === "parameter" || item.shape === "continuum") {
    const input = form.querySelector("[data-parameter]");
    const value = input?.value?.trim() || notes;
    if (validate && item.required && !value) throw new Error("Set a value or write an answer.");
    response.value = input?.type === "range" && value ? Number(value) : value || null;
  } else if (hasOptions) {
    if (validate && item.required && selectedOptions.length === 0 && !notes) throw new Error("Choose an option or write an answer.");
    response.selectedOption = item.selectionMode === "multiple" ? null : selectedOptions[0] ?? null;
    response.selectedOptions = selectedOptions;
    response.value = item.selectionMode === "multiple" ? selectedOptions : notes || response.selectedOption;
  } else {
    if (validate && item.required && !notes) throw new Error("Write an answer.");
    response.value = notes || null;
  }
  return response;
}

function createProvenance(item, { compact = false } = {}) {
  const lineage = lineageFor(item);
  const wrap = document.createElement("div");
  wrap.className = compact ? "decision-provenance compact" : "decision-provenance";
  const evidence = String(lineage.evidenceRef || "").split(";").map((part) => part.trim()).filter(Boolean);
  for (const reference of evidence) {
    const chip = document.createElement("a");
    chip.className = "provenance-chip";
    chip.textContent = reference;
    chip.href = "#history?" + new URLSearchParams({ ref: reference });
    wrap.append(chip);
  }
  if (lineage.threadId) {
    const thread = document.createElement("a");
    thread.className = "provenance-thread";
    thread.textContent = String(lineage.threadId);
    thread.href = "#history?" + new URLSearchParams({ ref: lineage.threadId });
    thread.title = `Decision thread: ${lineage.threadId}`;
    wrap.append(thread);
  }
  return wrap;
}

function createRecommendationPreview(item) {
  if (!shapeUsesOptionSelection(item)) return null;
  const index = recommendedOptionIndex(item);
  const option = item.options?.[index];
  if (!option) return null;
  const preview = document.createElement("div");
  preview.className = "recommendation-preview";
  const label = document.createElement("span");
  label.textContent = "Recommended path";
  const copy = document.createElement("strong");
  copy.textContent = optionDisplayLabel(option, index);
  preview.append(label, copy);
  if (option.description) {
    const description = document.createElement("span");
    description.textContent = option.description;
    preview.append(description);
  }
  return preview;
}

function terminalMessage(item) {
  const message = document.createElement("p");
  message.className = "terminal-message";
  if (item.prompt === REDACTED) message.textContent = "Sensitive content remains withheld from the graphical boundary.";
  else if (item.status === "held") message.textContent = "This decision is held for the originating caller.";
  else message.textContent = "This response has been returned to the originating caller.";
  return message;
}

function resetDraft(key, form) {
  const entry = entryByKey.get(key);
  form.reset();
  for (const parameter of form.querySelectorAll("[data-parameter]")) {
    parameter.dispatchEvent(new Event("input"));
  }
  drafts.delete(key);
  if (noticeSticky) showNotice("");
  updatePreparedState();
  elements.draftReviewStatus.textContent = `${entry ? cardTitle(entry.item, entry.ordinal) : "Decision"} draft reset.`;
}

function recommendationAction(item, key, form) {
  if (!shapeUsesOptionSelection(item)) return null;
  const index = recommendedOptionIndex(item);
  if (index < 0 || !form.querySelector(`input[data-option-index="${index}"]`)) return null;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button prepare-button";
  button.dataset.focusKey = "prepare-recommendation";
  button.innerHTML = '<i data-lucide="sparkles"></i><span>Prepare recommendation</span>';
  button.addEventListener("click", () => {
    if (drafts.get(key)?.dirty) {
      resetDraft(key, form);
      return;
    }
    const input = form.querySelector(`input[data-option-index="${index}"]`);
    if (input.type === "checkbox") input.checked = true;
    else input.click();
    captureForm(key, form, true);
    updatePreparedState();
  });
  return button;
}

function cardActions(interaction, item, key, form) {
  const actions = document.createElement("footer");
  actions.className = "card-actions";

  const defer = document.createElement("button");
  defer.type = "button";
  defer.className = "button secondary-button command-button";
  defer.dataset.focusKey = "later";
  defer.innerHTML = '<i data-lucide="skip-forward"></i><span>Later</span>';
  defer.addEventListener("click", () => {
    captureForm(key, form, false);
    const response = { itemId: item.id, status: "deferred", notes: "operator-deferred" };
    void sendCommand("defer", { interactionId: interaction.interactionId, responses: [response] }, [key]);
  });

  const hold = document.createElement("button");
  hold.type = "button";
  hold.className = "button hold-button command-button";
  hold.dataset.focusKey = "hold";
  hold.innerHTML = '<i data-lucide="pause"></i><span>Hold</span>';
  hold.addEventListener("click", () => {
    try {
      captureForm(key, form, true);
      const response = collectResponse(item, form, { status: "held", validate: false });
      response.notes ||= "operator-held";
      void sendCommand("hold", { interactionId: interaction.interactionId, responses: [response] }, [key]);
    } catch (error) {
      revealFormError(form, error);
    }
  });

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "button submit-button command-button";
  submit.dataset.focusKey = "return";
  submit.innerHTML = '<span>Return this response</span><i data-lucide="arrow-up-right"></i>';
  const prepare = recommendationAction(item, key, form);
  if (prepare) actions.append(prepare);
  actions.append(defer, hold, submit);
  return actions;
}

function createDecisionCard(entry, defaultOpen = false) {
  const { interaction, item, key, ordinal, domToken } = entry;
  const headingId = `${domToken}-heading`;
  const article = document.createElement("article");
  article.className = "decision-card";
  article.dataset.itemKey = key;
  article.dataset.status = item.status;
  article.dataset.interactionId = interaction.interactionId;
  article.dataset.presentation = item.mlReview ? "comparison" : "document";
  article.dataset.sensitive = String(item.prompt === REDACTED);
  const searchLineage = lineageFor(item);
  article.dataset.search = [
    item.title,
    item.prompt,
    item.description,
    item.status,
    displaySource(interaction),
    searchLineage.evidenceRef,
    searchLineage.threadId,
    searchLineage.parentThreadId,
    ...mlReviewSearchText(item.mlReview),
    ...(item.options || []).flatMap((option) => [option.label, option.description, optionValue(option)]),
  ]
    .filter(Boolean).join(" ").toLowerCase();
  article.setAttribute("aria-labelledby", headingId);

  const disclosure = document.createElement("details");
  disclosure.className = "card-disclosure";
  disclosure.open = expandedKeys.has(key) || defaultOpen;
  if (disclosure.open) expandedKeys.add(key);
  disclosure.addEventListener("toggle", () => {
    if (disclosure.open) expandedKeys.add(key);
    else expandedKeys.delete(key);
  });

  const summary = document.createElement("summary");
  summary.className = "card-summary";
  summary.dataset.focusKey = "summary";
  const kicker = document.createElement("div");
  kicker.className = "card-kicker";
  const number = document.createElement("span");
  number.className = "decision-number";
  number.textContent = String(ordinal).padStart(2, "0");
  const status = document.createElement("span");
  status.className = "decision-status";
  status.textContent = statusLabel(item);
  status.dataset.baseLabel = status.textContent;
  kicker.append(number, status);

  const title = document.createElement("h4");
  title.id = headingId;
  title.textContent = item.prompt === REDACTED ? "Sensitive decision withheld" : cardTitle(item, ordinal);
  const proposition = document.createElement("p");
  proposition.className = "decision-proposition";
  proposition.textContent = item.prompt === REDACTED ? "The originating host marked this decision sensitive." : item.prompt;
  summary.append(kicker, title, proposition);
  const recommendation = item.prompt === REDACTED ? null : createRecommendationPreview(item);
  if (recommendation && !item.mlReview) summary.append(recommendation);
  disclosure.append(summary);

  const workspace = document.createElement("div");
  workspace.className = item.mlReview ? "judgment-workspace" : "document-workspace";
  const material = document.createElement("div");
  material.className = "judgment-material";
  workspace.append(material);
  const supporting = document.createElement("details");
  supporting.className = "review-supporting";
  const supportingTitle = document.createElement("summary");
  supportingTitle.textContent = "Brief and source history";
  supporting.append(supportingTitle);

  const historyLink = document.createElement("a");
  historyLink.className = "record-history-link";
  historyLink.textContent = "History and related records";
  historyLink.href = "#history?" + new URLSearchParams({ ref: interaction.interactionId });
  supporting.append(historyLink);

  if (item.description && item.prompt !== REDACTED) {
    (item.mlReview ? supporting : material).append(renderDescription(document, item.description));
  }
  const provenance = createProvenance(item);
  if (provenance.childElementCount > 0) {
    const sourceDetails = document.createElement("details");
    sourceDetails.className = "review-provenance";
    const sourceSummary = document.createElement("summary");
    sourceSummary.textContent = "Source references";
    sourceDetails.append(sourceSummary, provenance);
    supporting.append(sourceDetails);
  }

  if (item.mlReview && item.prompt !== REDACTED) material.append(createMlReview(item.mlReview));
  material.append(supporting);
  disclosure.append(workspace);

  if (!actionable(item) || item.prompt === REDACTED) {
    workspace.append(terminalMessage(item));
  } else {
    const form = document.createElement("form");
    form.className = "decision-form";
    form.dataset.itemKey = key;
    form.noValidate = true;
    renderOptions(item, domToken, ordinal, form);
    renderShapeControl(item, form, domToken);
    renderFreeform(item, form);
    form.append(cardActions(interaction, item, key, form));
    form.addEventListener("input", () => captureForm(key, form, true));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        captureForm(key, form, true);
        const response = collectResponse(item, form);
        void sendCommand("respond", { interactionId: interaction.interactionId, responses: [response] }, [key]);
      } catch (error) {
        revealFormError(form, error);
      }
    });
    workspace.append(form);
    formByKey.set(key, form);
    restoreDraft(key, form);
  }

  article.append(disclosure);
  return article;
}

function captureWallViewState() {
  const active = document.activeElement;
  const article = active?.closest?.(".decision-card");
  const atlasGroup = active?.closest?.(".atlas-family");
  const family = active?.closest?.(".decision-family");
  const focusKey = active?.dataset?.focusKey;
  const focus = article && focusKey ? {
    itemKey: article.dataset.itemKey,
    focusKey,
    selectionStart: typeof active.selectionStart === "number" ? active.selectionStart : null,
    selectionEnd: typeof active.selectionEnd === "number" ? active.selectionEnd : null,
    selectionDirection: active.selectionDirection || "none",
  } : null;
  const atlasFocus = active?.classList?.contains("atlas-cell")
    ? { type: "cell", itemKey: active.dataset.itemKey }
    : active?.classList?.contains("atlas-family-jump")
      ? { type: "family", familyKey: atlasGroup?.dataset.familyKey }
      : null;
  const familyHeading = active?.matches?.(".family-heading h3") ? family?.dataset.familyKey : null;
  return { scrollTop: elements.decisionScroll.scrollTop, focus, atlasFocus, familyHeading };
}

function focusWallElement(target, state = null, { reveal = false } = {}) {
  if (!target || target.closest("[hidden]")) return false;
  if (state && target.dataset.focusKey !== "summary") target.closest("details")?.setAttribute("open", "");
  target.focus({ preventScroll: true });
  if (document.activeElement !== target) return false;
  if (reveal) target.scrollIntoView({ block: "nearest", inline: "nearest" });
  if (state && typeof target.setSelectionRange === "function" && state.selectionStart !== null) {
    try {
      target.setSelectionRange(state.selectionStart, state.selectionEnd, state.selectionDirection);
    } catch {
      // Some input types expose selection properties but reject selection updates.
    }
  }
  return true;
}

function restoreWallViewState(state) {
  elements.decisionScroll.scrollTop = state.scrollTop;
  const hadManagedFocus = Boolean(state.atlasFocus || state.familyHeading || state.focus);
  if (state.atlasFocus?.type === "cell") {
    const cell = atlasCellByKey.get(state.atlasFocus.itemKey);
    if (cell && !cell.hidden && !cell.closest(".atlas-family")?.hidden) {
      setAtlasRovingFocus(cell);
      if (focusWallElement(cell)) return;
    }
  }
  if (state.atlasFocus?.type === "family") {
    const jump = atlasGroupByKey.get(state.atlasFocus.familyKey)?.querySelector(".atlas-family-jump");
    if (focusWallElement(jump)) return;
  }
  if (state.familyHeading) {
    const heading = familySectionByKey.get(state.familyHeading)?.querySelector(".family-heading h3");
    if (focusWallElement(heading)) return;
  }
  if (state.focus) {
    const article = articleByKey.get(state.focus.itemKey);
    const requested = [...(article?.querySelectorAll("[data-focus-key]") || [])]
      .find((candidate) => candidate.dataset.focusKey === state.focus.focusKey);
    const target = requested || article?.querySelector("summary");
    if (focusWallElement(target, state.focus)) {
      elements.decisionScroll.scrollTop = state.scrollTop;
      return;
    }
  }
  if (!hadManagedFocus) return;
  const next = [...articleByKey.values()]
    .find((article) => !article.hidden && actionable(entryByKey.get(article.dataset.itemKey)?.item))
    ?.querySelector("summary");
  const fallback = next || elements.decisionSearch;
  if (!focusWallElement(fallback, null, { reveal: true })) return;
  const announcement = next
    ? "The live decision set changed. Focus moved to the next available decision."
    : "The live decision set changed. Focus moved to decision search.";
  elements.mutationStatus.textContent = announcement;
}

function groupCountLabel(entries) {
  const open = entries.filter((entry) => entry.item.status === "open").length;
  const later = entries.filter((entry) => entry.item.status === "deferred").length;
  return later > 0
    ? `${open} open / ${later} later / ${entries.length} total`
    : `${open} open / ${entries.length} total`;
}

function revealDecision(key, { focus = true } = {}) {
  const article = articleByKey.get(key);
  if (!article) return;
  const disclosure = article.querySelector("details");
  if (disclosure) {
    disclosure.open = true;
    expandedKeys.add(key);
  }
  article.scrollIntoView({ behavior: preferredScrollBehavior(), block: "start" });
  if (focus) article.querySelector("summary")?.focus({ preventScroll: true });
}

function atlasStateFor(entry, key) {
  const draft = drafts.get(key);
  const form = formByKey.get(key);
  if (draft?.dirty && form) {
    try {
      collectResponse(entry.item, form);
      return { id: "ready", label: "Ready draft" };
    } catch {
      return { id: "incomplete", label: "Needs completion" };
    }
  }
  if (!actionable(entry.item)) return { id: "resolved", label: statusLabel(entry.item) };
  if (entry.item.status === "deferred") return { id: "later", label: "Later" };
  return { id: "open", label: "Open" };
}

function updateCurrentAtlasGroup() {
  atlasScrollFrame = null;
  const priorQuestion = elements.outlineList.querySelector('.atlas-cell[aria-current="true"]')?.dataset.itemKey;
  const cards = [...elements.decisionWall.querySelectorAll(".decision-card:not([hidden])")];
  const anchor = elements.decisionScroll.getBoundingClientRect().top + Math.min(elements.decisionScroll.clientHeight * 0.25, 120);
  const currentCard = cards.find(card => {
    const box = card.getBoundingClientRect();
    return box.top <= anchor && box.bottom > anchor;
  }) || cards.find(card => card.getBoundingClientRect().bottom > anchor) || cards.at(-1);
  for (const [key, cell] of atlasCellByKey) {
    if (key === currentCard?.dataset.itemKey) cell.setAttribute("aria-current", "true");
    else cell.removeAttribute("aria-current");
  }
  if (activeView === "decisions" && currentCard && priorQuestion !== currentCard.dataset.itemKey) {
    atlasCellByKey.get(currentCard.dataset.itemKey)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  const sections = [...elements.decisionWall.querySelectorAll(".decision-family:not([hidden])")];
  if (sections.length === 0) return;
  const threshold = elements.decisionScroll.scrollTop + Math.min(elements.decisionScroll.clientHeight * 0.5, 320);
  let current = sections[0];
  for (const section of sections) {
    if (section.offsetTop <= threshold) current = section;
    else break;
  }
  const currentFamilyKey = current.dataset.familyKey;
  for (const [familyKey, atlasGroup] of atlasGroupByKey.entries()) {
    const active = familyKey === currentFamilyKey;
    atlasGroup.dataset.current = String(active);
    const jump = atlasGroup.querySelector(".atlas-family-jump");
    if (active) jump?.setAttribute("aria-current", "location");
    else jump?.removeAttribute("aria-current");
  }
  if (currentAtlasFamilyKey && currentAtlasFamilyKey !== currentFamilyKey) {
    atlasGroupByKey.get(currentFamilyKey)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  currentAtlasFamilyKey = currentFamilyKey;
}

function scheduleAtlasPositionUpdate() {
  if (atlasScrollFrame !== null) return;
  atlasScrollFrame = requestAnimationFrame(updateCurrentAtlasGroup);
}

function setAtlasRovingFocus(cell) {
  const cells = [...(cell?.closest(".atlas-cells")?.querySelectorAll(".atlas-cell") || [])];
  cells.forEach((candidate) => { candidate.tabIndex = candidate === cell ? 0 : -1; });
}

function normalizeAtlasRovingFocus(container) {
  const cells = [...(container?.querySelectorAll(".atlas-cell") || [])];
  const visible = cells.filter((cell) => !cell.hidden);
  const current = visible.find((cell) => cell.tabIndex === 0) || visible[0] || null;
  cells.forEach((cell) => { cell.tabIndex = cell === current ? 0 : -1; });
}

function moveAtlasFocus(event, cell) {
  if (!new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]).has(event.key)) return;
  const cells = [...cell.closest(".atlas-cells").querySelectorAll(".atlas-cell:not([hidden])")];
  const index = cells.indexOf(cell);
  if (index < 0 || cells.length === 0) return;
  event.preventDefault();
  let nextIndex = index;
  if (["ArrowRight", "ArrowDown"].includes(event.key)) nextIndex = (index + 1) % cells.length;
  if (["ArrowLeft", "ArrowUp"].includes(event.key)) nextIndex = (index - 1 + cells.length) % cells.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = cells.length - 1;
  setAtlasRovingFocus(cells[nextIndex]);
  cells[nextIndex].focus();
}

function renderDecisionAtlas(groups) {
  elements.outlineList.replaceChildren();
  atlasCellByKey.clear();
  atlasGroupByKey.clear();
  currentAtlasFamilyKey = null;
  reviewRenderSignature = null;
  for (const group of groups) {
    const atlasGroup = document.createElement("section");
    atlasGroup.className = "atlas-family";
    atlasGroup.dataset.label = group.label;
    atlasGroup.dataset.familyKey = group.key;
    const jump = document.createElement("button");
    jump.type = "button";
    jump.className = "atlas-family-jump";
    const copy = document.createElement("strong");
    copy.textContent = group.label;
    const counts = document.createElement("span");
    counts.className = "atlas-family-counts";
    counts.textContent = groupCountLabel(group.entries);
    counts.dataset.baseCounts = counts.textContent;
    jump.dataset.baseLabel = group.label;
    jump.setAttribute("aria-label", `${group.label}. ${counts.textContent}`);
    jump.append(copy, counts);
    jump.addEventListener("click", () => {
      const section = document.getElementById(group.id);
      section?.scrollIntoView({ behavior: preferredScrollBehavior(), block: "start" });
      section?.querySelector("h3")?.focus({ preventScroll: true });
    });
    const cells = document.createElement("div");
    cells.className = "atlas-cells";
    cells.setAttribute("role", "group");
    cells.setAttribute("aria-label", `${group.label} decisions`);
    for (const entry of group.entries) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "atlas-cell";
      cell.dataset.itemKey = entry.key;
      const ordinal = document.createElement("span");
      ordinal.className = "atlas-ordinal";
      ordinal.textContent = String(entry.ordinal);
      const label = document.createElement("span");
      label.className = "atlas-question-label";
      label.textContent = cardTitle(entry.item, entry.ordinal);
      const state = document.createElement("small");
      state.className = "atlas-question-state";
      cell.append(ordinal, label, state);
      cell.tabIndex = cells.childElementCount === 0 ? 0 : -1;
      cell.addEventListener("keydown", (event) => moveAtlasFocus(event, cell));
      cell.addEventListener("click", () => {
        setAtlasRovingFocus(cell);
        revealDecision(entry.key);
      });
      cells.append(cell);
      atlasCellByKey.set(entry.key, cell);
    }
    atlasGroup.append(jump, cells);
    elements.outlineList.append(atlasGroup);
    atlasGroupByKey.set(group.key, atlasGroup);
  }
  scheduleAtlasPositionUpdate();
}

function renderDecisionWall(interactions) {
  const viewState = captureWallViewState();
  captureAllDrafts({ update: false });
  entryByKey.clear();
  familyByKey.clear();
  formByKey.clear();
  articleByKey.clear();
  familySectionByKey.clear();
  elements.decisionWall.replaceChildren();
  const groups = groupDecisionItems(interactions);
  const visibleKeys = new Set(groups.flatMap((group) => group.entries.map((entry) => entry.key)));
  const actionableKeys = new Set(groups.flatMap((group) => group.entries.filter((entry) => actionable(entry.item)).map((entry) => entry.key)));
  for (const key of expandedKeys) if (!visibleKeys.has(key)) expandedKeys.delete(key);
  for (const key of drafts.keys()) if (!actionableKeys.has(key)) drafts.delete(key);
  let openedOne = [...expandedKeys].some((key) => visibleKeys.has(key));

  for (const group of groups) {
    const section = document.createElement("section");
    section.className = "decision-family";
    section.id = group.id;
    section.dataset.familyKey = group.key;
    section.dataset.label = group.label;
    familySectionByKey.set(group.key, section);
    const heading = document.createElement("header");
    heading.className = "family-heading";
    const identity = document.createElement("div");
    const eyebrow = document.createElement("span");
    eyebrow.textContent = displaySource(group.interaction);
    const title = document.createElement("h3");
    title.id = `${group.id}-heading`;
    title.tabIndex = -1;
    title.textContent = group.label;
    identity.append(eyebrow, title);
    const count = document.createElement("span");
    count.className = "family-count";
    count.textContent = groupCountLabel(group.entries);
    heading.append(identity, count);
    section.setAttribute("aria-labelledby", title.id);

    const grid = document.createElement("div");
    grid.className = "family-grid";
    for (const entry of group.entries) {
      entryByKey.set(entry.key, entry);
      familyByKey.set(entry.key, group.key);
      const defaultOpen = !openedOne && actionable(entry.item);
      const article = createDecisionCard(entry, defaultOpen);
      articleByKey.set(entry.key, article);
      grid.append(article);
      if (defaultOpen) openedOne = true;
    }
    section.append(heading, grid);
    elements.decisionWall.append(section);
  }
  renderDecisionAtlas(groups);
  applySearch();
  restoreWallViewState(viewState);
}

function draftRecords() {
  const records = [];
  for (const [key, draft] of drafts.entries()) {
    const entry = entryByKey.get(key);
    const form = formByKey.get(key);
    if (draft.dirty && entry && actionable(entry.item) && form) records.push({ key, draft, entry, form });
  }
  return records;
}

function evaluateDraft(record) {
  try {
    return { ...record, state: "ready", label: "Ready draft", response: collectResponse(record.entry.item, record.form), error: null };
  } catch (error) {
    return { ...record, state: "incomplete", label: "Needs completion", response: null, error };
  }
}

function evaluatedDrafts() {
  return draftRecords().map(evaluateDraft);
}

function responseSummary(item, response) {
  const options = Array.isArray(item.options) ? item.options : [];
  const labelFor = (value) => {
    const index = options.findIndex((option) => String(optionValue(option)) === String(value));
    return index >= 0 ? optionDisplayLabel(options[index], index) : String(value);
  };
  if (Array.isArray(response?.selectedOptions) && response.selectedOptions.length > 0) {
    return response.selectedOptions.map(labelFor).join(", ");
  }
  if (Array.isArray(response?.ranking) && response.ranking.length > 0) {
    return [...response.ranking].sort((left, right) => left.rank - right.rank)
      .map((entry) => `${entry.rank}. ${labelFor(entry.value)}`).join("; ");
  }
  if (response?.value !== null && response?.value !== undefined && response.value !== "") {
    return Array.isArray(response.value) ? response.value.map(labelFor).join(", ") : labelFor(response.value);
  }
  return "Freeform response";
}

function reviewFocusState() {
  const card = document.activeElement?.closest?.(".draft-review-card");
  if (!card) return null;
  const cards = [...elements.draftReviewList.querySelectorAll(".draft-review-card")];
  return {
    key: card.dataset.itemKey,
    index: cards.indexOf(card),
    action: document.activeElement?.dataset?.reviewAction || "edit",
  };
}

function restoreReviewFocus(state) {
  if (!state || !elements.draftReviewDialog.open) return;
  const cards = [...elements.draftReviewList.querySelectorAll(".draft-review-card")];
  if (cards.length === 0) {
    elements.closeDraftReview.focus();
    return;
  }
  const card = cards.find((candidate) => candidate.dataset.itemKey === state.key)
    || cards[Math.min(Math.max(state.index, 0), cards.length - 1)];
  const target = card?.querySelector(`[data-review-action="${state.action}"]`)
    || card?.querySelector("[data-review-action]");
  target?.focus();
}

function draftReviewFingerprint(records) {
  return JSON.stringify({
    busy,
    offline,
    records: records.map((record) => [record.key, record.state, record.error?.message || null, record.draft]),
  });
}

function renderDraftReview({ force = false } = {}) {
  const records = evaluatedDrafts();
  const ready = records.filter((record) => record.state === "ready");
  const incomplete = records.filter((record) => record.state === "incomplete");
  const interactionCount = new Set(records.map((record) => record.entry.interaction.interactionId)).size;
  elements.reviewReadyCount.textContent = String(ready.length);
  elements.reviewIncompleteCount.textContent = String(incomplete.length);
  elements.draftReviewSummary.textContent = records.length === 0
    ? "No local drafts are prepared."
    : `${records.length} local draft${records.length === 1 ? "" : "s"} across ${interactionCount} originating interaction${interactionCount === 1 ? "" : "s"}.`;
  elements.returnDraftsLabel.textContent = ready.length === 1 ? "Return 1 ready" : `Return ${ready.length} ready`;
  elements.returnDraftsButton.disabled = records.length === 0 || incomplete.length > 0 || busy || offline;
  elements.returnDraftsButton.dataset.empty = String(records.length === 0 || incomplete.length > 0);
  const signature = draftReviewFingerprint(records);
  if (!force && signature === reviewRenderSignature) return;
  const focusState = reviewFocusState();
  reviewRenderSignature = signature;
  elements.draftReviewList.replaceChildren();
  if (records.length === 0) {
    elements.draftReviewList.append(emptyState("Prepare a recommendation or edit a decision to place it here."));
    restoreReviewFocus(focusState);
    return;
  }
  for (const record of records) {
    const { entry } = record;
    const lineage = lineageFor(entry.item);
    const article = document.createElement("article");
    article.className = "draft-review-card";
    article.dataset.state = record.state;
    article.dataset.itemKey = record.key;
    const header = document.createElement("header");
    const identity = document.createElement("div");
    const ordinal = document.createElement("span");
    ordinal.className = "review-ordinal";
    ordinal.textContent = `Decision ${entry.ordinal}`;
    const family = document.createElement("span");
    family.className = "review-family";
    family.textContent = entry.familyLabel || humanize(entry.familyRef);
    const title = document.createElement("h3");
    title.textContent = cardTitle(entry.item, entry.ordinal);
    identity.append(ordinal, family, title);
    const state = document.createElement("span");
    state.className = "review-state";
    state.textContent = record.label;
    header.append(identity, state);
    const answer = document.createElement("div");
    answer.className = "review-answer";
    const answerLabel = document.createElement("span");
    answerLabel.textContent = record.state === "ready" ? "Prepared answer" : "Required next step";
    const answerCopy = document.createElement("strong");
    answerCopy.textContent = record.state === "ready" ? responseSummary(entry.item, record.response) : record.error?.message || "Complete this response.";
    answer.append(answerLabel, answerCopy);
    if (record.response?.notes) {
      const notes = document.createElement("p");
      notes.textContent = record.response.notes;
      answer.append(notes);
    }
    const provenance = createProvenance(entry.item, { compact: true });
    const boundary = document.createElement("p");
    boundary.className = "review-boundary";
    boundary.textContent = `${displaySource(entry.interaction)} / ${entry.interaction.interactionId}`;
    boundary.title = `Originating interaction${lineage.threadId ? ` for ${lineage.threadId}` : ""}`;
    const actions = document.createElement("footer");
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "button secondary-button";
    edit.dataset.reviewAction = "edit";
    edit.innerHTML = '<i data-lucide="locate-fixed"></i><span>Edit in wall</span>';
    edit.addEventListener("click", () => {
      elements.draftReviewDialog.close();
      const project = entry.interaction.projectRef || [...projectModel(currentSnapshot).projects.values()].find(p => p.threads.has(entry.interaction.interactionId))?.ref;
      elements.decisionSearch.value = "";
      location.hash = questionRoute(project, entry.interaction.interactionId);
      readWorkspaceRoute();
      requestAnimationFrame(() => revealDecision(record.key));
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button text-button";
    remove.dataset.reviewAction = "reset";
    remove.innerHTML = '<i data-lucide="rotate-ccw"></i><span>Reset draft</span>';
    remove.addEventListener("click", () => resetDraft(record.key, record.form));
    actions.append(edit, remove);
    article.append(header, answer);
    if (entry.item.mlReview && entry.item.prompt !== REDACTED) article.append(createMlReview(entry.item.mlReview, { compact: true }));
    if (provenance.childElementCount > 0) article.append(provenance);
    article.append(boundary, actions);
    elements.draftReviewList.append(article);
  }
  refreshIcons();
  restoreReviewFocus(focusState);
}

function openDraftReview() {
  captureAllDrafts();
  renderDraftReview({ force: true });
  if (!elements.draftReviewDialog.open) elements.draftReviewDialog.showModal();
  elements.draftReviewHeading.focus();
}

function updatePreparedState() {
  const records = evaluatedDrafts();
  const statesByKey = new Map(records.map((record) => [record.key, record]));
  const draftsByFamily = new Map();
  records.forEach((record) => {
    const familyKey = familyByKey.get(record.key);
    const state = draftsByFamily.get(familyKey) || { ready: 0, incomplete: 0 };
    state[record.state] += 1;
    draftsByFamily.set(familyKey, state);
  });
  const count = records.length;
  const readyCount = records.filter((record) => record.state === "ready").length;
  const incompleteCount = count - readyCount;
  const attention = reviewAttention(pendingInteractions(currentSnapshot), drafts.keys());
  elements.preparedCount.textContent = `${attention.waiting} review${attention.waiting === 1 ? "" : "s"} waiting, ${count} draft${count === 1 ? "" : "s"}`;
  const draftStateMessage = `${attention.waiting} review${attention.waiting === 1 ? "" : "s"} waiting. ${count} draft${count === 1 ? "" : "s"}: ${readyCount} ready, ${incompleteCount} need${incompleteCount === 1 ? "s" : ""} completion.`;
  if (elements.draftStateStatus.textContent !== draftStateMessage) elements.draftStateStatus.textContent = draftStateMessage;
  elements.returnPreparedLabel.textContent = attention.waiting ? `Review ${attention.waiting} waiting`
    : count ? `Review ${count} draft${count === 1 ? "" : "s"}` : "Review clear";
  elements.returnPreparedButton.title = attention.waiting
    ? `${attention.waiting} decision${attention.waiting === 1 ? "" : "s"} need human review; ${count} draft${count === 1 ? "" : "s"} prepared.`
    : count ? `${count} local draft${count === 1 ? "" : "s"} remain available.` : "No decisions are waiting for review.";
  elements.returnPreparedButton.dataset.empty = String(attention.waiting === 0 && count === 0);
  elements.returnPreparedButton.dataset.attention = String(attention.waiting > 0);
  elements.returnPreparedButton.disabled = (attention.waiting === 0 && count === 0) || busy || offline;
  document.title = attention.waiting ? `(${attention.waiting}) ${baseDocumentTitle}` : baseDocumentTitle;
  if (attention.waiting > 0 && attention.waiting !== lastReviewCount) {
    if (lastReviewCount === null || attention.waiting > lastReviewCount) {
      elements.draftStateStatus.textContent = `${attention.waiting} human review${attention.waiting === 1 ? "" : "s"} waiting now. ${count} draft${count === 1 ? "" : "s"} prepared.`;
      if (document.hidden && globalThis.Notification?.permission === "granted") {
        try { new globalThis.Notification("Mousecat review waiting", { body: `${attention.waiting} decision${attention.waiting === 1 ? "" : "s"} need your evaluation.` }); } catch { /* title and live region remain authoritative */ }
      }
    }
  }
  lastReviewCount = attention.waiting;
  for (const card of elements.decisionWall.querySelectorAll(".decision-card")) {
    const record = statesByKey.get(card.dataset.itemKey);
    card.dataset.draftState = record?.state || "none";
    const status = card.querySelector(".decision-status");
    if (status) status.textContent = record ? `${status.dataset.baseLabel} · ${record.label}` : status.dataset.baseLabel;
    const prepare = card.querySelector(".prepare-button");
    if (prepare) {
      prepare.dataset.draft = String(Boolean(record));
      const copy = prepare.querySelector("span");
      if (copy) copy.textContent = record ? "Reset draft" : "Prepare recommendation";
    }
  }
  for (const [key, cell] of atlasCellByKey.entries()) {
    const entry = entryByKey.get(key);
    if (!entry) continue;
    const state = atlasStateFor(entry, key);
    cell.dataset.state = state.id;
    cell.querySelector(".atlas-question-state").textContent = state.label;
    cell.setAttribute("aria-label", `Decision ${entry.ordinal}: ${cardTitle(entry.item, entry.ordinal)}. ${state.label}.`);
    cell.title = `${entry.ordinal}. ${cardTitle(entry.item, entry.ordinal)} — ${state.label}`;
  }
  for (const [familyKey, group] of atlasGroupByKey.entries()) {
    const familyState = draftsByFamily.get(familyKey) || { ready: 0, incomplete: 0 };
    group.dataset.hasDrafts = String(familyState.ready + familyState.incomplete > 0);
    const counts = group.querySelector(".atlas-family-counts");
    if (counts) {
      const base = counts.dataset.baseCounts;
      counts.textContent = [familyState.ready ? `${familyState.ready} ready` : "", familyState.incomplete ? `${familyState.incomplete} incomplete` : "", base]
        .filter(Boolean).join(" · ");
      const jump = group.querySelector(".atlas-family-jump");
      jump?.setAttribute("aria-label", `${jump.dataset.baseLabel}. ${counts.textContent}`);
    }
  }
  if (elements.draftReviewDialog.open) renderDraftReview();
}

function applySearch() {
  const query = elements.decisionSearch.value.trim().toLowerCase();
  const model = projectModel(currentSnapshot || {});
  let visible = 0;
  let total = 0;
  for (const card of elements.decisionWall.querySelectorAll(".decision-card")) {
    const entry = entryByKey.get(card.dataset.itemKey);
    const inScope = entry && inQuestionScope(entry.interaction, questionScope, model);
    if (inScope) total += 1;
    const matches = inScope && (!query || card.dataset.search.includes(query));
    card.hidden = !matches;
    const cell = atlasCellByKey.get(card.dataset.itemKey);
    if (cell) cell.hidden = !matches;
    if (matches) visible += 1;
  }
  for (const family of elements.decisionWall.querySelectorAll(".decision-family")) {
    family.hidden = ![...family.querySelectorAll(".decision-card")].some((card) => !card.hidden);
    const atlasGroup = atlasGroupByKey.get(family.dataset.familyKey);
    if (atlasGroup) {
      atlasGroup.hidden = family.hidden;
      atlasGroup.dataset.named = String([...family.querySelectorAll(".decision-card")].filter(card => !card.hidden).length <= 8);
      normalizeAtlasRovingFocus(atlasGroup.querySelector(".atlas-cells"));
    }
  }
  elements.searchStatus.textContent = query ? `${visible} of ${total} questions shown` : `${total} questions`;
  elements.scopeEmpty.hidden = visible > 0;
  elements.scopeEmpty.textContent = query ? "No questions match this search." : "No questions waiting in this work. Browse all questions or return to the project.";
  const families = [...elements.decisionWall.querySelectorAll(".decision-family")].filter(family => !family.hidden);
  for (const family of families) {
    const redundantHeading = families.length === 1 && family.dataset.label === "Decisions";
    family.querySelector(".family-heading").hidden = redundantHeading;
    const atlas = atlasGroupByKey.get(family.dataset.familyKey);
    if (atlas) atlas.querySelector(".atlas-family-jump").hidden = redundantHeading;
  }
  scheduleAtlasPositionUpdate();
}

function wallFingerprint(interactions) {
  return JSON.stringify(interactions.map((interaction) => ({
    id: interaction.interactionId,
    updatedAt: interaction.updatedAt,
    title: interaction.title,
    source: interaction.source,
    skillRef: interaction.skillRef,
    items: (interaction.items || []).map((item) => [
      item.id,
      item.status,
      item.updatedAt,
      item.prompt,
      item.title,
      item.description,
      item.options,
      item.mlReview,
    ]),
  })));
}

function updateProgress(interactions) {
  const items = interactions.flatMap((interaction) => interaction.items || []);
  const resolved = items.filter((item) => !actionable(item)).length;
  const total = items.length;
  elements.progressLabel.textContent = `${resolved} resolved / ${total}`;
  elements.progressValue.max = Math.max(total, 1);
  elements.progressValue.value = resolved;
  elements.progressValue.textContent = `${total === 0 ? 0 : Math.round((resolved / total) * 100)}%`;
}

function renderIdle(snapshot) {
  wallSignature = null;
  drafts.clear();
  expandedKeys.clear();
  entryByKey.clear();
  familyByKey.clear();
  formByKey.clear();
  articleByKey.clear();
  atlasCellByKey.clear();
  atlasGroupByKey.clear();
  familySectionByKey.clear();
  currentAtlasFamilyKey = null;
  reviewRenderSignature = null;
  elements.decisionWall.replaceChildren();
  elements.outlineList.replaceChildren();
  if (elements.draftReviewDialog.open) elements.draftReviewDialog.close();
  elements.searchStatus.textContent = "0 decisions visible";
  elements.idleState.hidden = false;
  elements.decisionState.hidden = true;
  elements.sourceLabel.textContent = `${snapshot.status.hostProfile || "local"} / ${snapshot.status.adapterProfile || "generic-mcp"}`;
  setBusy(false);
}

function applySkillPresentation(controlPlane, activeSkillRef) {
  const skill = controlPlane?.skills?.find((candidate) => candidate.id === activeSkillRef);
  const accent = skill?.presentation?.accent || "blue";
  const icon = skill?.presentation?.icon || "layout-grid";
  elements.widget.dataset.accent = accent;
  elements.draftReviewDialog.dataset.accent = accent;
  if (elements.brandMark.dataset.icon !== icon) {
    const glyph = document.createElement("i");
    glyph.dataset.lucide = icon;
    elements.brandMark.replaceChildren(glyph);
    elements.brandMark.dataset.icon = icon;
  }
}

function renderWorkspace(snapshot, interactions, activeSkillRef) {
  elements.idleState.hidden = true;
  elements.decisionState.hidden = false;
  const scoped = interactions.filter(interaction => inQuestionScope(interaction, questionScope, projectModel(snapshot)));
  const primary = scoped[0];
  const itemCount = scoped.reduce((count, interaction) => count + (interaction.items?.length || 0), 0);
  elements.decisionState.dataset.itemCount = String(itemCount);
  if (itemCount === 1) elements.decisionSearch.value = "";
  elements.sourceLabel.textContent = scoped.length === 1 ? displaySource(primary) : `${scoped.length} originating interactions`;
  elements.skillLabel.textContent = scoped.length === 1 ? displaySkill(primary, snapshot.controlPlane, activeSkillRef) : "Questions";
  elements.workspaceTitle.textContent = scoped.length === 1 ? (primary.title || "Questions") : "Questions";
  elements.workspaceDescription.textContent = itemCount === 1 ? "Review the proposal and return your response below." : `${itemCount} decisions available for review.`;
  updateProgress(scoped);
  const signature = wallFingerprint(interactions);
  if (signature !== wallSignature) {
    renderDecisionWall(interactions);
    wallSignature = signature;
  }
  applySearch();
  setBusy(false);
}

function renderSkillMap(controlPlane, activeSkillRef, frameworkRef) {
  elements.skillMap.replaceChildren();
  const framework = controlPlane?.frameworks?.find((candidate) => candidate.id === frameworkRef)
    || controlPlane?.framework
    || null;
  const skills = (Array.isArray(controlPlane?.skills) ? controlPlane.skills : [])
    .filter((skill) => framework?.skillRefs?.includes(skill.id));
  for (const skill of skills) {
    const node = document.createElement("div");
    node.className = "skill-node";
    node.dataset.accent = skill.presentation?.accent || "neutral";
    node.dataset.active = String(skill.id === activeSkillRef);
    const icon = document.createElement("span");
    icon.className = "skill-icon";
    const glyph = document.createElement("i");
    glyph.dataset.lucide = skill.presentation?.icon || "component";
    icon.append(glyph);
    const copy = document.createElement("span");
    copy.className = "skill-copy";
    const label = document.createElement("strong");
    label.textContent = skill.label;
    const role = document.createElement("span");
    role.textContent = String(skill.role || "framework skill").replaceAll("-", " ");
    copy.append(label, role);
    const count = document.createElement("span");
    count.className = "skill-count";
    count.textContent = String(skill.interactionCount || 0);
    node.append(icon, copy, count);
    elements.skillMap.append(node);
  }
  elements.routingRule.textContent = framework?.routing?.fixedTransitions === false
    ? "Context routes each recursive handoff"
    : "Framework route unavailable";
}

function renderFrameworkPicker(controlPlane, activeSkillRef) {
  const frameworks = Array.isArray(controlPlane?.frameworks) ? controlPlane.frameworks : [];
  const activeFrameworkRef = frameworks.find((framework) => framework.skillRefs?.includes(activeSkillRef))?.id
    || controlPlane?.activeFrameworkRef
    || frameworks[0]?.id
    || null;
  if (activeFrameworkRef !== lastActiveFrameworkRef) {
    selectedFrameworkRef = activeFrameworkRef;
    lastActiveFrameworkRef = activeFrameworkRef;
  } else if (!selectedFrameworkRef || !frameworks.some((framework) => framework.id === selectedFrameworkRef)) {
    selectedFrameworkRef = activeFrameworkRef;
  }
  elements.frameworkPicker.replaceChildren(...frameworks.map((framework) => new Option(framework.label, framework.id)));
  elements.frameworkPicker.value = selectedFrameworkRef || "";
  elements.frameworkPicker.hidden = frameworks.length < 2;
  const selected = frameworks.find((framework) => framework.id === selectedFrameworkRef);
  elements.frameworkHeading.textContent = selected?.label || "Framework";
  renderSkillMap(controlPlane, activeSkillRef, selectedFrameworkRef);
}

function renderSessions(controlPlane) {
  elements.sessionList.replaceChildren();
  const sessions = Array.isArray(controlPlane?.sessions) ? controlPlane.sessions : [];
  if (sessions.length === 0) {
    elements.sessionList.append(emptyState("No registered sessions"));
    return;
  }
  for (const session of sessions.slice(-8).reverse()) {
    const row = document.createElement("div");
    row.className = "session-row";
    const source = document.createElement("strong");
    source.textContent = [session.host || "Mousecat", session.provider].filter(Boolean).join(" / ");
    const id = document.createElement("span");
    id.textContent = session.objective || [session.model, session.id].filter(Boolean).join(" / ");
    id.title = session.id;
    const status = document.createElement("span");
    status.className = "session-status";
    status.textContent = session.status;
    row.append(source, id, status);
    elements.sessionList.append(row);
  }
}

function renderThreads(controlPlane) {
  elements.threadList.replaceChildren();
  const threads = Array.isArray(controlPlane?.openThreads) ? controlPlane.openThreads : [];
  if (threads.length === 0) {
    elements.threadList.append(emptyState("No open seams"));
    return;
  }
  for (const thread of threads.slice(0, 12)) {
    const row = document.createElement("div");
    row.className = "thread-row";
    const marker = document.createElement("span");
    marker.className = "thread-marker";
    const copy = document.createElement("span");
    copy.textContent = thread.prompt === REDACTED ? "Sensitive seam" : thread.prompt;
    row.append(marker, copy);
    elements.threadList.append(row);
  }
}

function renderContext(snapshot, activeSkillRef) {
  const controlPlane = snapshot.controlPlane || {};
  const signature = JSON.stringify({
    activeSkillRef,
    activeFrameworkRef: controlPlane.activeFrameworkRef,
    frameworks: controlPlane.frameworks,
    skills: controlPlane.skills,
    sessions: controlPlane.sessions,
    openThreads: controlPlane.openThreads,
  });
  if (signature === contextSignature) return;
  renderFrameworkPicker(controlPlane, activeSkillRef);
  renderSessions(controlPlane);
  renderThreads(controlPlane);
  const sessionCount = controlPlane.sessions?.length || 0;
  const seamCount = controlPlane.openThreads?.length || 0;
  elements.contextSummaryLabel.textContent = `${sessionCount} sessions / ${seamCount} open seams`;
  contextSignature = signature;
}

function setView(view) {
  activeView = ["projects", "native"].includes(view) ? view : "decisions";
  nativeViewToggle.setAttribute("aria-pressed", String(activeView === "native"));
  document.querySelector("#native-view-state").hidden = activeView !== "native";
  elements.projectsToggle.setAttribute("aria-pressed", String(activeView === "projects"));
  elements.questionsToggle.setAttribute("aria-pressed", String(activeView === "decisions"));
  elements.projectsState.hidden = activeView !== "projects";
  const waiting = pendingInteractions(currentSnapshot).length > 0;
  elements.idleState.hidden = activeView !== "decisions" || waiting;
  elements.decisionState.hidden = activeView !== "decisions" || !waiting;
}

function renderProjects(snapshot) { renderProjectView(snapshot, projectSelection); }

function readWorkspaceRoute() {
  if (location.hash.startsWith("#history")) return;
  revealScopeOnRender = location.hash !== lastWorkspaceHash;
  if (revealScopeOnRender) elements.decisionSearch.value = "";
  lastWorkspaceHash = location.hash;
  const [page, query] = location.hash.slice(1).split("?");
  const params = new URLSearchParams(query || "");
  if (page === "native-view") {
    setView("native");
    nativeView.open(params.get("session"));
  } else {
    nativeView.close();
  if (page === "questions" || page === "review") {
    questionScope = { project: params.get("project"), interaction: params.get("interaction") };
    setView("decisions");
  } else {
    projectSelection = { project: params.get("project"), group: params.get("group") };
    setView("projects");
  }
  }
  elements.questionBreadcrumb.replaceChildren();
  const all = document.createElement("a"); all.textContent = "All questions"; all.href = "#questions";
  elements.questionBreadcrumb.append(all);
  if (questionScope.project) {
    const model = projectModel(currentSnapshot || {});
    const project = document.createElement("a");
    project.textContent = model.projects.get(questionScope.project)?.label || questionScope.project.replace(/^project:/u, "").replaceAll("-", " ");
    project.href = projectRoute(questionScope.project);
    const work = document.createElement("a"); work.textContent = "Project questions"; work.href = questionRoute(questionScope.project);
    elements.questionBreadcrumb.append(" / ", project, " / ", work);
  }
  if (currentSnapshot) render(currentSnapshot);
}

function render(snapshot, { preserveManagedFocus = false } = {}) {
  currentSnapshot = snapshot;
  offline = false;
  const interactions = pendingInteractions(snapshot);
  const activeElement = document.activeElement;
  const focusIdleAfterTransition = preserveManagedFocus
    && interactions.length === 0
    && !elements.decisionState.hidden
    && Boolean(activeElement?.closest?.("#decision-state, #draft-review-dialog"));
  const scopedInteractions = interactions.filter(interaction => inQuestionScope(interaction, questionScope, projectModel(snapshot)));
  const activeSkillRef = resolveActiveSkillRef(snapshot.controlPlane, scopedInteractions);
  applySkillPresentation(snapshot.controlPlane, activeSkillRef);
  if (interactions.length === 0) renderIdle(snapshot);
  else renderWorkspace(snapshot, interactions, activeSkillRef);
  renderContext(snapshot, activeSkillRef);
  renderProjects(snapshot);
  setView(activeView);
  if (revealScopeOnRender && activeView === "decisions") {
    const first = [...elements.decisionWall.querySelectorAll(".decision-card")].find(card => !card.hidden);
    if (first) revealDecision(first.dataset.itemKey);
  }
  revealScopeOnRender = false;
  setConnection("live", "Live");
  refreshIcons();
  if (focusIdleAfterTransition) {
    const heading = document.querySelector("#idle-state h2");
    if (heading) heading.tabIndex = -1;
    if (focusWallElement(heading, null, { reveal: true })) {
      elements.mutationStatus.textContent = "The live decision set changed. No decisions remain. Focus moved to the idle workspace.";
    }
  }
}

async function readSnapshot({ quiet = false } = {}) {
  if (quiet && (busy || snapshotController)) return;
  if (!quiet) setBusy(true);
  snapshotController?.abort();
  const controller = new AbortController();
  snapshotController = controller;
  const generation = ++snapshotGeneration;
  try {
    const response = await fetch("/api/snapshot", {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.code || `snapshot-${response.status}`);
    if (generation !== snapshotGeneration) return;
    if (!quiet || !noticeSticky) showNotice("");
    render(payload, { preserveManagedFocus: quiet });
  } catch (error) {
    if (error.name === "AbortError") return;
    setConnection("error", "Offline");
    if (!quiet || !currentSnapshot) showNotice(error.message || "Mousecat is unavailable.");
    offline = true;
    setBusy(false);
  } finally {
    if (snapshotController === controller) snapshotController = null;
  }
}

async function postCommand(commandId, values) {
  const response = await fetch("/api/command", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ commandId, values }),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) throw new Error(payload.code || `command-${response.status}`);
  return payload;
}

function beginMutation() {
  snapshotGeneration += 1;
  snapshotController?.abort();
  snapshotController = null;
  setBusy(true);
  showNotice("");
}

function focusAfterMutation(key, announcement) {
  elements.mutationStatus.textContent = announcement;
  requestAnimationFrame(() => {
    const exactArticle = articleByKey.get(key);
    const exact = exactArticle && !exactArticle.hidden ? exactArticle.querySelector("summary") : null;
    const next = [...articleByKey.values()]
      .find((article) => !article.hidden && actionable(entryByKey.get(article.dataset.itemKey)?.item))
      ?.querySelector("summary");
    const idleHeading = !elements.idleState.hidden ? document.querySelector("#idle-state h2") : null;
    for (const target of [exact, next, idleHeading, elements.decisionSearch, elements.workspaceTitle]) {
      if (!target) continue;
      if (!target.matches("summary, button, input, select, textarea, a[href]")) target.tabIndex = -1;
      if (focusWallElement(target, null, { reveal: true })) return;
    }
  });
}

async function sendCommand(commandId, values, submittedKeys = []) {
  beginMutation();
  try {
    const payload = await postCommand(commandId, values);
    if (["respond", "hold"].includes(commandId)) submittedKeys.forEach((key) => drafts.delete(key));
    render(payload.snapshot);
    focusAfterMutation(submittedKeys[0], commandId === "defer"
      ? "Decision moved to Later."
      : commandId === "hold" ? "Decision held and returned to its originating caller." : "Response returned to its originating caller.");
  } catch (error) {
    showNotice(error.message || "The response could not be returned.", { sticky: true });
    setBusy(false);
  }
}

function revealFormError(form, error) {
  const details = form.closest("details");
  if (details) {
    details.open = true;
    expandedKeys.add(form.dataset.itemKey);
  }
  showNotice(error.message || "Complete this decision before returning it.", { sticky: true });
  const target = form.querySelector("input, select, textarea, button");
  target?.focus();
  form.closest(".decision-card")?.scrollIntoView({ behavior: preferredScrollBehavior(), block: "center" });
}

async function returnPreparedResponses() {
  captureAllDrafts();
  const records = evaluatedDrafts();
  if (records.length === 0) return;
  const invalid = records.find((record) => record.state === "incomplete");
  if (invalid) {
    renderDraftReview();
    showNotice("Complete every draft in the review before returning this set.", { sticky: true });
    return;
  }
  let batches;
  try {
    batches = planResponseBatches(records.map((record) => ({
      interactionId: record.entry.interaction.interactionId,
      key: record.key,
      response: record.response,
    })));
  } catch (error) {
    showNotice(error.message || "The prepared response set is too large to return safely.", { sticky: true });
    return;
  }

  if (elements.draftReviewDialog.open) elements.draftReviewDialog.close();
  beginMutation();
  let lastPayload = null;
  const returnedKeys = [];
  try {
    for (const batch of batches) {
      lastPayload = await postCommand("respond", { interactionId: batch.interactionId, responses: batch.responses });
      batch.keys.forEach((key) => drafts.delete(key));
      returnedKeys.push(...batch.keys);
    }
    if (lastPayload) {
      render(lastPayload.snapshot);
      focusAfterMutation(returnedKeys[0], `${returnedKeys.length} response${returnedKeys.length === 1 ? "" : "s"} returned in bounded requests.`);
    }
  } catch (error) {
    showNotice(error.message || "The draft responses could not all be returned.", { sticky: true });
    if (lastPayload) {
      render(lastPayload.snapshot);
      focusAfterMutation(returnedKeys[0], `${returnedKeys.length} earlier response${returnedKeys.length === 1 ? " remains" : "s remain"} committed; a later bounded request failed.`);
    } else {
      setBusy(false);
      elements.returnPreparedButton.focus();
    }
  }
}

function scheduleRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => void readSnapshot({ quiet: true }), 900);
}

elements.decisionSearch.addEventListener("input", applySearch);
elements.reviewContextToggle.addEventListener("click", () => elements.reviewContextDialog.showModal());
elements.reviewContextClose.addEventListener("click", () => elements.reviewContextDialog.close());
elements.decisionScroll.addEventListener("scroll", scheduleAtlasPositionUpdate, { passive: true });
function openReviewAttention() {
  captureAllDrafts();
  if (evaluatedDrafts().length > 0) { openDraftReview(); return; }
  const interactions = pendingInteractions(currentSnapshot);
  const firstInteraction = interactions.find(interaction => interaction.items?.some(actionable));
  const firstItem = firstInteraction?.items?.find(actionable);
  if (!firstInteraction || !firstItem) return;
  const project = firstInteraction.projectRef
    || [...projectModel(currentSnapshot).projects.values()].find(value => value.threads.has(firstInteraction.interactionId))?.ref;
  elements.decisionSearch.value = "";
  location.hash = questionRoute(project, firstInteraction.interactionId);
  readWorkspaceRoute();
  requestAnimationFrame(() => revealDecision(draftKey(firstInteraction, firstItem)));
}

elements.returnPreparedButton.addEventListener("click", openReviewAttention);
elements.closeDraftReview.addEventListener("click", () => elements.draftReviewDialog.close());
elements.cancelDraftReview.addEventListener("click", () => elements.draftReviewDialog.close());
elements.returnDraftsButton.addEventListener("click", () => void returnPreparedResponses());
elements.frameworkPicker.addEventListener("change", () => {
  selectedFrameworkRef = elements.frameworkPicker.value;
  contextSignature = null;
  const interactions = pendingInteractions(currentSnapshot).filter(interaction => inQuestionScope(interaction, questionScope, projectModel(currentSnapshot)));
  const activeSkillRef = resolveActiveSkillRef(currentSnapshot?.controlPlane, interactions);
  renderContext(currentSnapshot, activeSkillRef);
  refreshIcons();
});

elements.projectsToggle.addEventListener("click", () => {
  location.hash = projectSelection.project ? projectRoute(projectSelection.project) : projectSelection.group ? "#projects?" + new URLSearchParams({ group: projectSelection.group }) : "#projects";
});
elements.questionsToggle.addEventListener("click", () => { location.hash = questionRoute(questionScope.project, questionScope.interaction); });
nativeViewToggle.addEventListener("click", () => {
  nativeView.close();
  if (location.hash === "#native-view") readWorkspaceRoute();
  else location.hash = "#native-view";
});
window.addEventListener("hashchange", readWorkspaceRoute);
readWorkspaceRoute();

refreshIcons();
installHistory();
void readSnapshot().then(scheduleRefresh);
