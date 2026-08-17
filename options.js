(function () {
  "use strict";

  const manifest = browser.runtime.getManifest();
  document.getElementById("version-info").textContent =
    `${manifest.name} v${manifest.version}`;

  async function loadStatus() {
    const personal = (await browser.storage.local.get("personal_scan")).personal_scan;
    const business = (await browser.storage.local.get("business_scan")).business_scan;
    const pEl = document.getElementById("personal-status");
    if (personal && personal.items.length) {
      pEl.textContent = `${personal.items.length} items — ${new Date(personal.scannedAt).toLocaleString()}`;
      pEl.className = "status-value has-data";
    } else {
      pEl.textContent = "No data";
      pEl.className = "status-value no-data";
    }

    const bEl = document.getElementById("business-status");
    if (business && business.items.length) {
      bEl.textContent = `${business.items.length} items — ${new Date(business.scannedAt).toLocaleString()}`;
      bEl.className = "status-value has-data";
    } else {
      bEl.textContent = "No data";
      bEl.className = "status-value no-data";
    }

  }

  document.getElementById("reset-all").addEventListener("click", async () => {
    if (!confirm("Clear ALL saved data? This cannot be undone.")) return;
    await browser.storage.local.remove(["personal_scan", "business_scan"]);
    alert("All data cleared.");
    loadStatus();
  });

  document.getElementById("reset-personal").addEventListener("click", async () => {
    if (!confirm("Clear personal scan data?")) return;
    await browser.storage.local.remove(["personal_scan"]);
    alert("Personal scan cleared.");
    loadStatus();
  });

  document.getElementById("reset-business").addEventListener("click", async () => {
    if (!confirm("Clear business scan data?")) return;
    await browser.storage.local.remove(["business_scan"]);
    alert("Business scan cleared.");
    loadStatus();
  });

  loadStatus();
})();
