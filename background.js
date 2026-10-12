const ENABLED_KEY = "orffFiltersEnabled";

async function updateAction(enabled) {
  await chrome.action.setIcon({
    path: {
      16: "room-filter-16.png",
      32: "room-filter-32.png"
    }
  });
  await chrome.action.setTitle({ title: `Outlook + 3 room filters: ${enabled ? "On" : "Off"}` });
}

async function initializeAction() {
  const stored = await chrome.storage.local.get(ENABLED_KEY);
  const enabled = stored[ENABLED_KEY] !== false;
  if (stored[ENABLED_KEY] === undefined) {
    await chrome.storage.local.set({ [ENABLED_KEY]: true });
  }
  await updateAction(enabled);
}

chrome.runtime.onInstalled.addListener(initializeAction);
chrome.runtime.onStartup.addListener(initializeAction);
initializeAction();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[ENABLED_KEY]) return;
  updateAction(changes[ENABLED_KEY].newValue !== false);
});