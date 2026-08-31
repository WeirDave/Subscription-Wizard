(function () {
  "use strict";

  const manifest = browser.runtime.getManifest();
  document.getElementById("footer").textContent = `v${manifest.version}`;

  async function loadStatus() {
    const personal = (await browser.storage.local.get("personal_scan")).personal_scan;
    const business = (await browser.storage.local.get("business_scan")).business_scan;

    const pEl = document.getElementById("personal-status");
    if (personal && personal.items && personal.items.length) {
      const date = new Date(personal.scannedAt);
      const ago = timeAgo(date);
      pEl.textContent = `${personal.items.length} items · ${ago}`;
      pEl.className = "status-value has-data";
    } else {
      pEl.textContent = "Not scanned";
      pEl.className = "status-value no-data";
    }

    const bEl = document.getElementById("business-status");
    if (business && business.items && business.items.length) {
      const date = new Date(business.scannedAt);
      const ago = timeAgo(date);
      bEl.textContent = `${business.items.length} items · ${ago}`;
      bEl.className = "status-value has-data";
    } else {
      bEl.textContent = "Not scanned";
      bEl.className = "status-value no-data";
    }
  }

  function timeAgo(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "yesterday";
    if (days < 30) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  document.getElementById("go-sns").addEventListener("click", () => {
    browser.tabs.create({ url: "https://www.amazon.com/auto-deliveries" });
    window.close();
  });

  document.getElementById("go-settings").addEventListener("click", () => {
    browser.runtime.openOptionsPage();
    window.close();
  });

  document.getElementById("go-github").addEventListener("click", () => {
    browser.tabs.create({
      url: "https://addons.mozilla.org/en-US/firefox/addon/subscription-wizard/reviews/",
    });
    window.close();
  });

  loadStatus();
})();
