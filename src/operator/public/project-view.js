import { projectModel, projectRoute, questionRoute, pendingQuestionCount } from "/project-model.js";
import { renderDescription } from "/operator-model.js";

export function installProjects(nav, reader) {
  let signature = "";
  let currentKey = "";
  const views = new Map();
  function node(tag, text, parent, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    parent?.append(element);
    return element;
  }
  function link(parent, label, href, className) { const a = node("a", label, parent, className); a.href = href; return a; }
  function section(parent, key, title, meta) {
    const details = node("details", undefined, parent, "project-section"); details.dataset.openKey = key;
    const summary = node("summary", undefined, details);
    node("span", title, summary);
    if (meta) node("span", meta, summary, "project-section-meta");
    return details;
  }
  function work(parent, threads, project) {
    const list = node("div", undefined, parent, "project-work-list");
    if (!threads.length) node("p", parent.tagName === "DETAILS" ? "No recorded work here yet." : "No questions waiting here.", list, "project-empty");
    for (const thread of threads) {
      const row = node("div", undefined, list, "project-work-card");
      const open = pendingQuestionCount(thread);
      link(row, thread.title || thread.interactionId, open ? questionRoute(project, thread.interactionId) : "#history?" + new URLSearchParams({ ref: thread.interactionId }), "project-work-title");
      const standing = thread.availability === "retained" && (thread.openCount || thread.deferredCount)
        ? "Unanswered / awaiting caller reconnection"
        : { answered: "Answered", ratified: "Ratified", held: "Held", withdrawn: "Withdrawn", closed: "Closed", deferred: "Deferred" }[thread.status];
      const qualifications = [thread.heldCount ? `${thread.heldCount} held` : "", thread.withdrawnCount ? `${thread.withdrawnCount} withdrawn` : ""].filter(Boolean);
      node("span", open ? `${open} question${open === 1 ? "" : "s"} waiting` : [standing || "Recorded work", ...qualifications].join(" / "), row, "thread-meta");
      if (open) link(row, "History", "#history?" + new URLSearchParams({ ref: thread.interactionId }));
    }
  }
  function projectCard(parent, project) {
    const card = node("a", undefined, parent, "project-entry"); card.href = projectRoute(project.ref);
    node("strong", project.label, card);
    const waiting = [...project.threads.values()].filter(t => pendingQuestionCount(t) > 0).length;
    node("span", waiting ? `${waiting} work item${waiting === 1 ? "" : "s"} awaiting review` : "Open project", card);
  }
  return function render(snapshot, selection = {}) {
    const model = projectModel(snapshot);
    const key = selection.project ? `project:${selection.project}` : selection.group ? `group:${selection.group}` : "overview";
    // Capture only meaningful content: polling timestamps must not rebuild focused controls.
    const content = JSON.stringify([key, snapshot.nativeViews, model.groups, [...model.projects].map(([ref, p]) => [ref, p.sources.map(s => [s.surface, s.page?.governingDocuments, s.page?.dataSources, s.threads]), [...p.threads]])]);
    if (signature === content) return;
    signature = content;
    if (currentKey) views.set(currentKey, { scroll: reader.scrollTop, open: [...reader.querySelectorAll("details[open]")].map(d => d.dataset.openKey) });
    const focusedKey = document.activeElement?.closest("details")?.dataset.openKey;
    const readerHadFocus = reader.contains(document.activeElement);
    const navFocus = nav.contains(document.activeElement) ? document.activeElement.getAttribute("href") : null;
    currentKey = key;
    nav.replaceChildren(); reader.replaceChildren();
    const all = link(nav, "All projects", "#projects", "project-nav-button");
    all.setAttribute("aria-current", key === "overview" ? "page" : "false");
    const grouped = new Set();
    for (const group of model.groups) {
      const a = link(nav, group.label, "#projects?" + new URLSearchParams({ group: group.groupId }), "project-nav-button");
      a.setAttribute("aria-current", selection.group === group.groupId ? "page" : "false");
      for (const project of group.members) {
        grouped.add(project.ref);
        const child = link(nav, project.label, projectRoute(project.ref), "project-nav-button project-nav-child");
        child.setAttribute("aria-current", selection.project === project.ref ? "page" : "false");
      }
    }
    for (const project of model.projects.values()) if (!grouped.has(project.ref)) {
      const a = link(nav, project.label, projectRoute(project.ref), "project-nav-button");
      a.setAttribute("aria-current", selection.project === project.ref ? "page" : "false");
    }
    const heading = node("h3", "", reader); heading.tabIndex = -1;
    const project = model.projects.get(selection.project);
    const group = model.groups.find(g => g.groupId === selection.group);
    if (project) {
      heading.textContent = project.label;
      for (const view of snapshot.nativeViews || []) if (view.projectRef === project.ref) {
        link(reader, view.label, "#native-view?" + new URLSearchParams({ session: view.id }), "project-work-title");
      }
      const parents = model.groups.filter(g => g.members.includes(project));
      for (const parent of parents) link(reader, parent.label, "#projects?" + new URLSearchParams({ group: parent.groupId }), "project-parent-link");
      const threads = [...project.threads.values()];
      const pending = threads.filter(t => pendingQuestionCount(t) > 0);
      work(reader, pending, project.ref);
      const history = section(reader, "history", "Work history", `${threads.length - pending.length} records`);
      work(history, threads.filter(t => !pending.includes(t)), project.ref);
      link(history, "Explore project history", "#history?" + new URLSearchParams({ project: project.ref }));
      const documentCount = project.sources.reduce((count, source) => count + (source.page?.governingDocuments?.length || 0), 0);
      const dataCount = project.sources.reduce((count, source) => count + (source.page?.dataSources?.length || 0), 0);
      const documents = section(reader, "documents", "Documents", `${documentCount} documents`);
      const sources = dataCount ? section(reader, "data", "Data sources", `${dataCount} sources`) : null;
      const documentOccurrences = new Map();
      for (const source of project.sources) for (const doc of source.page?.governingDocuments || []) {
        for (const key of ["label:" + (doc.label || doc.path), "path:" + doc.path]) documentOccurrences.set(key, (documentOccurrences.get(key) || 0) + 1);
      }
      for (const source of project.sources) {
        const docs = source.page?.governingDocuments || [];
        if (!source.page) node("p", `${source.surface.surfaceId} could not be read.`, documents);
        for (const doc of docs) {
          const duplicate = documentOccurrences.get("label:" + (doc.label || doc.path)) > 1 || documentOccurrences.get("path:" + doc.path) > 1;
          const reference = [doc.label && doc.label !== doc.path ? doc.path : "", duplicate ? source.surface.surfaceId : "", doc.exists ? "" : "missing"].filter(Boolean).join(" / ");
          const entry = section(documents, source.surface.surfaceId + ":" + doc.path, doc.label || doc.path, reference);
          node("p", `Source: ${source.surface.surfaceId}. Registered excerpt.`, entry, "project-section-meta");
          entry.append(renderDescription(document, (doc.excerpt || []).join("\n")));
          if (doc.tail?.length) { node("h4", "Latest entries", entry); entry.append(renderDescription(document, doc.tail.join("\n"))); }
        }
        const data = source.page?.dataSources || [];
        if (data.length) {
          for (const item of data) {
            const detail = section(sources, source.surface.surfaceId + ":data:" + item.name, item.label || item.name, item.exists ? item.format : "missing");
            node("p", item.path, detail);
            node("p", `Source: ${source.surface.surfaceId}`, detail, "project-section-meta");
            node("p", item.isDirectory ? `${item.files ?? "Unknown number of"} files` : `${item.bytes || 0} bytes`, detail);
            node("p", "Source registration details. Captured evidence is available through project history.", detail);
            link(detail, "Find captured evidence", "#history?" + new URLSearchParams({ project: project.ref, query: item.path }));
          }
        }
      }
    } else if (group || (!selection.project && !selection.group)) {
      heading.textContent = group ? group.label : "Projects";
      node("p", group ? "Choose a subproject to see its questions and work." : "Choose a project to continue its work.", reader, "project-section-meta");
      if (group?.threads?.live?.length) work(reader, group.threads.live, group.projectRef);
      const cards = node("div", undefined, reader, "project-entry-grid");
      if (!group) for (const g of model.groups) {
        const card = link(cards, undefined, "#projects?" + new URLSearchParams({ group: g.groupId }), "project-entry");
        node("strong", g.label, card); node("span", `${g.members.length} subprojects`, card);
      }
      for (const p of group ? group.members : [...model.projects.values()].filter(p => !grouped.has(p.ref))) projectCard(cards, p);
      if (!group) link(reader, "Browse all questions, including unassigned work", "#questions", "project-parent-link");
    } else {
      heading.textContent = "Project unavailable";
      node("p", "This project is no longer registered. Its direct question and history links remain available.", reader);
    }
    const saved = views.get(key);
    for (const details of reader.querySelectorAll("details")) details.open = Boolean(saved?.open.includes(details.dataset.openKey));
    reader.scrollTop = saved?.scroll || 0;
    if (readerHadFocus) {
      const target = [...reader.querySelectorAll("details")].find(d => d.dataset.openKey === focusedKey)?.querySelector("summary") || heading;
      target.focus({ preventScroll: true });
    }
    if (navFocus) [...nav.querySelectorAll("a")].find(a => a.getAttribute("href") === navFocus)?.focus({ preventScroll: true });
  };
}
