(() => {
  const PANEL_ID = "orff-panel";
  const ENABLED_KEY = "orffFiltersEnabled";
  const CONFIG_KEY = "orffSearchConfig";
  const ROOM_PATTERN = /\bConf\d{3}\b/i;
  const DEFAULT_CONFIG = {
    filters: [{ id: "teams", name: "Teams", mode: "include", terms: ["Teams"] }],
    wrapLongNames: true
  };
  const DEFAULTS = {
    onlyAvailable: false
  };
  const COPY = {
    en: {
      extendedFilter: "Extended Filter",
      selectFilter: "Select filter",
      onlyAvailable: "Only available",
      waiting: "Waiting for rooms...",
      roomCount: (shown, total) => `${shown} of ${total} rooms`,
      newFilter: "New filter"
    },
    sv: {
      extendedFilter: "Fler Filter",
      selectFilter: "Välj filter",
      onlyAvailable: "Endast lediga",
      waiting: "Väntar på rum...",
      roomCount: (shown, total) => `${shown} av ${total} rum`,
      newFilter: "Nytt filter"
    }
  };
  let settings = { ...DEFAULTS, activeFilters: {} };
  let searchConfig = normalizeSearchConfig(DEFAULT_CONFIG);
  let filtersEnabled;
  let updateTimer;
  let clearClickInProgress = false;
  let clearButtonObserver;
  let observedClearButton;
  const clearButtonStates = new WeakMap();

  const normalize = (value) => value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("sv-SE");

  function matchesTerms(text, terms) {
    return terms.some((term) => text.includes(term));
  }

  function normalizeSearchConfig(value) {
    const filters = Array.isArray(value?.filters)
      ? value.filters
      : [
          { id: "teams", name: "Teams", mode: "include", terms: value?.teamsTerms || ["Teams"] },
          ...(Array.isArray(value?.restrictedTerms) && value.restrictedTerms.length
            ? [{ id: "restricted", name: "Hide restricted", mode: "exclude", terms: value.restrictedTerms }]
            : [])
        ];
    const usedIds = new Set();
    return {
      filters: filters.map((filter, index) => {
        let id = typeof filter.id === "string" && filter.id.trim() ? filter.id : `filter-${index + 1}`;
        while (usedIds.has(id)) id = `${id}-${index + 1}`;
        usedIds.add(id);
        return {
          id,
          name: typeof filter.name === "string" && filter.name.trim() ? filter.name.trim() : `${localizedCopy().newFilter} ${index + 1}`,
          mode: filter.mode === "exclude" ? "exclude" : "include",
          terms: Array.isArray(filter.terms) ? filter.terms.map((term) => String(term).trim()).filter(Boolean) : []
        };
      }),
      wrapLongNames: value?.wrapLongNames !== false
    };
  }

  function visible(element) {
    return Boolean(element.getClientRects().length)
      && getComputedStyle(element).visibility !== "hidden";
  }

  function isSwedishUi() {
    const lang = document.documentElement.lang || document.body?.lang || "";
    if (/^sv(?:[-_]|$)/i.test(lang)) return true;
    return [...document.querySelectorAll('input[aria-label]')]
      .some((input) => ["funktioner", "välj funktioner"].includes(normalize(input.getAttribute("aria-label") || "")));
  }

  function localizedCopy() {
    return isSwedishUi() ? COPY.sv : COPY.en;
  }

  function isClearFiltersButton(button) {
    return ["clear filters", "rensa filter", "rensa filtren"]
      .includes(normalize(button.innerText || button.textContent || ""));
  }

  function findFeaturesLabel(input) {
    const container = input.closest(".ms-ComboBox-container")?.parentElement;
    return [...(container?.querySelectorAll("*") || [])]
      .find((element) => element.children.length === 0 && ["features", "funktioner"].includes(normalize(element.textContent.trim()))) || null;
  }

  function copyTextStyle(source, target) {
    if (!source || !target) return;
    const style = getComputedStyle(source);
    for (const property of ["fontFamily", "fontSize", "fontWeight", "lineHeight", "color", "letterSpacing"]) {
      target.style[property] = style[property];
    }
  }

  function roomRowText(row) {
    const primaryText = row.querySelector(".ms-Persona-primaryText")?.textContent?.trim();
    if (primaryText && ROOM_PATTERN.test(primaryText)) return primaryText;

    const accessibleText = row.getAttribute("aria-label") || "";
    if (ROOM_PATTERN.test(accessibleText)) return accessibleText;

    return row.innerText || row.textContent || "";
  }

  function rowsInList(list) {
    return [...list.querySelectorAll('[role="listitem"]')]
      .filter((row) => roomRowText(row).trim().length > 0);
  }

  function findRoomList(root) {
    return [...root.querySelectorAll('[role="list"]')]
      .map((list) => ({ list, rowCount: rowsInList(list).length }))
      .filter(({ rowCount }) => rowCount > 0)
      .sort((left, right) => right.rowCount - left.rowCount)[0]?.list || null;
  }

  function findRoomFinderContext() {
    const featureInputs = [...document.querySelectorAll("input[aria-label]")].filter((input) =>
      visible(input) && ["features", "funktioner"].includes(normalize(input.getAttribute("aria-label") || "")));

    for (const featuresInput of featureInputs) {
      const buildingInput = [...(featuresInput.closest('[role="dialog"]') || document).querySelectorAll("input[aria-label]")]
        .find((input) => visible(input) && ["select a building", "building", "välj byggnad", "välj en byggnad", "byggnad"]
          .includes(normalize(input.getAttribute("aria-label") || "")))
        || [...document.querySelectorAll("input[aria-label]")].find((input) => {
          if (!visible(input)) return false;
          if (!["select a building", "building", "välj byggnad", "välj en byggnad", "byggnad"]
            .includes(normalize(input.getAttribute("aria-label") || ""))) return false;
          let ancestor = featuresInput.parentElement;
          while (ancestor && !ancestor.contains(input)) ancestor = ancestor.parentElement;
          return Boolean(ancestor);
        });
      if (!buildingInput) continue;

      let roomFinderRoot = featuresInput.parentElement;
      while (roomFinderRoot && roomFinderRoot !== document.body) {
        const text = roomFinderRoot.innerText || "";
        if (roomFinderRoot.contains(buildingInput)
          && /(Room Finder|Rumssökaren?|Sök rum)/i.test(text)
          && findRoomList(roomFinderRoot)
          && visible(roomFinderRoot)) break;
        roomFinderRoot = roomFinderRoot.parentElement;
      }
      if (!roomFinderRoot || roomFinderRoot === document.body) continue;

      let filterContainer = featuresInput.parentElement;
      while (filterContainer && filterContainer !== roomFinderRoot) {
        if (filterContainer.contains(buildingInput) && /(Clear filters|Rensa filter)/i.test(filterContainer.innerText || "")) break;
        filterContainer = filterContainer.parentElement;
      }
      if (!filterContainer || filterContainer === roomFinderRoot) {
        filterContainer = featuresInput.parentElement;
        while (filterContainer && filterContainer !== roomFinderRoot && !filterContainer.contains(buildingInput)) {
          filterContainer = filterContainer.parentElement;
        }
      }

      const resultList = findRoomList(roomFinderRoot);

      if (filterContainer && filterContainer !== roomFinderRoot && resultList) {
        return {
          dialog: roomFinderRoot,
          filterContainer,
          resultList,
          featuresInput,
          featuresLabel: findFeaturesLabel(featuresInput)
        };
      }
    }

    return null;
  }

  function findRoomRows(resultList) {
    if (!resultList) return [];
    return rowsInList(resultList);
  }

  function rowMetadata(row) {
    const text = roomRowText(row);
    const annotations = [row, ...row.querySelectorAll("[aria-label], [title]")]
      .flatMap((element) => [element.getAttribute("aria-label"), element.getAttribute("title")])
      .filter(Boolean)
      .join(" ");
    const fullText = `${text} ${annotations}`;
    const available = /\b(available|ledig|free)\b/i.test(fullText)
      && !/\b(unavailable|not available|busy|occupied|upptagen|booked|conflict)\b/i.test(fullText);
    return {
      text,
      available,
      normalized: normalize(fullText)
    };
  }

  function createPanel(container, nativeFeatureInput, nativeFeaturesLabel) {
    const copy = localizedCopy();
    let panel = document.getElementById(PANEL_ID);
    if (panel && panel.dataset.layout !== "inline") {
      panel.remove();
      panel = null;
    }

    if (!panel) {
      panel = document.createElement("div");
      panel.id = PANEL_ID;
      panel.dataset.layout = "inline";
      panel.innerHTML = `
      <div class="orff-controls">
        <div class="orff-filter-field orff-field-wide">
          <span class="orff-filter-label">${copy.extendedFilter}</span>
          <div class="orff-dropdown">
            <div class="orff-native-combo">
              <input type="text" class="orff-select-input" aria-label="${copy.extendedFilter}" aria-controls="orff-filter-options" aria-haspopup="listbox" aria-expanded="false" placeholder="${copy.selectFilter}" readonly />
              <button type="button" class="orff-select-trigger" aria-label="${copy.selectFilter}" aria-controls="orff-filter-options" aria-expanded="false">
                <span class="orff-select-chevron" aria-hidden="true"></span>
              </button>
            </div>
            <div id="orff-filter-options" class="orff-options" role="listbox" aria-label="${copy.extendedFilter}" aria-multiselectable="true" hidden>
              <div class="orff-menu-main">
                <label class="orff-option" role="option" aria-selected="false"><input class="orff-option-check" type="checkbox" data-filter="onlyAvailable" /><span class="orff-option-text">${copy.onlyAvailable}</span></label>
                <div class="orff-configured-options"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="orff-count orff-field-wide" aria-live="polite"></div>
      </div>`;

      panel.querySelectorAll("[data-filter]").forEach((input) => {
        input.checked = settings[input.dataset.filter];
        input.closest('[role="option"]').setAttribute("aria-selected", String(input.checked));
      });

      const nativeInput = nativeFeatureInput;
      const nativeCombo = nativeInput?.closest(".ms-ComboBox");
      const nativeContainer = nativeInput?.closest(".ms-ComboBox-container");
      const nativeCaret = nativeCombo?.querySelector("button");
      const dropdown = panel.querySelector(".orff-dropdown");
      const combo = panel.querySelector(".orff-native-combo");
      const selectInput = panel.querySelector(".orff-select-input");
      const trigger = panel.querySelector(".orff-select-trigger");
      const options = panel.querySelector(".orff-options");
      if (nativeContainer) dropdown.className = `${nativeContainer.className} orff-dropdown orff-native-container`;
      if (nativeCombo) combo.className = `${nativeCombo.className} orff-native-combo`;
      if (nativeInput) selectInput.className = `${nativeInput.className} orff-select-input`;
      if (nativeCaret) {
        trigger.className = `${nativeCaret.className} orff-select-trigger`;
        trigger.innerHTML = nativeCaret.innerHTML;
      }
      if (nativeInput) {
        const inputStyle = getComputedStyle(nativeInput);
        const rgb = inputStyle.color.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [0, 0, 0];
        const isDark = rgb.reduce((sum, channel) => sum + channel, 0) / 3 > 127;
        panel.dataset.theme = isDark ? "dark" : "light";
      }

      const toggleMenu = () => {
        options.hidden = !options.hidden;
        const expanded = String(!options.hidden);
        trigger.setAttribute("aria-expanded", expanded);
        selectInput.setAttribute("aria-expanded", expanded);
      };
      trigger.addEventListener("click", toggleMenu);
      selectInput.addEventListener("click", toggleMenu);

      panel.addEventListener("change", (event) => {
        const input = event.target.closest("input[data-filter], input[data-filter-id]");
        if (!input) return;
        if (input.dataset.filter) settings[input.dataset.filter] = input.checked;
        if (input.dataset.filterId) settings.activeFilters[input.dataset.filterId] = input.checked;
        input.closest('[role="option"]').setAttribute("aria-selected", String(input.checked));
        updateSelectLabel(panel);
        applyFilters();
      });
      updateSelectLabel(panel);
    }

    if (panel.parentElement !== container) container.append(panel);
    renderConfiguredOptions(panel);
    copyTextStyle(nativeFeaturesLabel, panel.querySelector(".orff-filter-label"));
    copyTextStyle(nativeFeaturesLabel, panel.querySelector(".orff-count"));
    return panel;
  }

  function renderConfiguredOptions(panel) {
    const list = panel.querySelector(".orff-configured-options");
    const signature = JSON.stringify(searchConfig.filters);
    if (panel.dataset.filterSignature === signature) return;
    list.replaceChildren();

    for (const filter of searchConfig.filters) {
      const label = document.createElement("label");
      label.className = "orff-option orff-configured-option";
      label.setAttribute("role", "option");

      const input = document.createElement("input");
      input.className = "orff-option-check";
      input.type = "checkbox";
      input.dataset.filterId = filter.id;
      input.checked = Boolean(settings.activeFilters[filter.id]);
      label.setAttribute("aria-selected", String(input.checked));

      const text = document.createElement("span");
      text.className = "orff-option-text";
      text.textContent = filter.name;

      label.append(input, text);
      list.append(label);
    }
    panel.dataset.filterSignature = signature;
    updateSelectLabel(panel);
  }

  function updateSelectLabel(panel) {
    const selected = [...panel.querySelectorAll("[data-filter]:checked, [data-filter-id]:checked")]
      .map((input) => input.nextElementSibling.textContent.trim());
    const selectInput = panel.querySelector(".orff-select-input");
    if (selectInput) {
      selectInput.value = selected.length ? selected.join(", ") : "";
      selectInput.placeholder = localizedCopy().selectFilter;
    }
  }

  function resetCustomFilters() {
    settings = { ...DEFAULTS, activeFilters: {} };
    const panel = document.getElementById(PANEL_ID);
    if (panel) {
      panel.querySelectorAll("[data-filter], [data-filter-id]").forEach((input) => {
        input.checked = false;
        input.closest('[role="option"]').setAttribute("aria-selected", "false");
      });
      updateSelectLabel(panel);
      const options = panel.querySelector(".orff-options");
      const trigger = panel.querySelector(".orff-select-trigger");
      const selectInput = panel.querySelector(".orff-select-input");
      if (options) options.hidden = true;
      trigger?.setAttribute("aria-expanded", "false");
      selectInput?.setAttribute("aria-expanded", "false");
    }
    applyFilters();
  }

  function syncClearButton(context) {
    const button = [...context.filterContainer.querySelectorAll("button")]
      .find(isClearFiltersButton);
    if (!button) return;

    const customFiltersActive = filtersEnabled
      && (settings.onlyAvailable || searchConfig.filters.some((filter) => settings.activeFilters[filter.id]));
    if (customFiltersActive) {
      if (!clearButtonStates.has(button)) {
        clearButtonStates.set(button, {
          disabled: button.disabled,
          ariaDisabled: button.getAttribute("aria-disabled"),
          disabledClass: button.classList.contains("is-disabled"),
          focusable: button.getAttribute("data-is-focusable"),
          clearForeground: button.style.getPropertyValue("--orff-clear-foreground"),
          clearForegroundPriority: button.style.getPropertyPriority("--orff-clear-foreground")
        });
      }
      const activate = () => {
        if (button.disabled) button.disabled = false;
        if (button.hasAttribute("disabled")) button.removeAttribute("disabled");
        if (button.hasAttribute("aria-disabled")) button.removeAttribute("aria-disabled");
        if (button.getAttribute("data-is-focusable") !== "true") button.setAttribute("data-is-focusable", "true");
        if (button.classList.contains("is-disabled")) button.classList.remove("is-disabled");
        if (!button.classList.contains("orff-clear-active")) button.classList.add("orff-clear-active");
        if (context.featuresLabel) {
          button.style.setProperty("--orff-clear-foreground", getComputedStyle(context.featuresLabel).color);
        }
      };
      activate();
      if (observedClearButton !== button) {
        clearButtonObserver?.disconnect();
        observedClearButton = button;
        clearButtonObserver = new MutationObserver(activate);
        clearButtonObserver.observe(button, { attributes: true, attributeFilter: ["disabled", "aria-disabled", "data-is-focusable", "class"] });
      }
    } else if (!clearClickInProgress && clearButtonStates.has(button)) {
      const previous = clearButtonStates.get(button);
      if (observedClearButton === button) {
        clearButtonObserver?.disconnect();
        observedClearButton = null;
      }
      button.disabled = previous.disabled;
      if (previous.disabled) button.setAttribute("disabled", "");
      else button.removeAttribute("disabled");
      if (previous.ariaDisabled === null) button.removeAttribute("aria-disabled");
      else button.setAttribute("aria-disabled", previous.ariaDisabled);
      if (previous.focusable === null) button.removeAttribute("data-is-focusable");
      else button.setAttribute("data-is-focusable", previous.focusable);
      if (previous.clearForeground) {
        button.style.setProperty("--orff-clear-foreground", previous.clearForeground, previous.clearForegroundPriority);
      } else {
        button.style.removeProperty("--orff-clear-foreground");
      }
      button.classList.toggle("is-disabled", previous.disabledClass);
      button.classList.remove("orff-clear-active");
      clearButtonStates.delete(button);
    }
  }

  function applyFilters() {
    const context = findRoomFinderContext();
    if (!context) {
      document.getElementById(PANEL_ID)?.remove();
      return;
    }

    if (filtersEnabled === undefined) return;
    if (!filtersEnabled) {
      for (const row of findRoomRows(context.resultList)) {
        row.classList.remove("orff-room-result", "orff-filtered-out");
      }
      syncClearButton(context);
      document.getElementById(PANEL_ID)?.remove();
      return;
    }

    const panel = createPanel(context.filterContainer, context.featuresInput, context.featuresLabel);
    syncClearButton(context);
    let total = 0;
    let shown = 0;

    for (const row of findRoomRows(context.resultList)) {
      const metadata = rowMetadata(row);
      const matchesConfiguredFilters = searchConfig.filters.every((filter) => {
        if (!settings.activeFilters[filter.id]) return true;
        if (!filter.terms.length) return true;
        const matches = matchesTerms(metadata.normalized, filter.terms.map(normalize));
        return filter.mode === "exclude" ? !matches : matches;
      });
      const shouldHide = (settings.onlyAvailable && !metadata.available) || !matchesConfiguredFilters;

      row.classList.toggle("orff-room-result", searchConfig.wrapLongNames);
      row.classList.toggle("orff-filtered-out", shouldHide);
      total += 1;
      if (!shouldHide) shown += 1;
    }

    const counter = panel.querySelector(".orff-count");
    const copy = localizedCopy();
    const countText = total ? copy.roomCount(shown, total) : copy.waiting;
    if (counter && counter.textContent !== countText) counter.textContent = countText;
  }

  function scheduleUpdate() {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(applyFilters, 180);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "orff-set-enabled") return;
    filtersEnabled = Boolean(message.enabled);
    applyFilters();
  });

  chrome.storage.local.get([ENABLED_KEY, CONFIG_KEY], (stored) => {
    filtersEnabled = stored[ENABLED_KEY] !== false;
    searchConfig = normalizeSearchConfig(stored[CONFIG_KEY] || DEFAULT_CONFIG);
    const validFilterIds = new Set(searchConfig.filters.map((filter) => filter.id));
    settings.activeFilters = Object.fromEntries(Object.entries(settings.activeFilters)
      .filter(([id]) => validFilterIds.has(id)));
    applyFilters();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[CONFIG_KEY]) return;
    searchConfig = normalizeSearchConfig(changes[CONFIG_KEY].newValue || DEFAULT_CONFIG);
    const validFilterIds = new Set(searchConfig.filters.map((filter) => filter.id));
    settings.activeFilters = Object.fromEntries(Object.entries(settings.activeFilters)
      .filter(([id]) => validFilterIds.has(id)));
    applyFilters();
  });

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : event.target.parentElement;
    const button = target?.closest("button");
    if (!button || !isClearFiltersButton(button)) return;

    const context = findRoomFinderContext();
    if (!context?.filterContainer.contains(button)) return;

    clearClickInProgress = true;
    resetCustomFilters();
    setTimeout(() => {
      clearClickInProgress = false;
      const previous = clearButtonStates.get(button);
      if (previous?.clearForeground) {
        button.style.setProperty("--orff-clear-foreground", previous.clearForeground, previous.clearForegroundPriority);
      } else {
        button.style.removeProperty("--orff-clear-foreground");
      }
      clearButtonStates.delete(button);
      if (observedClearButton === button) {
        clearButtonObserver?.disconnect();
        observedClearButton = null;
      }
      if (!button.isConnected) return;
      button.disabled = true;
      button.setAttribute("disabled", "");
      button.setAttribute("aria-disabled", "true");
      button.setAttribute("data-is-focusable", "false");
      button.classList.add("is-disabled");
      button.classList.remove("orff-clear-active");
    }, 0);
  }, true);

  document.addEventListener("click", (event) => {
    const panel = document.getElementById(PANEL_ID);
    if (!panel || panel.contains(event.target)) return;
    const options = panel.querySelector(".orff-options");
    const trigger = panel.querySelector(".orff-select-trigger");
    if (options && trigger) {
      options.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const panel = document.getElementById(PANEL_ID);
    const options = panel?.querySelector(".orff-options");
    const trigger = panel?.querySelector(".orff-select-trigger");
    if (options && trigger) {
      options.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      trigger.focus();
    }
  });

  const observer = new MutationObserver((mutations) => {
    const panel = document.getElementById(PANEL_ID);
    if (mutations.some((mutation) => {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      return !panel?.contains(target);
    })) scheduleUpdate();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();