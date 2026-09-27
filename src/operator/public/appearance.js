// Appearance is a client preference, independent of project and decision state.
(() => {
  const key = "mousecat.appearance.v1";
  const themes = new Set(["manuscript", "bw", "light"]);
  const normalize = value => themes.has(value) ? value : "manuscript";
  let saved;
  try { saved = localStorage.getItem(key); } catch { /* Storage may be unavailable. */ }
  document.documentElement.dataset.theme = normalize(saved);

  function apply(value, persist = true) {
    const theme = normalize(value);
    document.documentElement.dataset.theme = theme;
    let stored = true;
    if (persist) {
      try { localStorage.setItem(key, theme); } catch { stored = false; }
    }
    for (const input of document.querySelectorAll('input[name="appearance-theme"]')) {
      input.checked = input.value === theme;
    }
    const status = document.querySelector("#appearance-status");
    if (status) status.textContent = stored
      ? "Saved for this app or browser profile."
      : "Applied for this visit. This profile could not save the setting.";
  }

  window.addEventListener("storage", event => {
    if (event.key === key || event.key === null) apply(event.newValue, false);
  });
  document.addEventListener("DOMContentLoaded", () => {
    const dialog = document.querySelector("#settings-dialog");
    const button = document.querySelector("#settings-toggle");
    button.addEventListener("click", () => dialog.showModal());
    document.querySelector("#settings-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => button.focus());
    for (const input of document.querySelectorAll('input[name="appearance-theme"]')) {
      input.addEventListener("change", () => { if (input.checked) apply(input.value); });
    }
    apply(document.documentElement.dataset.theme, false);
  });
})();
