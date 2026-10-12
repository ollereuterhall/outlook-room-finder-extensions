(() => {
  const ENABLED_KEY = "orffFiltersEnabled";
  const CONFIG_KEY = "orffSearchConfig";
  const DEFAULT_CONFIG = {
    filters: [{ id: "teams", name: "Teams", mode: "include", terms: ["Teams"] }],
    wrapLongNames: true
  };
  const COPY = {
    en: {
      pageTitle: "Outlook Room Finder Extensions",
      eyebrow: "OUTLOOK ROOM FINDER EXTENSIONS",
      enableFilters: "Enable",
      disableFilters: "Disable",
      filtersTitle: "Room filters",
      filtersHelp: "Selected filters apply together.",
      addFilter: "+ Add filter",
      filterName: "Filter name",
      filterNamePlaceholder: "e.g. Hide restricted",
      filterBehavior: "Filter behavior",
      filterValues: "Search phrases",
      keepMatches: "Keep rooms matching any phrase",
      hideMatches: "Hide rooms matching any phrase",
      valuesPlaceholder: "One phrase per line",
      removeFilter: "Remove filter",
      emptyFilters: "No phrase filters. Add one below.",
      newFilter: "New filter",
      wrapNames: "Wrap long room names",
      save: "Save",
      saved: "Saved",
      error: "Could not save"
    },
    sv: {
      pageTitle: "Outlook Room Finder Extensions",
      eyebrow: "OUTLOOK ROOM FINDER EXTENSIONS",
      enableFilters: "Aktivera",
      disableFilters: "Inaktivera",
      filtersTitle: "Rumsfilter",
      filtersHelp: "Valda filter används tillsammans.",
      addFilter: "+ Lägg till filter",
      filterName: "Filternamn",
      filterNamePlaceholder: "t.ex. Hide restricted",
      filterBehavior: "Filterbeteende",
      filterValues: "Sökfraser",
      keepMatches: "Behåll rum som matchar någon fras",
      hideMatches: "Dölj rum som matchar någon fras",
      valuesPlaceholder: "En fras per rad",
      removeFilter: "Ta bort filter",
      emptyFilters: "Inga frasfilter. Lägg till ett nedan.",
      newFilter: "Nytt filter",
      wrapNames: "Radbryt långa rumsnamn",
      save: "Spara",
      saved: "Sparat",
      error: "Kunde inte spara"
    }
  };

  const language = /^sv(?:[-_]|$)/i.test(navigator.language) ? "sv" : "en";
  const copy = COPY[language];
  const enabledToggle = document.querySelector("#enabled-toggle");
  const filterList = document.querySelector("#filter-list");
  const wrapNamesInput = document.querySelector("#wrap-names");
  const status = document.querySelector("#save-status");
  const form = document.querySelector("#settings-form");

  document.documentElement.lang = language;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = copy[element.dataset.i18n];
  });
  document.querySelectorAll("[data-i18n-attr]").forEach((element) => {
    for (const [attribute, key] of Object.entries(element.dataset.i18nAttr.split(",").reduce((attributes, entry) => {
      const [name, copyKey] = entry.split(":");
      attributes[name] = copyKey;
      return attributes;
    }, {}))) {
      element.setAttribute(attribute, copy[key]);
    }
  });

  const fromLines = (value) => value.split(/\r?\n/).map((term) => term.trim()).filter(Boolean);

  function normalizeConfig(value) {
    const filters = Array.isArray(value?.filters)
      ? value.filters
      : [
          { id: "teams", name: "Teams", mode: "include", terms: value?.teamsTerms || ["Teams"] },
          ...(Array.isArray(value?.restrictedTerms) && value.restrictedTerms.length
            ? [{ id: "restricted", name: "Hide restricted", mode: "exclude", terms: value.restrictedTerms }]
            : [])
        ];
    return {
      filters: filters.map((filter, index) => ({
        id: typeof filter.id === "string" && filter.id ? filter.id : `filter-${index + 1}`,
        name: typeof filter.name === "string" && filter.name.trim() ? filter.name.trim() : `${copy.newFilter} ${index + 1}`,
        mode: filter.mode === "exclude" ? "exclude" : "include",
        terms: Array.isArray(filter.terms) ? filter.terms.map((term) => String(term).trim()).filter(Boolean) : []
      })),
      wrapLongNames: value?.wrapLongNames !== false
    };
  }

  function createFilterEditor(filter) {
    const editor = document.createElement("section");
    editor.className = "filter-editor";
    editor.dataset.filterId = filter.id;

    const heading = document.createElement("div");
    heading.className = "filter-editor-heading";

    const name = document.createElement("input");
    name.className = "filter-name";
    name.type = "text";
    name.value = filter.name;
    name.placeholder = copy.filterNamePlaceholder;
    name.setAttribute("aria-label", copy.filterName);

    const remove = document.createElement("button");
    remove.className = "remove-filter";
    remove.type = "button";
    remove.textContent = "×";
    remove.title = copy.removeFilter;
    remove.setAttribute("aria-label", copy.removeFilter);
    heading.append(name, remove);

    const mode = document.createElement("select");
    mode.className = "filter-mode";
    mode.setAttribute("aria-label", copy.filterBehavior);
    for (const [value, label] of [["include", copy.keepMatches], ["exclude", copy.hideMatches]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      mode.append(option);
    }
    mode.value = filter.mode;

    const terms = document.createElement("textarea");
    terms.className = "filter-terms";
    terms.rows = 3;
    terms.spellcheck = false;
    terms.value = filter.terms.join("\n");
    terms.placeholder = copy.valuesPlaceholder;
    terms.setAttribute("aria-label", `${copy.filterValues}: ${filter.name}`);

    editor.append(heading, mode, terms);
    return editor;
  }

  function renderFilters(filters) {
    filterList.replaceChildren();
    if (!filters.length) {
      const empty = document.createElement("p");
      empty.className = "empty-filters";
      empty.textContent = copy.emptyFilters;
      filterList.append(empty);
      return;
    }
    filters.forEach((filter) => filterList.append(createFilterEditor(filter)));
  }

  function collectConfig() {
    const filters = [...filterList.querySelectorAll(".filter-editor")].map((editor) => ({
      id: editor.dataset.filterId,
      name: editor.querySelector(".filter-name").value.trim() || copy.newFilter,
      mode: editor.querySelector(".filter-mode").value,
      terms: fromLines(editor.querySelector(".filter-terms").value)
    }));
    return { filters, wrapLongNames: wrapNamesInput.checked };
  }

  function setToggleActionLabel(enabled) {
    const actionLabel = enabled ? copy.disableFilters : copy.enableFilters;
    enabledToggle.setAttribute("aria-label", actionLabel);
    enabledToggle.closest(".toggle").title = actionLabel;
  }

  async function sendEnabledToActiveTab(enabled) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id !== undefined) {
      chrome.tabs.sendMessage(tab.id, { type: "orff-set-enabled", enabled }).catch(() => {});
    }
  }

  async function loadPopup() {
    const stored = await chrome.storage.local.get([ENABLED_KEY, CONFIG_KEY]);
    const enabled = stored[ENABLED_KEY] !== false;
    const config = normalizeConfig(stored[CONFIG_KEY] || DEFAULT_CONFIG);
    enabledToggle.checked = enabled;
    setToggleActionLabel(enabled);
    renderFilters(config.filters);
    wrapNamesInput.checked = config.wrapLongNames;
  }

  enabledToggle.addEventListener("change", async () => {
    const enabled = enabledToggle.checked;
    setToggleActionLabel(enabled);
    try {
      await chrome.storage.local.set({ [ENABLED_KEY]: enabled });
      await sendEnabledToActiveTab(enabled);
    } catch {
      enabledToggle.checked = !enabled;
      setToggleActionLabel(!enabled);
      status.textContent = copy.error;
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "";
    try {
      await chrome.storage.local.set({ [CONFIG_KEY]: collectConfig() });
      status.textContent = copy.saved;
    } catch {
      status.textContent = copy.error;
    }
  });

  document.querySelector("#add-filter").addEventListener("click", () => {
    const id = crypto.randomUUID ? crypto.randomUUID() : `filter-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    filterList.querySelector(".empty-filters")?.remove();
    filterList.append(createFilterEditor({ id, name: copy.newFilter, mode: "include", terms: [] }));
    filterList.querySelector(`[data-filter-id="${CSS.escape(id)}"] .filter-name`)?.focus();
    status.textContent = "";
  });

  filterList.addEventListener("click", (event) => {
    const remove = event.target.closest(".remove-filter");
    if (!remove) return;
    remove.closest(".filter-editor").remove();
    if (!filterList.querySelector(".filter-editor")) renderFilters([]);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[ENABLED_KEY]) return;
    const enabled = changes[ENABLED_KEY].newValue !== false;
    enabledToggle.checked = enabled;
    setToggleActionLabel(enabled);
  });

  loadPopup().catch(() => {
    status.textContent = copy.error;
  });
})();
