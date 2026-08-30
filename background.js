browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    browser.tabs.create({ url: browser.runtime.getURL("welcome.html") });
  } else if (details.reason === "update") {
    const prev = details.previousVersion;
    const curr = browser.runtime.getManifest().version;
    if (prev && prev !== curr) {
      browser.storage.local.set({ _updateNotice: { from: prev, to: curr } });
    }
  }
});
