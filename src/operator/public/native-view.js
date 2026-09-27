function node(tag, text, parent, className) {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = text;
  if (className) value.className = className;
  parent?.append(value);
  return value;
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

export function installNativeView(root) {
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
  const observatoryTools = node("div", undefined, stage, "native-observatory-tools");
  const sizeControl = node("label", undefined, observatoryTools, "native-panel-size");
  node("span", "Panel size", sizeControl);
  const panelSize = node("input", undefined, sizeControl); panelSize.type = "range"; panelSize.id = "native-observatory-panel-size"; panelSize.min = "280"; panelSize.max = "640"; panelSize.step = "40";
  const preferredSize = Number(readPreference("panel-size", 320));
  panelSize.value = Number.isInteger(preferredSize) && preferredSize >= 280 && preferredSize <= 640 && preferredSize % 40 === 0 ? preferredSize : 320;
  panelSize.setAttribute("aria-label", "Observatory panel size");
  const panelSizeValue = node("output", `${panelSize.value} px`, sizeControl); panelSizeValue.htmlFor = panelSize.id;
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
  stage.style.setProperty("--native-panel-size", `${panelSize.value}px`);
  panelSize.addEventListener("input", () => {
    stage.style.setProperty("--native-panel-size", `${panelSize.value}px`); panelSizeValue.textContent = `${panelSize.value} px`;
    writePreference("panel-size", Number(panelSize.value));
  });
  const primaryPanel = node("article", undefined, panelGrid, "native-observatory-panel native-observatory-primary");
  const viewport = node("div", undefined, primaryPanel, "native-viewport");
  viewport.tabIndex = 0; viewport.setAttribute("aria-label", "Native simulation view. Arrow keys move the camera; mouse wheel or plus and minus zoom; space pauses or resumes.");
  const picture = node("img", undefined, viewport); picture.alt = "Native simulation frame"; picture.hidden = true; picture.draggable = false;
  const empty = node("p", "Waiting for the simulation feed.", viewport, "native-empty");
  const primaryOverlay = node("div", undefined, primaryPanel, "native-panel-telemetry"); primaryOverlay.hidden = true;
  const primaryCaption = node("div", undefined, primaryPanel, "native-panel-caption");
  const primaryLabel = node("strong", "Current camera", primaryCaption), primaryAge = node("span", "No frame", primaryCaption);
  const noScreens = node("p", "Choose a view above to restore the observatory.", panelGrid, "native-observatory-empty"); noScreens.hidden = true;
  const frameState = node("div", undefined, stage, "native-frame-state");
  const imageAge = node("span", "No frame received", frameState);
  const deliveryRate = node("span", "", frameState);
  const controls = node("div", undefined, stage, "native-controls"); controls.setAttribute("aria-label", "Observer controls");
  const controlButtons = [];
  function button(label, action, values, parent = controls) {
    const value = node("button", label, parent, "button secondary-button"); value.type = "button"; value.disabled = true;
    value.addEventListener("click", () => void send(action, typeof values === "function" ? values() : values));
    controlButtons.push(value); return value;
  }
  const pause = button("Pause", "pause");
  const speeds = node("div", undefined, controls, "native-speeds"); speeds.setAttribute("aria-label", "Simulation speed");
  for (const value of [1, 2, 3]) button(["Normal", "Fast", "Fastest"][value - 1], "speed", { value }, speeds);
  const automatic = button("Follow activity", "auto");
  const zoomControls = node("div", undefined, controls, "native-zoom"); zoomControls.hidden = true;
  const zoomOut = button("−", "zoom", { value: 1 }, zoomControls); zoomOut.setAttribute("aria-label", "Zoom out"); zoomOut.title = "Zoom out (mouse wheel down or −)";
  const zoomLabel = node("span", "", zoomControls); zoomLabel.setAttribute("aria-live", "off");
  const zoomIn = button("+", "zoom", { value: -1 }, zoomControls); zoomIn.setAttribute("aria-label", "Zoom in"); zoomIn.title = "Zoom in (mouse wheel up or +)";
  const pan = node("div", undefined, controls, "native-pan");
  for (const [label, dx, dy] of [["←", -8, 0], ["↑", 0, -8], ["↓", 0, 8], ["→", 8, 0]]) {
    const b = button(label, "pan", { dx, dy }, pan); b.setAttribute("aria-label", `Move camera ${label}`);
  }
  button("End run", "stop");
  const commandStatus = node("p", "", stage, "native-command-status"); commandStatus.setAttribute("role", "status");
  const summary = node("p", "", stage, "native-summary");
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
  details.insertBefore(cognition, personBody);
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
  let inspectorVisible = readPreference("inspector", true) !== false;
  function setInspectorVisible(visible) {
    inspectorVisible = visible; inspector.hidden = !visible; body.classList.toggle("native-inspector-hidden", !visible);
    inspectorToggle.textContent = visible ? "Hide details" : "Show details";
    inspectorToggle.setAttribute("aria-expanded", String(visible)); writePreference("inspector", visible);
  }
  inspectorToggle.addEventListener("click", () => setInspectorVisible(!inspectorVisible));
  inspectorClose.addEventListener("click", () => setInspectorVisible(false));
  setInspectorVisible(inspectorVisible);
  let active = false, requestedId = null, sessionId = null, current = null, selected = null, explicitPerson = false;
  let timer, controller, generation = 0, imageKey = "", personSignature = "", peopleSignature = "";
  let waiting = null, posting = false, lastResult = null, imagesReceived = 0, rateStarted = performance.now();
  let feedError = null, postController = null;
  let cognitionSignature = "", settingsDirty = false, cognitionRequest = null;
  let registeredViews = [], registryCheckedAt = 0;
  const feedCards = new Map(), hiddenScreens = new Set();
  let screenSignature = "";

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

  function route(id) { location.hash = "#native-view?" + new URLSearchParams({ session: id }); }
  sessions.addEventListener("change", () => route(sessions.value));

  function resetRun() {
    current = null; selected = null; explicitPerson = false; waiting = null; lastResult = null;
    peopleSignature = personSignature = cognitionSignature = imageKey = "";
    feedError = null; cognitionRequest = null; settingsDirty = false;
    for (const value of feedCards.values()) value.card.remove();
    feedCards.clear(); hiddenScreens.clear(); screenSignature = ""; viewToggles.replaceChildren();
    primaryPanel.hidden = false; primaryLabel.textContent = "Current camera"; primaryAge.textContent = "No frame";
    primaryOverlay.replaceChildren(); delete primaryOverlay.dataset.signature; primaryOverlay.hidden = true; noScreens.hidden = true;
    picture.hidden = true; picture.removeAttribute("src"); empty.hidden = false; empty.textContent = "Waiting for the simulation feed.";
    personBody.replaceChildren(); cognitionBody.replaceChildren(); cognition.hidden = true;
    commandStatus.textContent = ""; summary.textContent = "";
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
    history.replaceState(history.state, "", "#native-view?" + new URLSearchParams({ session: id }));
  }

  async function findSuccessor(signal) {
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
    return candidates.filter(value => value && value.snapshot.view.state !== "ended" && value.snapshot.connection !== "disconnected")
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
    const age = Math.max(0, Date.now() - capturedAtUnixMs);
    return age < 1000 ? "just received" : `${(age / 1000).toFixed(1)}s old`;
  }

  function renderOverlay(container, overlay, frameCapturedAtUnixMs) {
    const groups = (overlay?.groups || []).filter(group => visibleOverlays.has(group.id));
    const lag = overlay ? Math.max(0, frameCapturedAtUnixMs - overlay.capturedAtUnixMs) : 0;
    const signature = JSON.stringify([groups, lag]);
    if (container.dataset.signature === signature) return;
    container.dataset.signature = signature; container.dataset.count = String(groups.length); container.replaceChildren();
    for (const group of groups) {
      const section = node("section", undefined, container, "native-overlay-group"); section.dataset.overlay = group.id;
      node("strong", group.label, section);
      const rows = node("dl", undefined, section);
      for (const row of group.rows) {
        const item = node("div", undefined, rows, "native-overlay-value"); item.title = `${row.label}: ${row.value}`;
        node("dt", row.label, item); node("dd", row.value, item);
      }
    }
    if (groups.length && lag >= 100) node("small", `State ${(lag / 1000).toFixed(1)}s before frame`, container, "native-overlay-age");
    container.hidden = groups.length === 0;
  }

  function renderViewToggles(screens) {
    const signature = JSON.stringify(screens.map(screen => [screen.key, screen.label]));
    if (signature !== screenSignature) {
      screenSignature = signature; viewToggles.replaceChildren();
      for (const screen of screens) {
        const value = node("button", screen.label, viewToggles, "native-observatory-toggle"); value.type = "button";
        value.dataset.screen = screen.key; value.title = `Show or hide ${screen.label}`;
        value.addEventListener("click", () => {
          if (hiddenScreens.has(screen.key)) hiddenScreens.delete(screen.key); else hiddenScreens.add(screen.key);
          if (current) renderFeeds(current);
        });
      }
    }
    for (const value of viewToggles.querySelectorAll("button")) {
      value.setAttribute("aria-pressed", String(!hiddenScreens.has(value.dataset.screen)));
    }
  }

  function refreshFeedAges() {
    if (current) primaryAge.textContent = ageText(current.view.capturedAtUnixMs);
    for (const value of feedCards.values()) value.age.textContent = ageText(value.capturedAtUnixMs);
  }

  function renderFeeds(next) {
    const urls = new Map((next.feedImages || []).map(value => [value.id, value.imageUrl]));
    const reported = next.view.feeds || [];
    const primaryFeed = reported.find(value => value.image.file === next.view.image.file);
    const cameraNames = (next.view.camera?.personIds || []).map(id => next.view.people.find(person => person.id === id)?.label).filter(Boolean);
    const primaryName = primaryFeed?.label || cameraNames.join(", ") || "Current camera";
    const primaryDisplay = primaryName === "Current camera" ? primaryName : `Current: ${primaryName}`;
    const feeds = reported.filter(value => value.image.file !== next.view.image.file && urls.has(value.id));
    const screens = [{ key: "current", label: primaryDisplay },
      ...feeds.map(feed => ({ key: `feed:${feed.id}`, label: feed.label }))];
    renderViewToggles(screens);

    primaryLabel.textContent = primaryDisplay;
    primaryPanel.hidden = hiddenScreens.has("current");
    renderOverlay(primaryOverlay, primaryFeed?.overlay, next.view.capturedAtUnixMs);

    const activeIds = new Set(feeds.map(value => value.id));
    for (const [id, value] of feedCards) if (!activeIds.has(id)) { value.card.remove(); feedCards.delete(id); }
    for (const feed of feeds) {
      let value = feedCards.get(feed.id);
      if (!value) {
        const card = node("article", undefined, panelGrid, "native-observatory-panel native-feed-card");
        const media = node("div", undefined, card, "native-panel-media");
        const image = node("img", undefined, media); image.alt = ""; image.decoding = "async"; image.draggable = false;
        const overlay = node("div", undefined, card, "native-panel-telemetry"); overlay.hidden = true;
        const caption = node("div", undefined, card, "native-panel-caption");
        const label = node("strong", "", caption), age = node("span", "", caption);
        value = { card, image, overlay, label, age, key: "", capturedAtUnixMs: 0 }; feedCards.set(feed.id, value);
      }
      value.label.textContent = feed.label; value.image.alt = `Retained native view: ${feed.label}`;
      value.capturedAtUnixMs = feed.capturedAtUnixMs; value.card.hidden = hiddenScreens.has(`feed:${feed.id}`);
      renderOverlay(value.overlay, feed.overlay, feed.capturedAtUnixMs);
      const key = `${feed.image.file}:${feed.image.sha256}`;
      if (key !== value.key) { value.image.src = urls.get(feed.id); value.key = key; }
      panelGrid.insertBefore(value.card, noScreens);
    }
    noScreens.hidden = screens.some(screen => !hiddenScreens.has(screen.key));
    panelGrid.append(noScreens); refreshFeedAges();
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
    node("p", person.summary, personBody, "native-person-summary");
    for (const section of person.sections || []) {
      const group = node("details", undefined, personBody, "native-detail-section"); group.dataset.section = section.id;
      group.open = open.get(section.id) ?? true;
      node("summary", section.label, group);
      node("p", [section.perspective, section.source, section.status !== "available" ? section.status : ""].filter(Boolean).join(" · "), group, "native-source");
      if (section.message) node("p", section.message, group, "native-source");
      const rows = node("dl", undefined, group);
      for (const row of section.rows) { node("dt", row.label, rows); node("dd", row.value, rows); }
    }
    const events = node("details", undefined, personBody, "native-detail-section"); events.dataset.section = "events"; events.open = open.get("events") ?? true;
    node("summary", "Recent activity and dialogue", events);
    if (!person.events?.length) node("p", "No recorded events in this observation.", events, "native-source");
    for (const event of [...person.events || []].reverse()) {
      const row = node("article", undefined, events, "native-event");
      node("strong", event.stage, row); node("span", ` · hour ${event.worldHours.toFixed(3)}`, row, "native-source");
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
      node("p", `Version ${model.version}${model.omittedBeliefs ? ` · ${model.omittedBeliefs} beliefs omitted` : ""}${model.omittedHypotheses ? ` · ${model.omittedHypotheses} associations omitted` : ""}`, state, "native-source");
      const beliefs = group(state, `beliefs:${model.id}`, `${model.beliefs.length} beliefs`);
      for (const belief of model.beliefs) node("p", `${belief.label} · ${belief.status} · ${percent(belief.confidence)}`, beliefs, "native-source");
      for (const hypothesis of model.hypotheses) {
        const item = group(state, `hypothesis:${model.id}:${hypothesis.id}`, hypothesis.label);
        node("p", `${hypothesis.branch} · depth ${hypothesis.depth} · ${hypothesis.status} · confidence ${percent(hypothesis.confidence)}`, item, "native-source");
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
    refreshFeedAges();
    const view = current.view, age = Math.max(0, Date.now() - view.capturedAtUnixMs);
    const commandable = view.state !== "ended" && !feedError && (view.state === "paused" || age < 30000);
    connection.textContent = feedError ? "Feed unavailable" : view.state === "ended" ? "Run ended" : view.state === "paused" ? "Paused" : age >= 30000 ? "Disconnected" : age >= 3000 ? "Delayed frame" : "Running";
    connection.dataset.state = feedError ? "stale" : view.state === "ended" ? "ended" : view.state === "paused" ? "paused" : age >= 3000 ? "stale" : "live";
    imageAge.textContent = view.state === "ended" ? "Final frame" : "Frame " + (age < 1000 ? "just received" : (age / 1000).toFixed(1) + "s old");
    if (view.state === "ended") deliveryRate.textContent = "Run complete";
    for (const value of controlButtons) value.disabled = !commandable || posting;
    people.disabled = !view.people.length || posting;
    focus.disabled ||= !selected;
    panelOpen.disabled ||= !selected || !view.panels?.length;
    panelClose.disabled ||= !selected || !view.panels?.length;
    applyCognition.disabled = !commandable || posting || !view.people.find(person => person.id === selected)?.cognition
      || !settingsValid() || ["pending", "sending"].includes(cognitionRequest?.status);
    pause.textContent = view.state === "paused" ? "Resume" : "Pause";
    automatic.setAttribute("aria-pressed", String(view.camera?.mode === "automatic"));
    zoomControls.hidden = !view.viewport;
    if (view.viewport) {
      const { zoom, targetZoom, zoomLevels } = view.viewport;
      zoomLabel.textContent = Math.round(100 / zoom) + "%";
      zoomLabel.title = "Camera zoom " + zoom.toFixed(2) + "; target " + targetZoom.toFixed(2);
      zoomOut.disabled ||= targetZoom >= zoomLevels.at(-1) - 0.0001;
      zoomIn.disabled ||= targetZoom <= zoomLevels[0] + 0.0001;
    }
    const inspection = view.inspection;
    if (!inspection?.sequence) inspectionAge.textContent = inspection?.message || "Person information has not been sampled.";
    else {
      const referenceTime = view.state === "ended" ? view.capturedAtUnixMs : Date.now();
      const detailAge = Math.max(0, referenceTime - inspection.capturedAtUnixMs) / 1000;
      const timing = view.state === "ended" ? (detailAge < 1 ? "final sample" : detailAge.toFixed(1) + "s before final") : detailAge.toFixed(1) + "s old";
      inspectionAge.textContent = "Person information: " + inspection.status
        + (view.state !== "ended" && detailAge >= 3 ? " \u00b7 stale" : "") + " \u00b7 " + timing
        + (inspection.omittedPeople ? " \u00b7 " + inspection.omittedPeople + " people outside this sample" : "")
        + (inspection.omittedEvents ? " \u00b7 " + inspection.omittedEvents + " events omitted" : "");
      if (inspection.status !== "available" && inspection.message) inspectionAge.textContent += " \u00b7 " + inspection.message;
    }
  }

  function update(next) {
    current = next; const view = next.view;
    setFreshnessTimer(view.state !== "ended");
    title.textContent = next.binding.label || view.title;
    summary.textContent = view.summary;
    const cameraNames = (view.camera?.personIds || []).map(id => view.people.find(person => person.id === id)?.label).filter(Boolean);
    cameraSubject.textContent = !view.camera ? "Camera state unavailable" : view.camera.mode === "automatic"
      ? `Camera follows ${cameraNames.length ? cameraNames.join(", ") : "activity"}`
      : `Camera: manual${cameraNames.length ? ` · ${cameraNames.join(", ")}` : ""}`;
    cameraSummary.textContent = view.camera?.summary || "";
    project.hidden = !next.binding.projectRef;
    project.href = "#projects?" + new URLSearchParams({ project: next.binding.projectRef || "" });
    if (!view.people.some(person => person.id === selected)) { selected = null; explicitPerson = false; }
    if (!explicitPerson) selected = view.camera?.personIds[0] || selected || view.people[0]?.id || null;
    selectPeople(); renderPerson(); renderCognition(); renderFeeds(next); freshness();
    if (view.commandResult && (!lastResult || view.commandResult.sequence > lastResult.sequence)) {
      lastResult = view.commandResult;
      commandStatus.textContent = `${lastResult.status === "applied" ? "Applied" : "Rejected"}: ${lastResult.message}`;
      commandStatus.dataset.state = lastResult.status;
    }
    if (waiting && view.lastCommandSequence >= waiting) {
      if (view.commandResult?.sequence !== waiting && lastResult?.status !== "rejected") commandStatus.textContent = "Request processed; application outcome was not reported.";
      waiting = null;
    } else if (waiting) commandStatus.textContent = `Request ${waiting} awaiting the simulation.`;
  }

  async function send(action, values = {}) {
    const age = current ? Date.now() - current.view.capturedAtUnixMs : Infinity;
    if (!active || !current || posting || feedError || current.view.state === "ended" || (current.view.state !== "paused" && age >= 30000)) return;
    if (action === "cognition") {
      if (!settingsValid() || !current.view.people.find(person => person.id === selected)?.cognition || ["pending", "sending"].includes(cognitionRequest?.status)) return;
      cognitionRequest = { values: { ...values }, sequence: null, status: "sending", message: "Sending settings request.",
        inspectionSequence: current.view.inspection?.sequence ?? 0, requestedAtUnixMs: Date.now() };
      updateSettings();
    }
    if (action === "zoom") {
      const cameraViewport = current.view.viewport;
      if (!cameraViewport || ![-1, 1].includes(values.value)) return;
      const { targetZoom, zoomLevels } = cameraViewport;
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
    } catch (error) {
      if (expected === generation) commandStatus.textContent = error.name === "TimeoutError" ? "Request outcome unknown. Wait for the simulation's acknowledgement before trying again." : error.message;
      if (expected === generation && action === "cognition") {
        cognitionRequest.status = "unknown"; cognitionRequest.message = commandStatus.textContent; updateSettings();
      }
    } finally {
      if (postController === requestController) { postController = null; posting = false; freshness(); }
    }
  }

  viewport.addEventListener("keydown", event => {
    const move = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }[event.key];
    if (move) { event.preventDefault(); void send("pan", { dx: move[0], dy: move[1] }); }
    if (event.code === "Space") { event.preventDefault(); void send("pause"); }
    if (["-", "_", "+", "="].includes(event.key) && current?.view.viewport) { event.preventDefault(); void send("zoom", { value: ["-", "_"].includes(event.key) ? 1 : -1 }); }
  });
  let lastZoomAt = 0;
  viewport.addEventListener("wheel", event => {
    if (!current?.view.viewport || !event.deltaY) return;
    event.preventDefault();
    if (performance.now() - lastZoomAt < 150) return;
    lastZoomAt = performance.now();
    void send("zoom", { value: event.deltaY > 0 ? 1 : -1 });
  }, { passive: false });
  let drag = null;
  viewport.addEventListener("pointerdown", event => { if (event.button === 0) { drag = [event.clientX, event.clientY]; viewport.focus(); } });
  viewport.addEventListener("pointerup", event => {
    if (!drag) return;
    const dx = Math.max(-8, Math.min(8, Math.round((drag[0] - event.clientX) / 24)));
    const dy = Math.max(-8, Math.min(8, Math.round((drag[1] - event.clientY) / 24))); drag = null;
    if (dx || dy) void send("pan", { dx, dy });
  });
  viewport.addEventListener("pointerleave", () => { drag = null; });

  async function decodedImage(url, signal) {
    const image = new Image(); image.decoding = "async"; image.src = url;
    try {
      await Promise.race([image.decode(), new Promise((_, reject) => {
        if (signal.aborted) reject(signal.reason);
        else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      })]);
      return image.src;
    } catch (error) {
      image.src = ""; throw error;
    }
  }

  async function poll(expected) {
    if (!active || expected !== generation) return;
    let delay = 10;
    controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]);
    try {
      const views = await refreshRegistry(signal);
      if (!sessionId) {
        if (expected !== generation) return;
        const chosen = views.some(value => value.id === requestedId) ? requestedId : views[0]?.id;
        if (chosen && chosen !== requestedId) autoSelect(chosen);
        else sessionId = chosen;
        sessions.value = sessionId || "";
        if (!sessionId) throw new Error("No simulation feed is connected yet.");
      }
      const response = await fetch(`/api/native-views/${encodeURIComponent(sessionId)}/snapshot`, { signal, cache: "no-store" });
      const next = await response.json();
      if (!response.ok) throw new Error(next.code || "Simulation feed is unavailable.");
      if (current && current.binding.bindingId !== next.binding.bindingId) resetRun();
      const key = `${next.binding.bindingId}:${next.view.image.file}:${next.view.image.sha256}`;
      if (key !== imageKey) {
        const url = await decodedImage(next.imageUrl, signal);
        if (expected !== generation) return;
        picture.src = url; picture.hidden = false; empty.hidden = true; imageKey = key; imagesReceived += 1;
      }
      if (expected !== generation) return;
      feedError = null;
      update(next);
      const elapsed = performance.now() - rateStarted;
      if (next.view.state === "ended") deliveryRate.textContent = "Run complete";
      else if (elapsed >= 2000) { deliveryRate.textContent = (1000 * imagesReceived / elapsed).toFixed(1) + " images/s"; imagesReceived = 0; rateStarted = performance.now(); }
      if (next.view.state === "ended" || next.connection === "disconnected") {
        const successor = await findSuccessor(signal);
        if (successor) { autoSelect(successor.id); delay = 0; }
        else delay = 1000;
      }
    } catch (error) {
      if (expected !== generation || error.name === "AbortError") return;
      feedError = error.message;
      delay = 250; connection.textContent = "Feed unavailable"; connection.dataset.state = "stale";
      if (!current) { empty.hidden = false; empty.textContent = error.message; }
      else commandStatus.textContent = error.message;
      for (const value of controlButtons) value.disabled = true;
    } finally {
      if (active && expected === generation) timer = setTimeout(() => void poll(expected), delay);
    }
  }
  let ageTimer = null;
  function setFreshnessTimer(enabled) {
    if (enabled && ageTimer === null) ageTimer = setInterval(freshness, 500);
    else if (!enabled && ageTimer !== null) { clearInterval(ageTimer); ageTimer = null; }
  }
  window.addEventListener("pagehide", () => close());
  function close() {
    active = false; generation += 1; clearTimeout(timer); controller?.abort(); drag = null;
    postController?.abort(); postController = null; posting = false; setFreshnessTimer(false);
  }
  return {
    open(id) {
      if (active && requestedId === id) return;
      close(); active = true; requestedId = id; sessionId = null; resetRun();
      settingsDirty = false; cognitionRequest = null; settingsStatus.textContent = ""; settingsDraft.textContent = "";
      registeredViews = []; registryCheckedAt = 0;
      void poll(generation);
    }, close,
  };
}
