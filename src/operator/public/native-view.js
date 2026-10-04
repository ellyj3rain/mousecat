import { createNativeFeedWindows } from "./native-window.js";
import { createNativeVideoPlayer } from "./native-video.js";
import { createNativeObservationMap } from "./native-observation-map.js";

function node(tag, text, parent, className) {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = text;
  if (className) value.className = className;
  parent?.append(value);
  return value;
}

function toolIcon(control, name, label) {
  control.setAttribute("aria-label", label);
  if (control.dataset.icon === name) return;
  control.dataset.icon = name;
  const icon = globalThis.lucide?.icons?.[name];
  control.replaceChildren(icon ? globalThis.lucide.createElement(icon, { "aria-hidden": "true" }) : document.createTextNode(label));
}

function frameGeometry(media, image) {
  // Geometry belongs to the accepted image, alongside its timestamp and subject.
  const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
  media.style.setProperty("--native-frame-aspect", `${width} / ${height}`);
  media.parentElement.dataset.frameWidth = String(width);
  media.parentElement.dataset.frameHeight = String(height);
}

function readPreference(name, fallback) {
  try {
    const value = localStorage.getItem(`mousecat.native-view.${name}`);
    return value === null ? fallback : JSON.parse(value);
  } catch { return fallback; }
}

function writePreference(name, value) {
  try { localStorage.setItem(`mousecat.native-view.${name}`, JSON.stringify(value)); } catch { /* Preferences are optional. */ }
}

export function nativeSessionFacts(view) {
  const value = view.study;
  const duration = value.attemptDurationSeconds < 3600
    ? `${Math.round(value.attemptDurationSeconds / 60 * 10) / 10} min`
    : `${Math.round(value.attemptDurationSeconds / 3600 * 10) / 10} hr`;
  const observedHours = view.inspection?.sequence > 0 && Number.isFinite(view.inspection.worldHours)
    ? view.inspection.worldHours : null;
  const clock = view.state === "ended"
    ? `last observed world hour ${observedHours === null ? "unavailable" : observedHours.toFixed(3)} · validated time ${value.accumulatedWorldHours.toFixed(2)} hr`
    : `world hour ${(value.status === "running" && observedHours !== null ? observedHours : value.worldHours).toFixed(2)}`;
  return `Attempt ${value.attempt} · ${value.status} · ${clock} · ${duration} per attempt`
    + (value.lastStopReason ? ` · ${value.lastStopReason}` : "");
}

export function createNativeImageDeliveryCounter() {
  const recent = new Set();
  let received = 0;
  return {
    accept(identity) {
      if (recent.has(identity)) return;
      recent.add(identity);
      if (recent.size > 64) recent.delete(recent.values().next().value);
      received += 1;
    },
    sample(elapsedMs) { const rate = 1000 * received / elapsedMs; received = 0; return rate; },
    reset() { recent.clear(); received = 0; },
  };
}

// Presentation of source-owned person text. This never reconstructs a motive
// from controller state or a domain-specific record hidden behind the adapter.
export function nativePersonContext(person) {
  const lines = String(person?.summary || "").split(/\r?\n/u).map(value => value.trim()).filter(Boolean);
  const fields = lines.map(text => {
    const match = /^([^:]{1,60}):\s*(.+)$/u.exec(text);
    return match ? { label: match[1], value: match[2] } : null;
  }).filter(Boolean);
  for (const section of person?.sections || []) {
    if (section.status && section.status !== "available") continue;
    for (const row of section.rows || []) if (row.value) fields.push(row);
  }
  for (const labels of [["recorded reason", "current reason", "reason"], ["current activity", "activity", "current action", "action"]]) {
    const field = fields.find(row => labels.includes(String(row.label).toLocaleLowerCase()));
    if (field) return `${field.label}: ${field.value}`;
  }
  return lines.slice(0, 2).join(" · ") || "No current reason or activity reported.";
}

export function installNativeView(root) {
  if (!document.querySelector('link[data-native-observation-style]')) {
    const style = document.createElement("link"); style.rel = "stylesheet"; style.href = "/native-observation-map.css";
    style.dataset.nativeObservationStyle = ""; document.head.append(style);
  }
  const heading = node("header", undefined, root, "native-heading");
  const identity = node("div", undefined, heading);
  const title = node("h2", "Simulation", identity);
  const project = node("a", "Project", identity); project.hidden = true;
  const sessionLabel = node("label", "Session ", heading);
  const sessions = node("select", undefined, sessionLabel); sessions.setAttribute("aria-label", "Simulation session");
  const connection = node("strong", "Connecting", heading, "native-connection"); connection.setAttribute("role", "status");
  const layoutActions = node("div", undefined, heading, "native-layout-actions");
  const inspectorToggle = node("button", "Hide details", layoutActions, "button secondary-button native-layout-toggle");
  inspectorToggle.type = "button"; inspectorToggle.setAttribute("aria-controls", "native-person-inspector");
  const body = node("div", undefined, root, "native-body");
  const stage = node("div", undefined, body, "native-stage");
  const context = node("div", undefined, stage, "native-view-context");
  const camera = node("p", undefined, context, "native-camera");
  const cameraSubject = node("strong", "Camera state unavailable", camera);
  const cameraSummary = node("span", "", camera);
  const inspected = node("p", undefined, context, "native-inspected-person");
  node("span", "Inspecting", inspected);
  const inspectedName = node("strong", "No person selected", inspected);
  const viewOptions = node("details", undefined, stage, "native-view-options");
  node("summary", "View settings", viewOptions);
  viewOptions.append(context);
  const observatoryTools = node("div", undefined, viewOptions, "native-observatory-tools");
  const shapeControl = node("label", undefined, observatoryTools, "native-view-choice");
  node("span", "Shape", shapeControl);
  const shape = node("select", undefined, shapeControl); shape.setAttribute("aria-label", "View shape");
  for (const [value, label] of [["wide", "Wide"], ["square", "Square"], ["frame", "Frame"]]) {
    const option = node("option", label, shape); option.value = value;
  }
  const savedShape = readPreference("shape", "wide"); shape.value = ["wide", "square", "frame"].includes(savedShape) ? savedShape : "wide";
  const framingControl = node("label", undefined, observatoryTools, "native-view-choice");
  node("span", "Framing", framingControl);
  const framing = node("select", undefined, framingControl); framing.setAttribute("aria-label", "Image framing");
  for (const [value, label] of [["fill", "Fill view"], ["fit", "Fit complete frame"]]) {
    const option = node("option", label, framing); option.value = value;
  }
  const savedFraming = readPreference("framing", "fill"); framing.value = ["fill", "fit"].includes(savedFraming) ? savedFraming : "fill";
  const sizeControl = node("label", undefined, observatoryTools, "native-panel-size");
  node("span", "Minimum panel size", sizeControl);
  const panelSize = node("input", undefined, sizeControl); panelSize.type = "range"; panelSize.id = "native-observatory-panel-size"; panelSize.min = "280"; panelSize.max = "640"; panelSize.step = "40";
  const preferredSize = Number(readPreference("panel-size", 320));
  panelSize.value = Number.isInteger(preferredSize) && preferredSize >= 280 && preferredSize <= 640 && preferredSize % 40 === 0 ? preferredSize : 320;
  panelSize.setAttribute("aria-label", "Observatory panel size");
  const panelSizeValue = node("output", `${panelSize.value} px`, sizeControl); panelSizeValue.htmlFor = panelSize.id;
  const opacityControl = node("label", undefined, observatoryTools, "native-panel-size native-info-opacity");
  node("span", "Info opacity", opacityControl);
  const infoOpacity = node("input", undefined, opacityControl); infoOpacity.type = "range"; infoOpacity.id = "native-observatory-info-opacity";
  infoOpacity.min = "0"; infoOpacity.max = "100"; infoOpacity.step = "5";
  const preferredOpacity = Number(readPreference("info-opacity", 55));
  infoOpacity.value = Number.isInteger(preferredOpacity) && preferredOpacity >= 0 && preferredOpacity <= 100 && preferredOpacity % 5 === 0 ? preferredOpacity : 55;
  infoOpacity.setAttribute("aria-label", "Information layer opacity");
  const infoOpacityValue = node("output", `${infoOpacity.value}%`, opacityControl); infoOpacityValue.htmlFor = infoOpacity.id;
  const viewChooser = node("div", undefined, observatoryTools, "native-observatory-choice");
  node("span", "Views", viewChooser); const viewToggles = node("div", undefined, viewChooser, "native-observatory-toggles");
  const overlayChooser = node("div", undefined, observatoryTools, "native-observatory-choice");
  node("span", "Overlay", overlayChooser); const overlayToggles = node("div", undefined, overlayChooser, "native-observatory-toggles");
  const overlayChoices = [["activity", "Activity"], ["attention", "Attention"], ["memory", "Memory"], ["needs", "Needs"]];
  const knownOverlays = new Set(overlayChoices.map(([id]) => id));
  const savedOverlays = readPreference("overlays", ["attention"]);
  const visibleOverlays = new Set(Array.isArray(savedOverlays) ? savedOverlays.filter(id => knownOverlays.has(id)) : ["attention"]);
  for (const [id, label] of overlayChoices) {
    const value = node("button", label, overlayToggles, "native-observatory-toggle"); value.type = "button"; value.dataset.overlay = id;
    value.setAttribute("aria-pressed", String(visibleOverlays.has(id)));
    value.addEventListener("click", () => {
      if (visibleOverlays.has(id)) visibleOverlays.delete(id); else visibleOverlays.add(id);
      writePreference("overlays", [...visibleOverlays]);
      value.setAttribute("aria-pressed", String(visibleOverlays.has(id))); if (current) renderFeeds(current);
    });
  }
  const panelGrid = node("div", undefined, stage, "native-observatory-grid");
  function applyFraming() {
    if (shape.value === "frame") stage.style.removeProperty("--native-view-aspect");
    else stage.style.setProperty("--native-view-aspect", shape.value === "wide" ? "16 / 9" : "1 / 1");
    stage.style.setProperty("--native-frame-fit", framing.value === "fill" ? "cover" : "contain");
  }
  applyFraming();
  for (const control of [shape, framing]) control.addEventListener("change", () => {
    writePreference("shape", shape.value); writePreference("framing", framing.value);
    applyFraming(); refreshFeedWindows();
  });
  stage.style.setProperty("--native-panel-size", `${panelSize.value}px`);
  stage.style.setProperty("--native-info-opacity", String(Number(infoOpacity.value) / 100));
  panelSize.addEventListener("input", () => {
    stage.style.setProperty("--native-panel-size", `${panelSize.value}px`); panelSizeValue.textContent = `${panelSize.value} px`;
    writePreference("panel-size", Number(panelSize.value));
  });
  infoOpacity.addEventListener("input", () => {
    stage.style.setProperty("--native-info-opacity", String(Number(infoOpacity.value) / 100));
    infoOpacityValue.textContent = `${infoOpacity.value}%`;
    writePreference("info-opacity", Number(infoOpacity.value));
  });
  const primaryPanel = node("article", undefined, panelGrid, "native-observatory-panel native-observatory-primary");
  const viewport = node("div", undefined, primaryPanel, "native-viewport");
  viewport.tabIndex = 0; viewport.setAttribute("aria-label", "Native simulation view. Arrow keys move the camera; mouse wheel or plus and minus zoom; space pauses or resumes.");
  const picture = node("img", undefined, viewport); picture.alt = "Native simulation frame"; picture.hidden = true; picture.draggable = false;
  const primaryCanvas = node("canvas", undefined, viewport, "native-video-surface"); primaryCanvas.hidden = true;
  const empty = node("p", "Waiting for the simulation feed.", viewport, "native-empty");
  const primaryOverlay = node("div", undefined, viewport, "native-panel-telemetry"); primaryOverlay.hidden = true;
  const primaryCaption = node("div", undefined, primaryPanel, "native-panel-caption");
  const primaryMeta = node("div", undefined, primaryCaption, "native-panel-meta");
  const primaryLabel = node("strong", "Current camera", primaryMeta), primaryAge = node("span", "No frame", primaryMeta);
  const primaryContext = createPersonContext(primaryPanel);
  function panelTools(caption) {
    const tools = node("div", undefined, caption, "native-panel-tools");
    const windowButton = node("button", "Window", tools); windowButton.type = "button";
    const follow = node("button", "Follow", tools); follow.type = "button"; follow.hidden = true;
    toolIcon(follow, "LocateFixed", "Follow subject");
    const menu = node("details", undefined, tools, "native-panel-menu");
    const menuToggle = node("summary", "", menu); menuToggle.title = "Screen tools";
    toolIcon(menuToggle, "Ellipsis", "Tools");
    const options = node("div", undefined, menu, "native-tool-options");
    const info = node("button", "Info", options); info.type = "button";
    const hide = node("button", "Hide", options); hide.type = "button";
    return { windowButton, follow, info, hide, options };
  }
  const { info: primaryInfo, windowButton: primaryWindow, follow: primaryFollow, hide: primaryHide, options: primaryOptions } = panelTools(primaryCaption);
  const noScreens = node("p", "Choose a view above to restore the observatory.", panelGrid, "native-observatory-empty"); noScreens.hidden = true;
  const frameState = node("div", undefined, viewOptions, "native-frame-state");
  const imageAge = node("span", "No frame received", frameState);
  const deliveryRate = node("span", "", frameState);
  const controls = node("div", undefined, stage, "native-controls"); controls.setAttribute("aria-label", "Observer controls");
  const controlButtons = [];
  primaryFollow.addEventListener("click", () => void send("auto")); controlButtons.push(primaryFollow);
  function button(label, action, values, parent = controls) {
    const value = node("button", label, parent, "button secondary-button"); value.type = "button"; value.disabled = true;
    value.addEventListener("click", () => {
      const payload = typeof values === "function" ? values() : values;
      if (["pan", "zoom"].includes(action)) moveCamera(action, payload, viewport); else void send(action, payload);
    });
    controlButtons.push(value); return value;
  }
  const pause = button("Pause", "pause");
  const speeds = node("div", undefined, controls, "native-speeds"); speeds.setAttribute("aria-label", "Simulation speed");
  for (const value of [1, 2, 3]) button(["Normal", "Fast", "Fastest"][value - 1], "speed", { value }, speeds);
  const primaryCameraTools = node("div", undefined, primaryOptions, "native-controls native-camera-controls");
  const zoomControls = node("div", undefined, primaryCameraTools, "native-zoom"); zoomControls.hidden = true;
  const zoomOut = button("−", "zoom", { value: 1 }, zoomControls); zoomOut.setAttribute("aria-label", "Zoom out"); zoomOut.title = "Zoom out (mouse wheel down or −)";
  const zoomLabel = node("span", "", zoomControls); zoomLabel.setAttribute("aria-live", "off");
  const zoomIn = button("+", "zoom", { value: -1 }, zoomControls); zoomIn.setAttribute("aria-label", "Zoom in"); zoomIn.title = "Zoom in (mouse wheel up or +)";
  const pan = node("div", undefined, primaryCameraTools, "native-pan");
  for (const [label, dx, dy, direction] of [["←", -8, 8, "left"], ["↑", -8, -8, "up"], ["↓", 8, 8, "down"], ["→", 8, -8, "right"]]) {
    const b = button(label, "pan", { dx, dy }, pan); b.dataset.direction = direction; b.setAttribute("aria-label", `Move camera ${label}`);
  }
  const primaryFit = node("button", "⌾", pan, "button secondary-button"); primaryFit.type = "button"; primaryFit.dataset.direction = "center";
  primaryFit.setAttribute("aria-label", "Fit saved view"); primaryFit.addEventListener("click", () => { resetBrowse(viewport); freshness(); }); primaryFit.hidden = true;
  const endRun = button("End run", "stop");
  const sessionBar = node("section", undefined, controls, "native-session-bar"); sessionBar.hidden = true;
  const sessionActions = node("div", undefined, sessionBar, "native-session-actions");
  const checkpoint = button("Save session", "checkpoint", undefined, sessionActions);
  const continueSession = button("Continue session", "continue", undefined, sessionActions);
  const sessionSettings = node("details", undefined, sessionBar, "native-session-settings");
  node("summary", "Session settings", sessionSettings);
  const sessionFacts = node("p", "", sessionSettings, "native-session-facts");
  const sessionReview = node("p", "", sessionSettings, "native-session-review"); sessionReview.hidden = true;
  const sessionForm = node("form", undefined, sessionSettings, "native-session-form");
  const durationLabel = node("label", undefined, sessionForm);
  node("span", "Attempt duration (minutes)", durationLabel);
  const durationMinutes = node("input", undefined, durationLabel); durationMinutes.type = "number";
  durationMinutes.min = "0.5"; durationMinutes.max = "10080"; durationMinutes.step = "0.5";
  const autoLabel = node("label", undefined, sessionForm, "native-session-auto");
  const autoContinue = node("input", undefined, autoLabel); autoContinue.type = "checkbox";
  node("span", "Continue automatically after the time limit", autoLabel);
  const applySession = node("button", "Apply", sessionForm, "button secondary-button"); applySession.type = "submit";
  const sessionSettingsStatus = node("p", "", sessionSettings, "native-command-status"); sessionSettingsStatus.setAttribute("role", "status");
  const commandStatus = node("p", "", stage, "native-command-status"); commandStatus.setAttribute("role", "status");
  const summary = node("p", "", viewOptions, "native-summary");
  const videoStatus = node("p", "", viewOptions, "native-source"); videoStatus.hidden = true;
  const observationPanel = node("details", undefined, stage, "native-observation-panel"); observationPanel.hidden = true;
  node("summary", "Observation map", observationPanel);
  const observationContainer = node("div", undefined, observationPanel);
  const inspector = node("aside", undefined, body, "native-inspector"); inspector.id = "native-person-inspector"; inspector.setAttribute("aria-label", "People inspector");
  const inspectorTitlebar = node("div", undefined, inspector, "native-inspector-titlebar");
  const personTitle = node("h3", "Inspect person", inspectorTitlebar, "native-person-title");
  const inspectorClose = node("button", "\u00d7", inspectorTitlebar, "native-inspector-close"); inspectorClose.type = "button"; inspectorClose.setAttribute("aria-label", "Hide person details");
  const personHeading = node("div", undefined, inspector, "native-person-heading");
  const filter = node("input", undefined, personHeading); filter.type = "search"; filter.placeholder = "Find a person"; filter.setAttribute("aria-label", "Find a person");
  const people = node("select", undefined, personHeading); people.setAttribute("aria-label", "Inspect person");
  const personControls = node("div", undefined, personHeading, "native-person-controls");
  const focus = button("Show in world", "focus", () => ({ personId: selected }), personControls);
  const panelOpen = button("Open game panel", "panel", () => ({ personId: selected, panelId: current?.view.panels?.[0]?.id, visible: true }), personControls);
  const panelClose = button("Close game panel", "panel", () => ({ personId: selected, panelId: current?.view.panels?.[0]?.id, visible: false }), personControls);
  const inspectionAge = node("p", "Waiting for person information.", personHeading, "native-inspection-age");
  const details = node("div", undefined, inspector, "native-person-detail");
  const personBody = node("div", undefined, details);
  const cognition = node("details", undefined, details, "native-detail-section native-cognition");
  cognition.open = true; cognition.hidden = true; cognition.dataset.section = "cognition";
  node("summary", "Competing cognition", cognition);
  const cognitionAvailability = node("p", "", cognition, "native-source");
  const cognitionControls = node("details", undefined, cognition, "native-cognition-settings");
  node("summary", "Simulation discovery pace", cognitionControls);
  const appliedSettings = node("p", "", cognitionControls, "native-source");
  const settingsForm = node("form", undefined, cognitionControls, "native-cognition-form");
  const settingsInputs = {};
  for (const [key, label, low, high, step] of [["opponentShare", "Associative share", 0, 1, "any"], ["opportunitiesPerHour", "Opportunities / world hour", 1, 60, 1], ["maxDepth", "Association depth", 1, 4, 1]]) {
    const field = node("label", label, settingsForm);
    const input = node("input", undefined, field); input.type = "number"; input.name = key;
    input.min = low; input.max = high; input.step = step; input.required = true;
    input.setAttribute("aria-label", label); settingsInputs[key] = input;
  }
  const applyCognition = node("button", "Apply", settingsForm, "button secondary-button"); applyCognition.type = "submit";
  const settingsDraft = node("p", "", cognitionControls, "native-source");
  const settingsStatus = node("p", "", cognitionControls, "native-command-status"); settingsStatus.setAttribute("role", "status");
  const cognitionBody = node("div", undefined, cognition);
  let inspectorVisible = readPreference("inspector", false) === true;
  function setInspectorVisible(visible) {
    inspectorVisible = visible; inspector.hidden = !visible; body.classList.toggle("native-inspector-hidden", !visible);
    inspectorToggle.textContent = visible ? "Hide details" : "Show details";
    inspectorToggle.setAttribute("aria-expanded", String(visible)); writePreference("inspector", visible);
  }
  inspectorToggle.addEventListener("click", () => setInspectorVisible(!inspectorVisible));
  inspectorClose.addEventListener("click", () => setInspectorVisible(false));
  setInspectorVisible(inspectorVisible);
  function inspectPerson(id) {
    if (!current?.view.people.some(person => person.id === id)) return;
    selected = id; explicitPerson = true; filter.value = "";
    selectPeople(); renderPerson(); renderCognition(); setInspectorVisible(true);
    void send("select", { personId: id });
    personTitle.tabIndex = -1; personTitle.focus({ preventScroll: true });
    inspector.scrollIntoView({ block: "nearest" });
    window.focus();
  }
  let active = false, requestedId = null, sessionId = null, current = null, selected = null, explicitPerson = false;
  let explicitSession = false;
  let timer, controller, generation = 0, imageKey = "", personSignature = "", peopleSignature = "";
  let waiting = null, posting = false, lastResult = null, rateStarted = performance.now();
  const imageDeliveries = createNativeImageDeliveryCounter();
  let feedError = null, postController = null;
  let cognitionSignature = "", settingsDirty = false, cognitionRequest = null;
  let sessionDirty = false, sessionRequest = null;
  let registeredViews = [], registryCheckedAt = 0;
  const feedCards = new Map(), hiddenScreens = new Set(), mutedScreens = new Set();
  const cameraInputs = new Map();
  const browseStates = new Map();
  let videoPlayer = null, observationMap = null, pendingObservation = null, videoSnapshot = null, primaryVideoFrame = null, primaryVideoSite = null;
  let primaryPngView = null, primaryPending = null;
  let screenSignature = "", cameraSite = null;
  const feedWindows = createNativeFeedWindows({
    requestTime(action, values) { return send(action, values); },
    returned(card) {
      cameraInputs.get(card.querySelector(".native-panel-media, .native-viewport"))?.();
      panelGrid.append(card);
    },
    changed() {
      queueMicrotask(() => {
        if (active && current) { renderFeeds(current); freshness(); }
        if (!feedWindows.size && root.hidden) close(true);
      });
    },
    failed(message) { commandStatus.textContent = message; },
  });

  function currentCameraFeed() {
    const feeds = current?.view.feeds || [];
    return feeds.find(feed => feed.siteId && feed.siteId === cameraSite);
  }

  function cameraValues(action, values) {
    if (!["pan", "zoom", "focus", "auto"].includes(action) || values.siteId) return values;
    const feed = currentCameraFeed();
    return feed ? { ...values, siteId: feed.siteId } : values;
  }

  function cameraViewport(values = {}) {
    const target = values.siteId ? current?.view.feeds?.find(feed => feed.siteId === values.siteId)
      : currentCameraFeed() || current?.view;
    return target?.cameraControls?.viewport || target?.viewport;
  }

  function sourceCaptureTime(view) {
    const videoCapture = view?.video?.state === "running" ? view.video.segments.at(-1)?.endCapturedAtUnixMs : 0;
    return Math.max(view?.capturedAtUnixMs || 0, videoCapture || 0);
  }
  function browseOnly() {
    const view = current?.view;
    return Boolean(view && (view.state === "ended" || feedError || current.connection === "disconnected"
      || (view.state !== "paused" && Date.now() - sourceCaptureTime(view) >= 30000)));
  }
  function browseState(media) {
    if (!browseStates.has(media)) browseStates.set(media, { zoom: 1, x: 0, y: 0, local: false });
    return browseStates.get(media);
  }
  function applyBrowse(media) {
    const value = browseState(media), limit = (value.zoom - 1) * 50;
    value.x = Math.max(-limit, Math.min(limit, value.x)); value.y = Math.max(-limit, Math.min(limit, value.y));
    media.style.setProperty("--native-browse-zoom", value.zoom);
    media.style.setProperty("--native-browse-x", `${value.x}%`); media.style.setProperty("--native-browse-y", `${value.y}%`);
  }
  function resetBrowse(media) { browseStates.set(media, { zoom: 1, x: 0, y: 0, local: false }); applyBrowse(media); }
  function moveCamera(action, values = {}, media = viewport) {
    if (!browseOnly()) { void send(action, values); return; }
    const visual = media.querySelector("img, canvas");
    if (!visual || !(visual.naturalWidth || media.querySelector("canvas:not([hidden])")?.width)) return;
    const value = browseState(media); value.local = true;
    if (action === "zoom") value.zoom = Math.max(1, Math.min(8, value.zoom * (values.value === 1 ? 1 / 1.25 : 1.25)));
    else if (action === "pan") {
      value.zoom = Math.max(1.25, value.zoom);
      value.x -= (values.dx - values.dy) * 1.5; value.y -= (values.dx + values.dy) * 1.5;
    } else return;
    applyBrowse(media); freshness();
  }
  function cameraEpoch(value) { return `${value.observerSequence}:${value.capturedAtUnixMs}`; }
  function rememberCamera(value, feed) {
    if (!feed?.videoCamera) return;
    value.videoCameras ||= new Map(); value.videoCameras.set(cameraEpoch(feed.videoCamera), {
      camera: structuredClone(feed.videoCamera.camera), names: feed.videoCamera.camera.personIds.map(id => videoSnapshot?.view.people.find(person => person.id === id)?.label).filter(Boolean),
    });
    while (value.videoCameras.size > 8) value.videoCameras.delete(value.videoCameras.keys().next().value);
  }
  function videoCamera(value, frame) {
    if (frame?.alignment !== "verified" || frame.site?.id !== value.siteId) return null;
    return value.videoCameras?.get(`${frame.observerSequence}:${frame.endCapturedAtUnixMs}`) || null;
  }
  function clearObservation() {
    pendingObservation = null; observationMap?.destroy(); observationMap = null; observationPanel.hidden = true;
  }
  function renderObservation() {
    if (!active || !observationPanel.open || !pendingObservation) return;
    observationMap ||= createNativeObservationMap(observationContainer, { selectPerson(id) {
      if (!current?.view.people.some(person => person.id === id)) return;
      selected = id; explicitPerson = true; filter.value = ""; selectPeople(); renderPerson(); renderCognition(); setInspectorVisible(true);
    } });
    observationMap.update(pendingObservation);
  }
  function updateObservation(next) {
    pendingObservation = next.view.observationGraph || null;
    observationPanel.hidden = !pendingObservation;
    if (pendingObservation) renderObservation();
    else clearObservation();
  }
  function presentPrimaryVideo(frame) {
    const previous = primaryVideoFrame;
    primaryVideoFrame = frame.ready ? frame : null;
    primaryCanvas.hidden = !frame.ready; picture.hidden = frame.ready || !picture.getAttribute("src");
    viewport.dataset.videoSequence = frame.ready ? String(frame.sequence) : "";
    viewport.dataset.videoAlignment = frame.ready ? frame.alignment : "unknown";
    if (frame.ready) { frameGeometry(viewport, primaryCanvas); empty.hidden = true; primaryOverlay.hidden = true; }
    else if (picture.naturalWidth) { frameGeometry(viewport, picture); empty.hidden = true; }
    else empty.hidden = false;
    renderPrimaryFrame();
    if (Boolean(previous) !== Boolean(frame.ready) || previous?.alignment !== frame.alignment || previous?.site?.zoom !== frame.site?.zoom) freshness();
    else { refreshFeedAges(); refreshFeedWindows(); }
  }
  function sourceRuntime(next) {
    if (videoSnapshot?.view.video?.streamId !== next.view.video?.streamId) for (const value of feedCards.values()) value.videoCameras?.clear();
    videoSnapshot = next; updateObservation(next);
    for (const value of feedCards.values()) rememberCamera(value, next.view.feeds?.find(feed => feed.siteId === value.siteId));
    if (!next.view.video) { videoPlayer?.update(next); return; }
    videoPlayer ||= createNativeVideoPlayer({ onStatus(facts) {
      videoStatus.hidden = false;
      videoStatus.textContent = facts.ready ? "Continuous video" : facts.message || "Waiting for continuous video.";
    } });
    const primaryCrops = !next.view.feeds?.length ? next.view.video.segments.map(segment => Object.hasOwn(segment, "crops") ? segment.crops : segment.sites)
      .findLast(crops => Array.isArray(crops) && crops.length === 1) : null;
    const primarySite = primaryCrops?.[0].id || null;
    if (primarySite && primaryVideoSite !== primarySite) {
      primaryVideoSite = primarySite;
      videoPlayer.registerSurface("current", { canvas: primaryCanvas, siteId: primarySite, onPresent: presentPrimaryVideo });
    } else if (!primarySite && primaryVideoSite) {
      presentPrimaryVideo({ ready: false, alignment: "unknown" });
      videoPlayer.unregisterSurface("current"); primaryVideoSite = null;
    }
    for (const value of feedCards.values()) {
      if (!value.videoRegistered && value.siteId) {
        value.videoRegistered = true;
        videoPlayer.registerSurface(value.screenKey, { canvas: value.canvas, siteId: value.siteId, onPresent(frame) {
          value.videoFrame = frame.ready ? frame : null; value.canvas.hidden = !frame.ready; value.image.hidden = frame.ready;
          value.media.dataset.videoSequence = frame.ready ? String(frame.sequence) : "";
          value.media.dataset.videoAlignment = frame.ready ? frame.alignment : "unknown";
          if (frame.ready) frameGeometry(value.media, value.canvas); else if (value.image.naturalWidth) frameGeometry(value.media, value.image);
          renderFeedFrame(value); refreshFeedAges(); refreshFeedWindows();
        } });
      }
    }
    videoPlayer.update(next);
  }

  function refreshCameraContext() {
    const view = current?.view, feed = currentCameraFeed(), observed = feed?.camera || view?.camera;
    const names = (observed?.personIds || []).map(id => view.people.find(person => person.id === id)?.label).filter(Boolean);
    const unassigned = observed?.mode === "automatic" && !observed.personIds.length;
    cameraSubject.textContent = (feed ? `${feed.label} · ` : "") + (!observed ? "Camera state unavailable" : observed.mode === "automatic"
      ? (unassigned ? observed.summary : `Camera follows ${names.join(", ") || feed?.label || "the reported subject"}`)
      : `Camera: manual${names.length ? ` · ${names.join(", ")}` : ""}`);
    cameraSummary.textContent = unassigned ? "" : observed?.summary || "";
  }

  function removeFeedCard(value) {
    videoPlayer?.unregisterSurface(value.screenKey);
    feedWindows.release(value.screenKey, false);
    cameraInputs.get(value.media)?.(); cameraInputs.delete(value.media); browseStates.delete(value.media); value.card.remove();
  }

  function toggleScreenWindow(key) {
    if (feedWindows.has(key)) { feedWindows.release(key); return; }
    if (!current) return;
    if (key.startsWith("site:")) cameraSite = key.slice(5);
    const value = key === "current" ? primaryToolsState : [...feedCards.values()].find(value => value.screenKey === key);
    if (!value) return;
    cameraInputs.get(value.media || viewport)?.();
    feedWindows.open(key, { card: value.card, viewId: sessionId, bindingId: current.binding.bindingId,
      label: key === "current" ? primaryLabel.textContent : value.label.textContent });
    freshness();
  }

  function toggleScreenInfo(key) {
    if (mutedScreens.has(key)) mutedScreens.delete(key); else mutedScreens.add(key);
    if (current) renderFeeds(current);
  }

  function hideScreen(key) {
    feedWindows.release(key);
    hiddenScreens.add(key);
    if (current) renderFeeds(current);
  }

  function updatePanelTools(value, key) {
    const detached = feedWindows.has(key);
    toolIcon(value.windowButton, detached ? "Minimize" : "Maximize", detached ? "Redock" : "Window");
    value.windowButton.title = detached ? "Return this view to the main window" : "Open this view in a resizable window";
    value.info.setAttribute("aria-pressed", String(!mutedScreens.has(key)));
    value.info.title = mutedScreens.has(key) ? "Show this screen's information" : "Hide this screen's information";
    value.hide.title = "Hide this screen";
  }

  const primaryToolsState = { card: primaryPanel, windowButton: primaryWindow, info: primaryInfo, hide: primaryHide };
  primaryWindow.addEventListener("click", () => toggleScreenWindow("current"));
  primaryInfo.addEventListener("click", () => toggleScreenInfo("current"));
  primaryHide.addEventListener("click", () => hideScreen("current"));

  const modelLabel = id => id === "ordinary" ? "Ordinary" : id === "associative" ? "Associative" : id;
  const percent = value => `${Math.round(value * 1000) / 10}%`;
  function settingsValues() { return Object.fromEntries(Object.entries(settingsInputs).map(([key, input]) => [key, Number(input.value)])); }
  function sameSettings(left, right) { return left && right && Object.keys(settingsInputs).every(key => left[key] === right[key]); }
  function settingsValid() {
    const values = settingsValues();
    return Object.values(settingsInputs).every(input => input.value.trim() !== "" && input.validity.valid)
      && Number.isFinite(values.opponentShare) && values.opponentShare >= 0 && values.opponentShare <= 1
      && Number.isInteger(values.opportunitiesPerHour) && Number.isInteger(values.maxDepth);
  }
  settingsForm.addEventListener("input", () => { settingsDirty = true; updateSettings(); freshness(); });
  settingsForm.addEventListener("submit", event => {
    event.preventDefault();
    if (!settingsValid() || applyCognition.disabled) return;
    void send("cognition", settingsValues());
  });

  function sessionValues() {
    return { attemptDurationSeconds: Math.round(Number(durationMinutes.value) * 60), autoContinue: autoContinue.checked };
  }
  function sessionSettingsValid() {
    const value = sessionValues().attemptDurationSeconds;
    return durationMinutes.value.trim() !== "" && durationMinutes.validity.valid
      && Number.isSafeInteger(value) && value >= 30 && value <= 604800;
  }
  sessionForm.addEventListener("input", () => { sessionDirty = true; freshness(); });
  sessionForm.addEventListener("submit", event => {
    event.preventDefault();
    if (!sessionSettingsValid() || applySession.disabled) return;
    sessionRequest = { status: "sending", values: sessionValues() };
    sessionSettingsStatus.textContent = "Sending session settings.";
    void send("configure", sessionRequest.values);
  });

  function updateSession() {
    const value = current?.view.study;
    sessionBar.hidden = !value; endRun.hidden = Boolean(value);
    if (!value) return;
    sessionFacts.textContent = nativeSessionFacts(current.view);
    const reviewLabels = {
      pending: "Preparing completed outcomes for human review",
      queued: "Human review is waiting",
      "already-queued": "Human review is waiting",
      "no-reviewable-outcomes": "No completed model disagreements need review",
      delayed: "Review handoff is delayed",
      "not-eligible": "This attempt did not produce verified review evidence",
    };
    sessionReview.hidden = !value.reviewStatus;
    sessionReview.dataset.state = value.reviewStatus || "";
    const reviewLabel = reviewLabels[value.reviewStatus] || "Review status unavailable";
    const reviewMessage = value.reviewMessage?.trim() || "";
    const detailedReview = ["queued", "already-queued", "delayed", "not-eligible"].includes(value.reviewStatus);
    sessionReview.textContent = value.reviewStatus ? (detailedReview && reviewMessage ? reviewMessage : reviewLabel) : "";
    checkpoint.hidden = !value.canCheckpoint; continueSession.hidden = !value.canContinue;
    if (!sessionDirty && !sessionForm.contains(document.activeElement)) {
      durationMinutes.value = String(value.attemptDurationSeconds / 60);
      autoContinue.checked = value.autoContinue;
    }
    if (sessionRequest?.sequence && current.view.commandResult?.sequence === sessionRequest.sequence) {
      sessionRequest.status = current.view.commandResult.status;
      sessionSettingsStatus.textContent = `${sessionRequest.status === "applied" ? "Applied" : "Rejected"}: ${current.view.commandResult.message}`;
      if (sessionRequest.status === "applied") sessionDirty = false;
    }
  }

  function updateSettings() {
    const source = current?.view.people.find(person => person.id === selected)?.cognition?.settings;
    cognitionControls.hidden = !source;
    if (!source) return;
    appliedSettings.textContent = `Source settings: ${source.enabled ? "active" : "disabled"} · ${percent(source.opponentShare)} associative selection · ${source.opportunitiesPerHour} opportunities / world hour · depth ${source.maxDepth}`;
    if (!settingsDirty && !settingsForm.contains(document.activeElement)) {
      for (const [key, input] of Object.entries(settingsInputs)) input.value = source[key];
    }
    settingsDraft.textContent = settingsDirty ? "Draft values; the source settings above remain in effect until the simulation applies a request." : "";
    if (!cognitionRequest) return;
    const request = cognitionRequest, result = current.view.commandResult;
    if (request.sequence && result?.sequence === request.sequence) {
      request.status = result.status; request.message = `${result.status === "applied" ? "Applied" : "Rejected"}: ${result.message}`;
    } else if (request.sequence && current.view.lastCommandSequence >= request.sequence && request.status === "pending") {
      request.status = "unknown"; request.message = "Request processed; application outcome was not reported.";
    }
    if (request.status === "applied") {
      const observation = current.view.inspection;
      const observedAfterRequest = observation?.status === "available" && observation.sequence > request.inspectionSequence
        && observation.capturedAtUnixMs >= request.requestedAtUnixMs;
      if (source.enabled === true && observedAfterRequest && sameSettings(source, request.values)) {
        request.message = "Applied and reported by the simulation.";
        if (sameSettings(settingsValues(), request.values)) { settingsDirty = false; settingsDraft.textContent = ""; }
      } else request.message = "Applied acknowledgement received; waiting for the source settings to update.";
    }
    settingsStatus.textContent = request.message;
    settingsStatus.dataset.state = request.status;
  }

  function route(id) { explicitSession = true; location.hash = "#native-view?" + new URLSearchParams({ session: id }); }
  sessions.addEventListener("change", () => route(sessions.value));

  function resetRun() {
    videoPlayer?.destroy(); videoPlayer = null; videoSnapshot = null; primaryVideoFrame = null; primaryVideoSite = null;
    primaryPending = null; primaryPngView = null;
    clearObservation(); videoStatus.hidden = true;
    resetBrowse(viewport);
    current = null; selected = null; explicitPerson = false; waiting = null; lastResult = null;
    peopleSignature = personSignature = cognitionSignature = imageKey = "";
    imageDeliveries.reset(); rateStarted = performance.now(); deliveryRate.textContent = "";
    feedError = null; cognitionRequest = null; settingsDirty = false; sessionRequest = null; sessionDirty = false;
    for (const value of feedCards.values()) removeFeedCard(value);
    feedWindows.closeAll(); feedCards.clear(); hiddenScreens.clear(); mutedScreens.clear(); screenSignature = ""; viewToggles.replaceChildren();
    panelGrid.dataset.focused = "false";
    primaryPanel.hidden = false; primaryLabel.textContent = "Current camera"; primaryAge.textContent = "No frame";
    primaryOverlay.replaceChildren(); primaryOverlay._nativeGroups = new Map(); primaryOverlay._nativeAge = null;
    primaryOverlay.hidden = true; noScreens.hidden = true;
    picture.hidden = true; picture.removeAttribute("src"); empty.hidden = false; empty.textContent = "Waiting for the simulation feed.";
    primaryCanvas.hidden = true;
    personBody.replaceChildren(); cognitionBody.replaceChildren(); cognition.hidden = true;
    commandStatus.textContent = ""; summary.textContent = ""; sessionSettingsStatus.textContent = "";
    sessionBar.hidden = true; endRun.hidden = false;
    cameraSubject.textContent = "Camera state unavailable"; cameraSummary.textContent = "";
    inspectedName.textContent = "No person selected"; personTitle.textContent = "Inspect person";
  }

  async function refreshRegistry(signal, force = false) {
    const now = performance.now();
    if (!force && registryCheckedAt && now - registryCheckedAt < 250) return registeredViews;
    const response = await fetch("/api/native-views", { signal, cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error("Simulation connections are unavailable.");
    registryCheckedAt = now;
    const signature = JSON.stringify(result.views.map(value => [value.id, value.label]));
    if (signature !== JSON.stringify(registeredViews.map(value => [value.id, value.label]))) {
      const chosen = sessionId;
      sessions.replaceChildren();
      for (const value of result.views) { const option = node("option", value.label, sessions); option.value = value.id; }
      sessions.value = chosen || "";
    }
    registeredViews = result.views;
    return registeredViews;
  }

  function autoSelect(id) {
    if (!id || id === sessionId) return;
    sessionId = requestedId = id; sessions.value = id; resetRun();
    if (!root.hidden) history.replaceState(history.state, "", "#native-view?" + new URLSearchParams({ session: id }));
  }

  async function findSuccessor(signal) {
    const currentCapturedAt = current?.view.capturedAtUnixMs || 0;
    const views = await refreshRegistry(signal, true);
    const candidates = await Promise.all(views.filter(value => value.id !== sessionId).map(async value => {
      try {
        const response = await fetch(`/api/native-views/${encodeURIComponent(value.id)}/snapshot`, { signal, cache: "no-store" });
        if (!response.ok) return null;
        return { id: value.id, snapshot: await response.json() };
      } catch (error) {
        if (error.name === "AbortError") throw error;
        return null;
      }
    }));
    return candidates.filter(value => value && value.snapshot.view.state !== "ended" && value.snapshot.connection === "live"
      && value.snapshot.view.capturedAtUnixMs > currentCapturedAt)
      .sort((left, right) => right.snapshot.view.capturedAtUnixMs - left.snapshot.view.capturedAtUnixMs)[0] || null;
  }
  function selectPeople() {
    if (!current) return;
    const all = current.view.people, search = filter.value.toLocaleLowerCase();
    const matches = all.filter(person => person.id === selected || person.label.toLocaleLowerCase().includes(search));
    const signature = JSON.stringify([selected, matches.map(person => [person.id, person.label])]);
    if (signature === peopleSignature) return;
    peopleSignature = signature; people.replaceChildren();
    if (!matches.length) { const option = node("option", "No people reported", people); option.value = ""; }
    for (const person of matches) { const option = node("option", person.label, people); option.value = person.id; }
    people.value = selected || "";
  }
  filter.addEventListener("input", selectPeople);
  people.addEventListener("change", () => { selected = people.value; explicitPerson = true; renderPerson(); renderCognition(); void send("select", { personId: selected }); });

  function ageText(capturedAtUnixMs) {
    if (current?.view.state === "ended") {
      const offset = Math.max(0, current.view.capturedAtUnixMs - capturedAtUnixMs);
      return offset < 1000 ? "final frame" : `${(offset / 1000).toFixed(1)}s before final`;
    }
    if (current?.connection === "disconnected" || feedError) {
      return `captured ${new Date(capturedAtUnixMs).toLocaleString()}`;
    }
    if (current?.view.state === "paused") return "Paused";
    const age = Math.max(0, Date.now() - capturedAtUnixMs);
    return age < 3000 ? "" : `Delayed frame · ${Math.floor(age / 1000)}s old`;
  }

  function renderOverlay(container, overlay, frameCapturedAtUnixMs, screenKey) {
    const groups = mutedScreens.has(screenKey) ? []
      : (overlay?.groups || []).filter(group => visibleOverlays.has(group.id));
    const lag = overlay ? Math.max(0, frameCapturedAtUnixMs - overlay.capturedAtUnixMs) : 0;
    const existing = container._nativeGroups || new Map(); container._nativeGroups = existing;
    let age = container._nativeAge;
    if (!age) { age = node("small", "", container, "native-overlay-age"); container._nativeAge = age; }
    const active = new Set(); container.dataset.count = String(groups.length);
    for (const group of groups) {
      active.add(group.id); let value = existing.get(group.id);
      if (!value) {
        const section = node("section", undefined, container, "native-overlay-group"); section.dataset.overlay = group.id;
        const label = node("strong", "", section, "native-overlay-label"), rows = node("dl", undefined, section);
        value = { section, label, rows, values: [] }; existing.set(group.id, value);
      }
      value.section.hidden = false;
      value.label.textContent = group.label;
      for (let index = 0; index < group.rows.length; index += 1) {
        const row = group.rows[index]; let item = value.values[index];
        if (!item) {
          const root = node("div", undefined, value.rows, "native-overlay-value");
          item = { root, term: node("dt", "", root), detail: node("dd", "", root) }; value.values[index] = item;
        }
        item.root.title = `${row.label}: ${row.value}`;
        if (item.term.textContent !== row.label) item.term.textContent = row.label;
        if (item.detail.textContent !== row.value) item.detail.textContent = row.value;
      }
      while (value.values.length > group.rows.length) value.values.pop().root.remove();
    }
    for (const [id, value] of existing) if (!active.has(id)) value.section.hidden = true;
    let cursor = container.firstElementChild;
    for (const group of groups) {
      const section = existing.get(group.id).section;
      if (section !== cursor) container.insertBefore(section, cursor || age);
      cursor = section.nextElementSibling;
    }
    age.hidden = groups.length === 0 || lag < 100;
    if (!age.hidden) age.textContent = `State ${(lag / 1000).toFixed(1)}s before frame`;
    container.hidden = groups.length === 0;
  }

  function renderViewToggles(screens) {
    const signature = JSON.stringify(screens.map(screen => screen.key));
    if (signature !== screenSignature) {
      screenSignature = signature; viewToggles.replaceChildren();
      for (const screen of screens) {
        const value = node("button", screen.label, viewToggles, "native-observatory-toggle"); value.type = "button";
        value.dataset.screen = screen.key; value.title = `Show or hide ${screen.label}`;
        value.addEventListener("click", () => {
          if (feedWindows.has(screen.key)) { feedWindows.focus(screen.key); return; }
          if (hiddenScreens.has(screen.key)) hiddenScreens.delete(screen.key); else hiddenScreens.add(screen.key);
          if (current) renderFeeds(current);
        });
      }
    }
    const labels = new Map(screens.map(screen => [screen.key, screen.label]));
    for (const value of viewToggles.querySelectorAll("button")) {
      value.textContent = labels.get(value.dataset.screen) || value.textContent;
      value.title = feedWindows.has(value.dataset.screen) ? `Bring ${value.textContent} window forward` : `Show or hide ${value.textContent}`;
      value.setAttribute("aria-pressed", String(!hiddenScreens.has(value.dataset.screen)));
    }
  }

  function refreshFeedAges() {
    if (current) { primaryAge.textContent = browseState(viewport).local ? "Saved · Browse" : ageText(primaryVideoFrame?.endCapturedAtUnixMs || primaryPngView?.capturedAtUnixMs || current.view.capturedAtUnixMs); primaryAge.hidden = !primaryAge.textContent; }
    for (const value of feedCards.values()) {
      const capturedAt = value.videoFrame?.endCapturedAtUnixMs || value.displayedFeed?.capturedAtUnixMs;
      const age = capturedAt ? ageText(capturedAt) : "Waiting for image";
      value.age.textContent = browseState(value.media).local ? "Saved · Browse" : value.imageError && !value.videoFrame ? [age, "Image unavailable"].filter(Boolean).join(" · ") : age;
      value.age.hidden = !value.age.textContent;
      value.age.title = value.videoFrame ? `${new Date(value.videoFrame.capturedAtUnixMs).toISOString()} – ${new Date(value.videoFrame.endCapturedAtUnixMs).toISOString()}` : capturedAt ? new Date(capturedAt).toISOString() : "";
      renderPersonContext(value.personContext, value.contextPersonIds || []);
    }
    renderPersonContext(primaryContext, primaryVideoFrame ? [] : primaryPngView?.camera?.personIds || []);
  }

  function createPersonContext(card) {
    const section = node("section", undefined, card, "native-feed-context");
    const heading = node("div", undefined, section, "native-feed-context-heading");
    const title = node("strong", "Reported context", heading);
    const age = node("span", "", heading, "native-feed-context-age");
    age.title = "Person information and video are separate source samples; this is not a frame-synchronized explanation.";
    const content = node("div", undefined, section, "native-feed-context-people");
    return { section, title, age, content, signature: "", assignment: false };
  }

  function renderPersonContext(context, personIds) {
    context.title.textContent = context.assignment ? "Assigned person · latest report" : "Reported context";
    const inspection = current?.view.inspection, captured = inspection?.capturedAtUnixMs;
    const elapsed = Number.isFinite(captured) ? Math.max(0, Date.now() - captured) / 1000 : null;
    const archived = current?.view.state === "ended";
    const timing = elapsed === null ? "sample time unknown" : archived ? "saved sample"
      : `${elapsed < 60 ? `${elapsed.toFixed(1)}s` : `${Math.floor(elapsed / 60)}m`} old`;
    const stale = !archived && (elapsed === null || elapsed >= 3 || current?.connection === "disconnected" || Boolean(feedError));
    context.age.textContent = `${timing}${stale ? " · stale" : ""} · separate sample`;
    context.age.dataset.state = stale ? "stale" : archived ? "saved" : "current";
    if (Number.isFinite(captured)) context.age.title = `Person report: ${new Date(captured).toISOString()}. Video uses a separate sample clock.`;
    const ids = [...new Set(personIds)].slice(0, 2);
    const people = ids.map(id => current?.view.people.find(person => person.id === id));
    const signature = JSON.stringify([context.assignment, ids.map((id, index) => [id, people[index]?.label, nativePersonContext(people[index])])]);
    if (context.signature === signature) return;
    context.signature = signature; context.content.replaceChildren();
    if (!ids.length) node("p", context.assignment ? "No person assignment in the latest camera report." : "No confirmed person assignment for this frame.", context.content, "native-feed-context-empty");
    ids.forEach((id, index) => {
      const person = people[index], row = node("div", undefined, context.content, "native-feed-person");
      row.dataset.personId = id;
      if (!person) { node("p", "Assigned person is absent from the current report.", row, "native-feed-context-empty"); return; }
      const text = node("p", nativePersonContext(person), row, "native-feed-reason");
      text.title = `${person.label} · ${text.textContent}`;
      const inspect = node("button", `Inspect ${person.label}`, row, "native-feed-inspect"); inspect.type = "button";
      inspect.setAttribute("aria-label", `Inspect person: ${person.label}`);
      inspect.addEventListener("click", () => inspectPerson(id));
    });
  }

  function renderPrimaryFrame() {
    if (primaryVideoFrame) {
      const assigned = (current?.view.camera?.personIds || []).map(id => current.view.people.find(person => person.id === id)?.label).filter(Boolean).join(", ");
      primaryLabel.textContent = (assigned ? `Assigned: ${assigned}` : "Assigned camera") + (primaryVideoFrame.alignment === "unknown" ? " · pose unknown" : "");
      return;
    }
    const view = primaryPngView || current?.view;
    if (!view) return;
    const feed = view.feeds?.find(value => value.image.file === view.image.file);
    const name = feed?.label || (view.camera?.personIds || []).map(id => view.people.find(person => person.id === id)?.label).filter(Boolean).join(", ") || "Current camera";
    primaryLabel.textContent = name === "Current camera" ? name : `Current: ${name}`;
  }

  function renderFeedFrame(value) {
    let feed = value.displayedFeed, names = value.displayedNames || [];
    if (value.videoFrame) {
      const frame = value.videoFrame, qualified = videoCamera(value, frame), sourceFeed = value.nextFeed || feed;
      names = qualified?.names || [];
      feed = { ...sourceFeed, label: sourceFeed?.label || "Assigned subject", capturedAtUnixMs: frame.endCapturedAtUnixMs,
        camera: qualified?.camera || { mode: "automatic", personIds: [], summary: frame.alignment === "unknown" ? "Assigned · pose unknown" : "Assigned · awaiting camera sample" },
        viewport: frame.site ? { zoom: frame.site.zoom, targetZoom: frame.site.targetZoom } : null,
        overlay: qualified && sourceFeed?.overlay?.capturedAtUnixMs === frame.endCapturedAtUnixMs ? sourceFeed.overlay : null };
    }
    value.label.textContent = feed?.label || "Waiting for image";
    value.label.title = feed?.label || "";
    value.image.alt = feed ? `Native view: ${feed.label}` : "";
    value.media.title = "Drag or arrow keys to browse this view. Use the wheel or + and − to zoom; Follow returns to its subject.";
    value.media.setAttribute("aria-label", `View of ${feed?.label || "the subject"}. Drag or arrow keys browse; wheel or plus and minus zoom; space pauses.`);
    const sameSubject = names.length && feed?.label === names.join(", ");
    value.subject.textContent = !feed ? "" : feed.camera.mode === "automatic"
      ? (!feed.camera.personIds.length ? feed.camera.summary : sameSubject || !names.length ? "" : `Following ${names.join(", ")}`)
      : `Manual camera${names.length && !sameSubject ? ` · ${names.join(", ")}` : ""}`;
    value.subject.hidden = !value.subject.textContent;
    // The latest source explicitly assigns this camera to a person, even when
    // its independent video clock cannot qualify the exact displayed pose.
    // Label that current assignment; do not assert frame-synchronized motives.
    value.personContext.assignment = Boolean(value.videoFrame);
    value.contextPersonIds = (value.videoFrame
      ? value.nextFeed?.videoCamera?.camera || value.nextFeed?.camera
      : feed?.camera)?.personIds || [];
    renderPersonContext(value.personContext, value.contextPersonIds);
    const browse = browseState(value.media);
    value.regionalZoom.hidden = !feed?.viewport && !browseOnly();
    if (browseOnly()) value.regionalZoom.textContent = `${Math.round(browse.zoom * 100)}% saved`;
    else if (feed?.viewport) value.regionalZoom.textContent = `${Math.round(100 / feed.viewport.zoom)}%`;
    toolIcon(value.follow, "LocateFixed", `Follow ${names.join(", ") || feed?.label || "subject"}`);
    value.follow.title = `Follow ${names.join(", ") || feed?.label || "subject"}. Drag or arrow keys browse this view; wheel zooms.`;
    renderOverlay(value.overlay, feed?.overlay, feed?.capturedAtUnixMs, value.screenKey);
  }

  function renderFeeds(next) {
    const urls = new Map((next.feedImages || []).map(value => [value.id, value.imageUrl]));
    const reported = next.view.feeds || [];
    const primaryFeed = reported.find(value => value.image.file === next.view.image.file);
    const cameraNames = (next.view.camera?.personIds || []).map(id => next.view.people.find(person => person.id === id)?.label).filter(Boolean);
    const primaryName = primaryFeed?.label || cameraNames.join(", ") || "Current camera";
    const primaryDisplay = primaryName === "Current camera" ? primaryName : `Current: ${primaryName}`;
    const feeds = reported.filter(value => urls.has(value.id));
    if (cameraSite && !feeds.some(feed => feed.siteId === cameraSite)) cameraSite = null;
    if (!cameraSite) cameraSite = feeds.find(feed => feed.siteId)?.siteId || null;
    const slots = feeds.map(feed => ({ feed, id: feed.siteId ? `site:${feed.siteId}` : `feed:${feed.id}`, key: feed.siteId ? `site:${feed.siteId}` : `feed:${feed.id}` }));
    // Regional cameras retain their places even when the producer reports the
    // newest image first. Historical feeds keep the producer's sequence.
    const positions = new Map([...feedCards.keys()].map((key, index) => [key, index]));
    const regions = slots.filter(slot => slot.feed.siteId).sort((a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity));
    let regionIndex = 0;
    for (let index = 0; index < slots.length; index += 1) if (slots[index].feed.siteId) slots[index] = regions[regionIndex++];
    const screens = slots.length
      ? slots.map(({ feed, key }) => ({ key, label: feed.label }))
      : [{ key: "current", label: primaryDisplay }];
    feedWindows.reconcile(next.binding.bindingId, new Set(screens.map(screen => screen.key)));
    renderViewToggles(screens);

    primaryLabel.textContent = primaryDisplay; renderPrimaryFrame();
    primaryPanel.hidden = feeds.length > 0 || hiddenScreens.has("current");
    renderOverlay(primaryOverlay, primaryFeed?.overlay, next.view.capturedAtUnixMs, "current");
    updatePanelTools(primaryToolsState, "current");

    const activeIds = new Set(slots.map(value => value.id));
    for (const [id, value] of feedCards) if (!activeIds.has(id)) { removeFeedCard(value); feedCards.delete(id); }
    let previousCard = primaryPanel;
    for (let index = 0; index < slots.length; index += 1) {
      const { feed, id, key: screenKey } = slots[index];
      let value = feedCards.get(id);
      if (!value) {
        const card = node("article", undefined, panelGrid, "native-observatory-panel native-feed-card");
        card.dataset.feedSlot = String(index);
        const media = node("div", undefined, card, "native-panel-media");
        const image = node("img", undefined, media); image.alt = ""; image.decoding = "async"; image.draggable = false;
        const canvas = node("canvas", undefined, media, "native-video-surface"); canvas.hidden = true;
        const overlay = node("div", undefined, media, "native-panel-telemetry"); overlay.hidden = true;
        const caption = node("div", undefined, card, "native-panel-caption");
        const meta = node("div", undefined, caption, "native-panel-meta");
        const label = node("strong", "", meta), subject = node("span", "", meta, "native-feed-subject"), age = node("span", "", meta, "native-feed-age");
        const personContext = createPersonContext(card);
        const { info, windowButton, follow, hide, options } = panelTools(caption);
        const cameraTools = node("div", undefined, options, "native-controls native-camera-controls");
        const cameraButtons = [follow]; follow.dataset.cameraAction = "auto";
        follow.addEventListener("click", () => { cameraSite = value.siteId; void send("auto", { siteId: value.siteId }); });
        const cameraButton = (label, action, values = {}, parent = cameraTools) => {
          const control = node("button", label, parent, "button secondary-button"); control.type = "button";
          control.dataset.cameraAction = action;
          control.addEventListener("click", () => { cameraSite = value.siteId; moveCamera(action, { ...values, ...(value.siteId ? { siteId: value.siteId } : {}) }, value.media); });
          cameraButtons.push(control); return control;
        };
        const regionalOut = cameraButton("−", "zoom", { value: 1 }); regionalOut.setAttribute("aria-label", "Zoom this view out");
        const regionalZoom = node("span", "", cameraTools);
        const regionalIn = cameraButton("+", "zoom", { value: -1 }); regionalIn.setAttribute("aria-label", "Zoom this view in");
        const directions = node("div", undefined, cameraTools, "native-pan");
        for (const [label, dx, dy, direction] of [["←", -8, 8, "left"], ["↑", -8, -8, "up"], ["↓", 8, 8, "down"], ["→", 8, -8, "right"]]) {
          const control = cameraButton(label, "pan", { dx, dy }, directions); control.dataset.direction = direction; control.setAttribute("aria-label", `Move this view ${label}`);
        }
        const fit = node("button", "⌾", directions, "button secondary-button"); fit.type = "button"; fit.dataset.direction = "center";
        fit.setAttribute("aria-label", "Fit saved view"); fit.title = "Reset saved image pan and zoom"; fit.hidden = true;
        fit.addEventListener("click", () => { resetBrowse(value.media); renderFeedFrame(value); freshness(); });
        value = { card, media, image, canvas, overlay, label, subject, age, personContext, info, windowButton, follow, hide, fit, screenKey,
          cameraTools, cameraButtons, regionalOut, regionalIn, regionalZoom,
          key: "" }; feedCards.set(id, value);
        info.addEventListener("click", () => toggleScreenInfo(value.screenKey));
        windowButton.addEventListener("click", () => toggleScreenWindow(value.screenKey));
        hide.addEventListener("click", () => hideScreen(value.screenKey));
        bindCameraInput(media, () => value.siteId);
      }
      value.screenKey = screenKey;
      value.siteId = feed.siteId || null;
      value.cameraTools.hidden = !feed.siteId && !browseOnly();
      value.follow.hidden = !feed.siteId;
      value.card.dataset.siteId = feed.siteId || "";
      value.card.hidden = hiddenScreens.has(screenKey);
      updatePanelTools(value, screenKey);
      const key = `${feed.image.file}:${feed.image.sha256}`;
      value.nextFeed = feed;
      value.nextNames = feed.camera.personIds.map(id => next.view.people.find(person => person.id === id)?.label).filter(Boolean);
      if (key === value.key) {
        value.pendingKey = ""; value.imageError = false; value.displayedFeed = feed; value.displayedNames = value.nextNames;
      }
      else if (key !== value.pendingKey && !value.videoFrame) {
        value.pendingKey = key;
        const sourceFeed = feed, sourceNames = [...value.nextNames];
        const candidate = new Image(); candidate.decoding = "async"; candidate.src = urls.get(feed.id);
        candidate.decode().then(() => {
          if (active && value.pendingKey === key && feedCards.get(id) === value && current?.binding.bindingId === next.binding.bindingId) {
            value.image.src = candidate.src; value.key = key; value.pendingKey = ""; value.imageError = false;
            if (!value.videoFrame) frameGeometry(value.media, candidate);
            value.displayedFeed = sourceFeed;
            value.displayedNames = sourceNames;
            renderFeedFrame(value); refreshFeedAges();
            imageDeliveries.accept(`${next.binding.bindingId}:${key}`);
          }
        }, () => { if (value.pendingKey === key) { value.pendingKey = ""; value.imageError = true; refreshFeedAges(); } });
      }
      renderFeedFrame(value);
      if (!feedWindows.has(screenKey) && value.card.previousSibling !== previousCard) {
        const focused = value.card.contains(value.card.ownerDocument.activeElement) ? value.card.ownerDocument.activeElement : null;
        panelGrid.insertBefore(value.card, previousCard.nextSibling);
        focused?.focus({ preventScroll: true });
      }
      if (!feedWindows.has(screenKey)) previousCard = value.card;
    }
    noScreens.hidden = screens.some(screen => !hiddenScreens.has(screen.key) && !feedWindows.has(screen.key));
    noScreens.textContent = feedWindows.size ? "Selected feeds are open in their own windows." : "Choose a view above to restore the observatory.";
    if (panelGrid.lastChild !== noScreens) panelGrid.append(noScreens);
    refreshFeedAges();
    refreshFeedWindows();
  }

  function refreshFeedWindows() {
    const view = current?.view;
    const disconnected = view?.state !== "ended" && view?.state !== "paused"
      && (Boolean(feedError) || current?.connection === "disconnected" || Date.now() - sourceCaptureTime(view) >= 30000);
    const commandable = Boolean(view && view.state !== "ended" && !feedError && !disconnected && !posting);
    feedWindows.refresh({ opacity: String(Number(infoOpacity.value) / 100), state: connection.textContent,
      connectionState: connection.dataset.state, clock: current?.view.study ? nativeSessionFacts(current.view) : current?.view.summary || "",
      rate: deliveryRate.textContent ? `Shared delivery: ${deliveryRate.textContent}` : "", command: commandStatus.textContent,
      shape: shape.value, framing: framing.value, playback: { state: view?.state, commandable } });
  }

  function renderPerson() {
    const view = current?.view, person = view?.people.find(value => value.id === selected);
    inspectedName.textContent = person?.label || "No person selected";
    personTitle.textContent = person ? `Inspecting ${person.label}` : "Inspect person";
    const signature = JSON.stringify(person ? { ...person, cognition: undefined } : null);
    if (signature === personSignature) return;
    personSignature = signature;
    const open = new Map([...personBody.querySelectorAll("details")].map(value => [value.dataset.section, value.open]));
    const focusedSection = personBody.contains(document.activeElement) ? document.activeElement.closest("details")?.dataset.section : null;
    const scroll = details.scrollTop; personBody.replaceChildren();
    if (!person) { node("p", "No person information has arrived.", personBody); return; }
    const summaryLines = String(person.summary || "").split(/\r?\n/u).map(value => value.trim()).filter(Boolean);
    if (summaryLines.length <= 1) node("p", summaryLines[0] || "No summary reported.", personBody, "native-person-summary");
    else {
      const profile = node("section", undefined, personBody, "native-person-profile");
      const role = summaryLines.shift();
      node("span", role.charAt(0).toLocaleUpperCase() + role.slice(1), profile, "native-person-role");
      const synopsis = node("dl", undefined, personBody, "native-fact-grid native-person-synopsis");
      for (const line of summaryLines) {
        const colon = line.indexOf(":");
        let label = colon > 0 ? line.slice(0, colon) : "Status", value = colon > 0 ? line.slice(colon + 1).trim() : line;
        for (const [prefix, name] of [["Position from ", "Position source"], ["Recorded ", "Recorded"], ["Location ", "Location"]]) {
          if (colon < 0 && line.startsWith(prefix)) { label = name; value = line.slice(prefix.length); break; }
        }
        const fact = node("div", undefined, synopsis, "native-fact");
        node("dt", label, fact); node("dd", value, fact);
      }
    }
    for (const section of person.sections || []) {
      const group = node("details", undefined, personBody, "native-detail-section"); group.dataset.section = section.id;
      group.open = open.get(section.id) ?? true;
      const heading = node("summary", undefined, group);
      node("span", section.label, heading, "native-detail-title");
      const sectionMeta = node("span", undefined, heading, "native-detail-meta");
      if (section.perspective) node("span", section.perspective, sectionMeta, "native-meta-chip");
      if (section.status !== "available") node("span", section.status, sectionMeta, "native-meta-chip native-meta-warning");
      if (section.message) node("p", section.message, group, "native-source");
      const rows = node("dl", undefined, group, "native-fact-grid");
      for (const row of section.rows) {
        const fact = node("div", undefined, rows, "native-fact");
        node("dt", row.label, fact); node("dd", row.value, fact);
      }
      node("small", section.source, group, "native-provenance");
    }
    const events = node("details", undefined, personBody, "native-detail-section"); events.dataset.section = "events"; events.open = open.get("events") ?? true;
    node("summary", "Recent activity and dialogue", events);
    if (!person.events?.length) node("p", "No recorded events in this observation.", events, "native-source");
    for (const event of [...person.events || []].reverse()) {
      const row = node("article", undefined, events, "native-event");
      const eventHead = node("header", undefined, row);
      node("strong", event.stage, eventHead); node("time", `Hour ${event.worldHours.toFixed(3)}`, eventHead);
      node("p", event.summary, row); node("small", event.source, row);
    }
    details.scrollTop = scroll;
    if (focusedSection) personBody.querySelector(`details[data-section="${CSS.escape(focusedSection)}"] > summary`)?.focus({ preventScroll: true });
  }

  function renderCognition() {
    const person = current?.view.people.find(value => value.id === selected), value = person?.cognition;
    cognition.hidden = !person;
    updateSettings();
    const signature = JSON.stringify([person?.id, value || null]);
    if (signature === cognitionSignature) return;
    cognitionSignature = signature;
    const open = new Map([...cognitionBody.querySelectorAll("details")].map(group => [group.dataset.section, group.open]));
    const focused = cognitionBody.contains(document.activeElement) ? document.activeElement.closest("details")?.dataset.section : null;
    const scroll = details.scrollTop; cognitionBody.replaceChildren();
    cognitionAvailability.textContent = value
      ? `Private evidence for ${person.label}. ${value.omittedEpisodes} episodes and ${value.omittedExperiences} experiences outside this projection.${value.rejectedExperiences ? ` ${value.rejectedExperiences} experiences rejected by the source.` : ""}`
      : "Cognition information is unavailable for this person.";
    if (!value) return;
    function group(parent, id, label, expanded = false) {
      const result = node("details", undefined, parent, "native-cognition-group");
      result.dataset.section = id; result.open = open.get(id) ?? expanded;
      node("summary", label, result); return result;
    }
    const episodes = group(cognitionBody, "cognition-episodes", "Decisions and outcomes");
    if (!value.episodes.length) node("p", "No decision episodes have been reported.", episodes, "native-source");
    for (const [index, episode] of [...value.episodes].reverse().entries()) {
      const event = group(episodes, `episode:${episode.id}`, `Hour ${episode.worldHours.toFixed(3)} · ${episode.disagreement ? "disagreement" : "same proposed goal"} · ${episode.status}`, index === 0);
      node("p", `Selected ${modelLabel(episode.selectedModelId)} · ${episode.selectedActionId} · allocation weight ${percent(episode.selectionWeight)}`, event, "native-source");
      node("p", `Execution: ${episode.executionStatus || "not reported"}`, event, "native-source");
      if (episode.reason) node("p", episode.reason, event);
      const comparison = node("div", undefined, event, "native-cognition-comparison");
      for (const proposal of episode.proposals) {
        const card = node("article", undefined, comparison, "native-cognition-model"); card.dataset.model = proposal.modelId;
        node("h5", `${modelLabel(proposal.modelId)}${proposal.modelId === episode.selectedModelId ? " · selected" : ""}`, card);
        node("p", `Proposed ${proposal.actionId} · confidence ${percent(proposal.confidence)} · version ${proposal.version}`, card, "native-source");
        node("p", proposal.interpretation, card);
        const prediction = proposal.predictions[episode.selectedActionId];
        node("strong", `Prediction for ${episode.selectedActionId}: ${percent(prediction.probability)}`, card);
        node("p", prediction.claim, card);
        const result = episode.outcome;
        if (episode.status === "censored") node("p", "Censored: this episode supplies no success or failure label.", card, "native-source");
        else if (typeof result?.success === "boolean") {
          node("p", `${result.success ? "Qualified outcome observed" : "Measured no effect"}${result.predictions?.[proposal.modelId] ? ` · squared error ${result.predictions[proposal.modelId].squaredError.toFixed(3)}` : " · score not reported"}`, card, "native-source");
        } else node("p", "Outcome unknown; no success or failure label reported.", card, "native-source");
        if (result?.revisions?.[proposal.modelId]) node("p", `Revision: ${result.revisions[proposal.modelId]}`, card);
        const alternatives = group(card, `alternatives:${episode.id}:${proposal.modelId}`, "Other predictions · unobserved");
        for (const [action, alternate] of Object.entries(proposal.predictions)) {
          if (action === episode.selectedActionId) continue;
          node("p", `${action}: ${percent(alternate.probability)} · ${alternate.claim} · outcome unobserved`, alternatives, "native-source");
        }
      }
      const outcome = episode.outcome;
      node("p", outcome ? `World result: ${outcome.status} · hour ${outcome.worldHours.toFixed(3)}${outcome.detail ? ` · ${outcome.detail}` : ""}` : episode.status === "censored" ? "World result: unavailable; episode censored." : "World result: not yet observed.", event, "native-cognition-outcome");
      const evidence = group(event, `evidence:${episode.id}`, "Evidence and shared input");
      node("p", `Episode ${episode.id} · frame ${episode.frame.id}${outcome ? ` · event ${outcome.eventId}` : ""}`, evidence, "native-source");
      const input = node("dl", undefined, evidence);
      for (const [label, text] of [["Needs", `Hunger ${percent(episode.frame.hunger)} · thirst ${percent(episode.frame.thirst)} · fatigue ${percent(episode.frame.fatigue)}`],
        ["Known sources", `Food ${episode.frame.knownFood} · water ${episode.frame.knownWater} · places ${episode.frame.knownPlaces}`],
        ["Admitted goals", `Food ${episode.frame.foodAllowed} · water ${episode.frame.waterAllowed} · inspect ${episode.frame.inspectionAllowed}`]]) {
        node("dt", label, input); node("dd", text, input);
      }
    }
    const models = group(cognitionBody, "cognition-models", "Beliefs and discovery", true);
    if (!value.models.length) node("p", "No model state has been reported.", models, "native-source");
    for (const model of value.models) {
      const state = group(models, `model:${model.id}`, `${modelLabel(model.id)} · ${model.hypotheses.length} associations`, true);
      const modelMeta = node("div", undefined, state, "native-model-meta");
      const modelVersion = node("span", model.version, modelMeta, "native-meta-chip"); modelVersion.title = "Model version";
      node("span", `${model.beliefs.length} ${model.beliefs.length === 1 ? "belief" : "beliefs"}`, modelMeta, "native-meta-chip");
      if (model.omittedBeliefs) node("span", `${model.omittedBeliefs} beliefs outside view`, modelMeta, "native-meta-chip native-meta-warning");
      if (model.omittedHypotheses) node("span", `${model.omittedHypotheses} associations outside view`, modelMeta, "native-meta-chip native-meta-warning");
      const beliefs = group(state, `beliefs:${model.id}`, "Beliefs");
      for (const belief of model.beliefs) {
        const item = node("article", undefined, beliefs, "native-belief");
        node("p", belief.label, item);
        const meta = node("div", undefined, item, "native-model-meta");
        node("span", belief.status, meta, "native-meta-chip");
        node("span", `${percent(belief.confidence)} confidence`, meta, "native-meta-chip");
      }
      for (const hypothesis of model.hypotheses) {
        const item = group(state, `hypothesis:${model.id}:${hypothesis.id}`, hypothesis.label);
        const meta = node("div", undefined, item, "native-model-meta");
        node("span", hypothesis.branch, meta, "native-meta-chip");
        node("span", `Depth ${hypothesis.depth}`, meta, "native-meta-chip");
        node("span", hypothesis.status, meta, "native-meta-chip");
        node("span", `${percent(hypothesis.confidence)} confidence`, meta, "native-meta-chip");
        node("p", "This association does not establish how to realize it.", item, "native-source");
        if (hypothesis.missing.length) {
          node("strong", "Still unknown", item);
          const missing = node("ul", undefined, item); for (const text of hypothesis.missing) node("li", text, missing);
        } else node("p", "Realization requirements have not been reported.", item, "native-source");
        node("p", `Evidence: ${hypothesis.evidenceIds.join(", ") || "none reported"}`, item, "native-source");
        if (hypothesis.parentIds.length) node("p", `Prior associations: ${hypothesis.parentIds.join(", ")}`, item, "native-source");
      }
    }
    details.scrollTop = scroll;
    if (focused) cognitionBody.querySelector(`details[data-section="${CSS.escape(focused)}"] > summary`)?.focus({ preventScroll: true });
  }

  function freshness() {
    if (!active || !current) return;
    const localBrowse = browseOnly();
    if (!localBrowse) for (const [media, browse] of browseStates) if (browse.local) resetBrowse(media);
    refreshFeedAges();
    const view = current.view, age = Math.max(0, Date.now() - sourceCaptureTime(view));
    refreshCameraContext();
    const disconnected = view.state !== "ended" && view.state !== "paused"
      && (Boolean(feedError) || current.connection === "disconnected" || age >= 30000);
    const commandable = view.state !== "ended" && !feedError && !disconnected;
    for (const value of feedCards.values()) {
      const feed = view.feeds?.find(feed => feed.siteId && feed.siteId === value.siteId);
      const hasFrame = Boolean(value.videoFrame || value.image.naturalWidth);
      for (const control of value.cameraButtons) {
        control.disabled = localBrowse && control.dataset.cameraAction !== "auto" ? !hasFrame : !commandable || posting || !feed;
        if (control.dataset.cameraAction === "auto") control.setAttribute("aria-pressed", String(feed?.camera.mode === "automatic"));
      }
      value.follow.hidden = !feed || localBrowse;
      value.follow.disabled ||= !feed?.camera.personIds.length;
      value.cameraTools.hidden = !feed && !localBrowse;
      value.fit.hidden = !localBrowse; value.fit.disabled = !hasFrame;
      const controlsViewport = feed?.cameraControls?.viewport || feed?.viewport;
      value.regionalOut.hidden = value.regionalIn.hidden = !controlsViewport && !localBrowse;
      if (localBrowse) {
        value.regionalOut.disabled ||= browseState(value.media).zoom <= 1;
        value.regionalIn.disabled ||= browseState(value.media).zoom >= 8;
      } else if (controlsViewport) {
        const { targetZoom, zoomLevels } = controlsViewport;
        value.regionalOut.disabled ||= targetZoom >= zoomLevels.at(-1) - 0.0001;
        value.regionalIn.disabled ||= targetZoom <= zoomLevels[0] + 0.0001;
      }
      renderFeedFrame(value);
    }
    connection.textContent = feedError ? "Feed unavailable" : view.state === "ended"
      ? (view.study?.status === "saved" ? "Session saved" : "Run ended")
      : view.state === "paused" ? "Paused" : disconnected
        ? (view.study ? "Session interrupted" : "Disconnected") : age >= 3000 ? "Delayed frame" : "Running";
    connection.dataset.state = feedError || disconnected ? "stale" : view.state === "ended" ? "ended" : view.state === "paused" ? "paused" : age >= 3000 ? "stale" : "live";
    imageAge.textContent = view.state === "ended" ? "Final frame" : disconnected
      ? `Last frame ${new Date(view.capturedAtUnixMs).toLocaleString()}`
      : view.state === "paused" ? "Paused" : age >= 3000 ? `Delayed frame · ${Math.floor(age / 1000)}s old` : "";
    if (view.state === "ended") deliveryRate.textContent = "Run ended";
    else if (disconnected) deliveryRate.textContent = "No live frames";
    for (const value of controlButtons) value.disabled = !commandable || posting;
    if (localBrowse) for (const control of primaryCameraTools.querySelectorAll("button")) control.disabled = !(picture.naturalWidth || primaryVideoFrame);
    primaryFit.hidden = !localBrowse;
    checkpoint.disabled = posting || !view.study?.canCheckpoint;
    continueSession.disabled = posting || !view.study?.canContinue || view.state !== "ended";
    applySession.disabled = posting || !view.study || !sessionSettingsValid();
    people.disabled = !view.people.length || posting;
    focus.disabled ||= !selected;
    panelOpen.disabled ||= !selected || !view.panels?.length;
    panelClose.disabled ||= !selected || !view.panels?.length;
    applyCognition.disabled = !commandable || posting || !view.people.find(person => person.id === selected)?.cognition
      || !settingsValid() || ["pending", "sending"].includes(cognitionRequest?.status);
    pause.textContent = view.state === "paused" ? "Resume" : "Pause";
    pause.hidden = speeds.hidden = view.state === "ended";
    endRun.hidden = Boolean(view.study) || view.state === "ended";
    panelOpen.hidden = panelClose.hidden = !view.panels?.length;
    primaryFollow.hidden = Boolean(view.feeds?.length) || view.state === "ended";
    const primaryNames = (view.camera?.personIds || []).map(id => view.people.find(person => person.id === id)?.label).filter(Boolean);
    toolIcon(primaryFollow, "LocateFixed", `Follow ${primaryNames.join(", ") || "activity"}`);
    primaryFollow.title = `Follow ${primaryNames.join(", ") || "activity"}. Drag or arrow keys browse; wheel zooms.`;
    primaryFollow.setAttribute("aria-pressed", String(view.camera?.mode === "automatic"));
    primaryFollow.disabled ||= !view.camera?.personIds.length;
    const activeViewport = cameraViewport();
    zoomControls.hidden = !activeViewport && !localBrowse;
    if (localBrowse) {
      zoomLabel.hidden = false; zoomLabel.textContent = `${Math.round(browseState(viewport).zoom * 100)}% saved`;
      zoomOut.disabled ||= browseState(viewport).zoom <= 1; zoomIn.disabled ||= browseState(viewport).zoom >= 8;
    } else if (activeViewport) {
      const { targetZoom, zoomLevels } = activeViewport;
      const regional = currentCameraFeed();
      const acceptedVideo = regional ? [...feedCards.values()].find(value => value.siteId === regional.siteId)?.videoFrame : primaryVideoFrame;
      const pictured = acceptedVideo ? acceptedVideo.site : regional?.viewport || view.viewport;
      zoomLabel.hidden = !pictured;
      if (pictured) {
        zoomLabel.textContent = Math.round(100 / pictured.zoom) + "%";
        zoomLabel.title = "Pictured zoom " + pictured.zoom.toFixed(2);
      }
      zoomOut.disabled ||= targetZoom >= zoomLevels.at(-1) - 0.0001;
      zoomIn.disabled ||= targetZoom <= zoomLevels[0] + 0.0001;
    }
    const inspection = view.inspection;
    if (!inspection?.sequence) inspectionAge.textContent = inspection?.message || "Person information has not been sampled.";
    else {
      const referenceTime = view.state === "ended" || disconnected ? view.capturedAtUnixMs : Date.now();
      const detailAge = Math.max(0, referenceTime - inspection.capturedAtUnixMs) / 1000;
      const timing = view.state === "ended" ? (detailAge < 1 ? "final sample" : detailAge.toFixed(1) + "s before final")
        : disconnected ? (detailAge < 1 ? "last complete sample" : detailAge.toFixed(1) + "s before last frame")
        : detailAge.toFixed(1) + "s old";
      inspectionAge.textContent = "Person information: " + inspection.status
        + (view.state !== "ended" && !disconnected && detailAge >= 3 ? " \u00b7 stale" : "") + " \u00b7 " + timing
        + (inspection.omittedPeople ? " \u00b7 " + inspection.omittedPeople + " people outside this sample" : "")
        + (inspection.omittedEvents ? " \u00b7 " + inspection.omittedEvents + " events omitted" : "");
      if (inspection.status !== "available" && inspection.message) inspectionAge.textContent += " \u00b7 " + inspection.message;
    }
    refreshFeedWindows();
  }

  function update(next) {
    current = next; const view = next.view;
    setFreshnessTimer(view.state !== "ended" && next.connection !== "disconnected");
    title.textContent = next.binding.label || view.title;
    summary.textContent = view.summary;
    refreshCameraContext();
    project.hidden = !next.binding.projectRef;
    project.href = "#projects?" + new URLSearchParams({ project: next.binding.projectRef || "" });
    if (!view.people.some(person => person.id === selected)) { selected = null; explicitPerson = false; }
    if (!explicitPerson) selected = view.camera?.personIds[0] || selected || view.people[0]?.id || null;
    selectPeople(); renderPerson(); renderCognition(); renderFeeds(next); sourceRuntime(next); updateSession(); freshness();
    if (view.commandResult && (!lastResult || view.commandResult.sequence > lastResult.sequence)) {
      lastResult = view.commandResult;
      commandStatus.textContent = `${lastResult.status === "applied" ? "Applied" : "Rejected"}: ${lastResult.message}`;
      commandStatus.dataset.state = lastResult.status;
    }
    if (waiting && view.lastCommandSequence >= waiting) {
      if (view.commandResult?.sequence !== waiting && lastResult?.status !== "rejected") commandStatus.textContent = "Request processed; application outcome was not reported.";
      waiting = null;
    } else if (waiting) commandStatus.textContent = `Request ${waiting} awaiting the simulation.`;
    refreshFeedWindows();
  }

  async function send(action, values = {}) {
    values = cameraValues(action, values);
    const age = current ? Date.now() - sourceCaptureTime(current.view) : Infinity;
    const lifecycle = action === "checkpoint" || action === "continue" || action === "configure";
    if (!active || !current || posting || (feedError && !lifecycle)
      || (current.view.state === "ended" && !lifecycle)
      || (!lifecycle && current.view.state !== "paused" && (current.connection === "disconnected" || age >= 30000))) return;
    if (action === "cognition") {
      if (!settingsValid() || !current.view.people.find(person => person.id === selected)?.cognition || ["pending", "sending"].includes(cognitionRequest?.status)) return;
      cognitionRequest = { values: { ...values }, sequence: null, status: "sending", message: "Sending settings request.",
        inspectionSequence: current.view.inspection?.sequence ?? 0, requestedAtUnixMs: Date.now() };
      updateSettings();
    }
    if (action === "zoom") {
      const activeViewport = cameraViewport(values);
      if (!activeViewport || ![-1, 1].includes(values.value)) return;
      const { targetZoom, zoomLevels } = activeViewport;
      if ((values.value === 1 && targetZoom >= zoomLevels.at(-1) - 0.0001)
        || (values.value === -1 && targetZoom <= zoomLevels[0] + 0.0001)) return;
    }
    if (action === "pause" && current.view.state === "paused") action = "resume";
    const expected = generation, target = current, id = sessionId;
    const requestController = new AbortController(); postController = requestController;
    posting = true; freshness();
    try {
      const response = await fetch(`/api/native-views/${encodeURIComponent(id)}/command`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bindingId: target.binding.bindingId, sessionId: target.view.sessionId, requestId: crypto.randomUUID(), action, ...values }),
        signal: AbortSignal.any([requestController.signal, AbortSignal.timeout(5000)]),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.code || "Request failed");
      if (expected !== generation) return;
      waiting = result.sequence; commandStatus.textContent = `Request ${waiting} awaiting the simulation.`;
      if (action === "cognition") {
        cognitionRequest.sequence = result.sequence; cognitionRequest.status = "pending";
        cognitionRequest.message = `Request ${result.sequence} awaiting the simulation.`; updateSettings();
      }
      if (action === "configure" && sessionRequest) {
        sessionRequest.sequence = result.sequence; sessionRequest.status = "pending";
        sessionSettingsStatus.textContent = `Request ${result.sequence} awaiting the session.`;
      }
    } catch (error) {
      if (expected === generation) commandStatus.textContent = error.name === "TimeoutError" ? "Request outcome unknown. Wait for the simulation's acknowledgement before trying again." : error.message;
      if (expected === generation && action === "cognition") {
        cognitionRequest.status = "unknown"; cognitionRequest.message = commandStatus.textContent; updateSettings();
      }
      if (expected === generation && action === "configure" && sessionRequest) {
        sessionRequest.status = "unknown"; sessionSettingsStatus.textContent = commandStatus.textContent;
      }
    } finally {
      if (postController === requestController) { postController = null; posting = false; freshness(); }
    }
  }

  function bindCameraInput(surface, getSiteId = () => null) {
    // Bind to the actual image surface: regional media are siblings of the
    // primary viewport, which is hidden when simultaneous feeds are present.
    surface.tabIndex = 0;
    surface.setAttribute("aria-label", "Native camera. Arrow keys move; wheel or plus and minus zoom; space pauses.");
    const target = () => { const siteId = getSiteId(); if (siteId) cameraSite = siteId; return siteId ? { siteId } : {}; };
    let lastZoomAt = 0, pointer = null;
    cameraInputs.set(surface, () => {
      const previous = pointer; pointer = null;
      if (previous && surface.hasPointerCapture(previous.id)) surface.releasePointerCapture(previous.id);
    });
    surface.addEventListener("keydown", event => {
      const move = { ArrowLeft: [-8, 8], ArrowRight: [8, -8], ArrowUp: [-8, -8], ArrowDown: [8, 8] }[event.key];
      if (move) { event.preventDefault(); moveCamera("pan", { dx: move[0], dy: move[1], ...target() }, surface); }
      if (event.code === "Space") { event.preventDefault(); void send("pause"); }
      if (["-", "_", "+", "="].includes(event.key) && (browseOnly() || cameraViewport(target()))) {
        event.preventDefault(); moveCamera("zoom", { value: ["-", "_"].includes(event.key) ? 1 : -1, ...target() }, surface);
      }
    });
    surface.addEventListener("wheel", event => {
      const values = target();
      if ((!browseOnly() && !cameraViewport(values)) || !event.deltaY) return;
      event.preventDefault();
      if (performance.now() - lastZoomAt < 150) return;
      lastZoomAt = performance.now(); moveCamera("zoom", { value: event.deltaY > 0 ? 1 : -1, ...values }, surface);
    }, { passive: false });
    surface.addEventListener("pointerdown", event => {
      if (event.button !== 0 || event.target.closest("button, input, select, details")) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, values: target(), local: browseOnly(), browse: { ...browseState(surface) } };
      surface.focus({ preventScroll: true }); surface.setPointerCapture(event.pointerId);
    });
    surface.addEventListener("pointermove", event => {
      if (!pointer || pointer.id !== event.pointerId || !pointer.local) return;
      const box = surface.getBoundingClientRect(), browse = browseState(surface);
      browse.zoom = Math.max(1.25, pointer.browse.zoom); browse.local = true;
      browse.x = pointer.browse.x + (event.clientX - pointer.x) * 100 / box.width;
      browse.y = pointer.browse.y + (event.clientY - pointer.y) * 100 / box.height;
      applyBrowse(surface);
    });
    surface.addEventListener("pointerup", event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const start = pointer; pointer = null;
      if (start.local) { freshness(); return; }
      const dx = Math.max(-8, Math.min(8, Math.round((start.x - event.clientX) / 24)));
      const dy = Math.max(-8, Math.min(8, Math.round((start.y - event.clientY) / 24)));
      if (dx || dy) moveCamera("pan", { dx: Math.max(-8, Math.min(8, dx + dy)), dy: Math.max(-8, Math.min(8, dy - dx)), ...start.values }, surface);
    });
    for (const event of ["pointercancel", "lostpointercapture"]) surface.addEventListener(event, () => { pointer = null; });
  }
  bindCameraInput(viewport);

  async function decodedImage(url, signal) {
    const image = new Image(); image.decoding = "async"; image.src = url;
    try {
      await Promise.race([image.decode(), new Promise((_, reject) => {
        if (signal.aborted) reject(signal.reason);
        else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      })]);
      return image;
    } catch (error) {
      image.src = ""; throw error;
    }
  }

  async function poll(expected) {
    if (!active || expected !== generation) return;
    // Yield after each completed request; source/network/decode readiness owns cadence.
    let delay = 0;
    controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]);
    try {
      const views = await refreshRegistry(signal);
      if (!sessionId) {
        if (expected !== generation) return;
        const chosen = explicitSession ? requestedId : views[0]?.id;
        if (chosen && chosen !== requestedId) autoSelect(chosen);
        else sessionId = chosen;
        sessions.value = sessionId || "";
        if (!sessionId) throw new Error("No simulation feed is connected yet.");
      }
      const response = await fetch(`/api/native-views/${encodeURIComponent(sessionId)}/snapshot`, { signal, cache: "no-store" });
      const next = await response.json();
      if (!response.ok) throw new Error(next.code || "Simulation feed is unavailable.");
      if (current && current.binding.bindingId !== next.binding.bindingId) resetRun();
      const videoOwned = Boolean(next.view.video);
      if (videoOwned) update(next);
      const key = `${next.binding.bindingId}:${next.view.image.file}:${next.view.image.sha256}`;
      if (key !== imageKey) {
        const accept = decoded => {
          if (!active || expected !== generation || current && current.binding.bindingId !== next.binding.bindingId) return;
          primaryPngView = next.view; picture.src = decoded.src; if (!primaryVideoFrame) frameGeometry(viewport, decoded);
          picture.hidden = Boolean(primaryVideoFrame); empty.hidden = true; imageKey = key; imageDeliveries.accept(key); renderPrimaryFrame();
        };
        if (videoOwned) {
          if (!primaryPending && !videoPlayer?.stats().ready) {
            const pending = decodedImage(next.imageUrl, signal); primaryPending = pending;
            pending.then(accept, () => { if (expected === generation && !primaryVideoFrame && !picture.naturalWidth) { empty.hidden = false; empty.textContent = "Image unavailable; waiting for continuous video."; } })
              .finally(() => { if (primaryPending === pending) primaryPending = null; });
          }
        } else {
          const decoded = await decodedImage(next.imageUrl, signal); if (expected !== generation) return; accept(decoded);
        }
      } else if (!primaryVideoFrame) {
        primaryPngView = next.view;
      }
      if (expected !== generation) return;
      if (feedError && commandStatus.textContent === feedError) commandStatus.textContent = "";
      feedError = null;
      if (!videoOwned) update(next);
      const elapsed = performance.now() - rateStarted;
      if (next.view.state === "ended") deliveryRate.textContent = "Run ended";
      else if (next.connection === "disconnected") deliveryRate.textContent = "No live frames";
      else if (elapsed >= 2000) { deliveryRate.textContent = imageDeliveries.sample(elapsed).toFixed(1) + " images/s"; rateStarted = performance.now(); }
      refreshFeedWindows();
      if (next.view.state === "ended" || next.connection === "disconnected") {
        // A chosen saved or disconnected session stays available for inspection.
        const successor = explicitSession ? null : await findSuccessor(signal);
        if (!active || expected !== generation) return;
        if (successor && !explicitSession) { autoSelect(successor.id); delay = 0; }
        else delay = 1000;
      }
    } catch (error) {
      if (expected !== generation || error.name === "AbortError") return;
      feedError = error.message;
      delay = 250; connection.textContent = "Feed unavailable"; connection.dataset.state = "stale";
      if (!current) { empty.hidden = false; empty.textContent = error.message; }
      else commandStatus.textContent = error.message;
      for (const value of controlButtons) value.disabled = true;
      freshness();
    } finally {
      if (active && expected === generation) timer = setTimeout(() => void poll(expected), delay);
    }
  }
  let ageTimer = null;
  function setFreshnessTimer(enabled) {
    if (enabled && ageTimer === null) ageTimer = setInterval(freshness, 500);
    else if (!enabled && ageTimer !== null) { clearInterval(ageTimer); ageTimer = null; }
  }
  window.addEventListener("pagehide", () => close(true));
  function close(force = false) {
    if (!force && feedWindows.size) return;
    active = false; generation += 1; clearTimeout(timer); controller?.abort();
    feedWindows.closeAll();
    videoPlayer?.destroy(); videoPlayer = null; primaryVideoSite = null; primaryVideoFrame = null;
    observationPanel.removeEventListener("toggle", renderObservation); clearObservation();
    for (const clear of cameraInputs.values()) clear();
    postController?.abort(); postController = null; posting = false; setFreshnessTimer(false);
  }
  return {
    open(id) {
      if (active && (requestedId === id || (!id && feedWindows.size))) return;
      close(true); active = true; requestedId = id; explicitSession = Boolean(id); sessionId = null; resetRun();
      observationPanel.addEventListener("toggle", renderObservation);
      settingsDirty = false; cognitionRequest = null; settingsStatus.textContent = ""; settingsDraft.textContent = "";
      registeredViews = []; registryCheckedAt = 0;
      void poll(generation);
    }, close,
  };
}
