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

  // ── Help & Diagnostics ──
  async function gatherDiagnostics() {
    const lines = [];
    lines.push(`${manifest.name} v${manifest.version}`);
    lines.push(`Browser    : ${navigator.userAgent}`);
    lines.push(`Platform   : ${navigator.platform || 'unknown'}`);

    const personal = (await browser.storage.local.get("personal_scan")).personal_scan;
    const business = (await browser.storage.local.get("business_scan")).business_scan;
    lines.push(`Personal   : ${personal && personal.items ? personal.items.length + ' items' : 'No data'}`);
    lines.push(`Business   : ${business && business.items ? business.items.length + ' items' : 'No data'}`);

    if (personal && personal.scannedAt)
      lines.push(`Last scan  : Personal ${new Date(personal.scannedAt).toLocaleString()}`);
    if (business && business.scannedAt)
      lines.push(`Last scan  : Business ${new Date(business.scannedAt).toLocaleString()}`);

    try {
      const bytesUsed = await browser.storage.local.getBytesInUse();
      lines.push(`Storage    : ${(bytesUsed / 1024).toFixed(1)} KB used`);
    } catch (e) {
      lines.push(`Storage    : unable to read`);
    }

    return lines.join('\n');
  }

  gatherDiagnostics().then(info => {
    document.getElementById("diag-block").textContent = info;
  });

  document.getElementById("copy-diag").addEventListener("click", async () => {
    const info = await gatherDiagnostics();
    try {
      await navigator.clipboard.writeText(info);
      document.getElementById("diag-status").textContent = "Copied to clipboard!";
    } catch (e) {
      document.getElementById("diag-status").textContent = "Copy failed — select and copy manually.";
    }
  });

  document.getElementById("open-issue").addEventListener("click", async () => {
    const info = await gatherDiagnostics();
    const env = encodeURIComponent(info);
    const url = `https://github.com/WeirDave/Subscription-Wizard/issues/new?template=bug_report.yml&environment=${env}`;
    window.open(url, "_blank");
  });

  loadStatus();
})();
