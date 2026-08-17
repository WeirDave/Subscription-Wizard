(function () {
  "use strict";

  const FETCH_DELAY_MS = 1200;

  function safeSetHTML(el, html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    el.replaceChildren(...doc.body.childNodes);
  }

  // ── Utilities ──

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function parsePriceText(text) {
    if (!text) return null;
    const m = text.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/);
    if (!m) return null;
    return parseFloat(m[1].replace(",", ""));
  }

  function deliveriesPerYear(frequency) {
    const m = frequency.match(/every\s+(\d+)\s+month/i);
    if (!m) return 0;
    return 12 / parseInt(m[1], 10);
  }

  function fmt(n) {
    if (n == null) return "—";
    return "$" + n.toFixed(2);
  }

  // ── Page Detection ──

  function isSubscriptionPage() {
    const url = location.href.toLowerCase();
    return (
      url.includes("subscribe-and-save") ||
      url.includes("auto-deliveries") ||
      url.includes("subscribeandsave") ||
      document.querySelectorAll("[data-edit-url]").length > 0
    );
  }

  function detectAccountType() {
    const nav =
      (document.getElementById("nav-link-accountList")?.textContent || "") +
      (document.querySelector(".nav-line-1-container")?.textContent || "") +
      (document.querySelector("#nav-flyout-ya-signin")?.textContent || "");
    if (/business/i.test(nav)) return "business";
    const banner = document.querySelector(".ab-logo, #ab-nav-bar, [class*='ab-']");
    if (banner) return "business";
    return "personal";
  }

  // ── Storage ──

  const store = {
    async get(key) {
      if (typeof browser !== "undefined" && browser.storage) {
        const r = await browser.storage.local.get(key);
        return r[key] || null;
      }
      const v = localStorage.getItem("ast_" + key);
      return v ? JSON.parse(v) : null;
    },
    async set(key, value) {
      if (typeof browser !== "undefined" && browser.storage) {
        await browser.storage.local.set({ [key]: value });
      } else {
        localStorage.setItem("ast_" + key, JSON.stringify(value));
      }
    },
  };

  // ── Scroll to Load All ──

  async function scrollToLoadAll(statusFn) {
    let lastCount = 0;
    let stableRounds = 0;
    while (stableRounds < 3) {
      window.scrollTo(0, document.body.scrollHeight);

      const subsSection = document.querySelector(".subscription-section, #subscriptions-container, [data-edit-url]")?.closest("section, .a-section, div[class*='subscription']") || document.body;
      const showMore = [...subsSection.querySelectorAll("button, [role='button'], span, div")].find(
        (el) => /show\s*more|see\s*more|load\s*more|view\s*all/i.test(el.textContent.trim())
          && el.offsetParent !== null
          && el.tagName !== "A"
          && !el.closest("[class*='recommend'], [class*='carousel'], [class*='sims-']")
      );
      if (showMore) {
        showMore.click();
        await sleep(1500);
      }

      await sleep(800);
      const count = document.querySelectorAll("[data-edit-url]").length;
      if (statusFn) statusFn(`Loading items... (${count} found)`);
      if (count === lastCount) stableRounds++;
      else {
        stableRounds = 0;
        lastCount = count;
      }
    }
    window.scrollTo(0, 0);
  }

  // ── Scrape Subscriptions from Page ──

  function scrapeSubscriptions() {
    const cards = [...document.querySelectorAll("[data-edit-url]")];
    return cards.map((card) => {
      const params = new URLSearchParams(
        card.dataset.editUrl.split("?")[1]
      );
      const title =
        card.querySelector(".a-truncate-full")?.textContent.trim() ?? "";
      const small = [...card.querySelectorAll("span.a-size-small")];
      const nextDelivery =
        small
          .find((s) => s.textContent.includes("Next delivery"))
          ?.textContent.replace(/^Next delivery:\s*/, "")
          .trim() ?? "";
      const frequency =
        small
          .find((s) => s.textContent.includes("unit"))
          ?.textContent.trim() ?? "";
      const allSmall = [...card.querySelectorAll("span.a-size-small, span.a-size-base, span.a-color-secondary")];
      const addressEl = allSmall.find((s) => /deliver\s*to|ship\s*to/i.test(s.textContent));
      const address = addressEl
        ? addressEl.textContent.replace(/^(deliver|ship)\s*to:?\s*/i, "").trim()
        : "";
      const asin = params.get("subAsin") ?? "";
      const subscriptionId = params.get("subscriptionId") ?? "";
      return {
        Title: title,
        ASIN: asin,
        SubscriptionID: subscriptionId,
        NextDelivery: nextDelivery,
        Frequency: frequency,
        Address: address,
        ProductURL: asin ? `https://www.amazon.com/dp/${asin}` : "",
      };
    });
  }

  // ── Fetch Prices from Product Page ──

  async function fetchProductPrices(asin) {
    try {
      const resp = await fetch(`https://www.amazon.com/dp/${asin}`, {
        credentials: "include",
        headers: { Accept: "text/html" },
      });
      if (!resp.ok) return { snsPrice: null, onetimePrice: null };
      const html = await resp.text();
      const doc = new DOMParser().parseFromString(html, "text/html");

      let snsPrice = null;
      let onetimePrice = null;

      const snsSels = [
        "#sns-tiered-price .a-offscreen",
        "#sns-base-price .a-offscreen",
        "#subscriptionPrice .a-offscreen",
        "#snsAccordionRowMiddle .a-offscreen",
        "#newAccordionRow_1 .a-price .a-offscreen",
        "#snsPriceBlock .a-offscreen",
        "#sns-price-block .a-offscreen",
      ];
      for (const sel of snsSels) {
        const el = doc.querySelector(sel);
        if (el) {
          snsPrice = parsePriceText(el.textContent);
          if (snsPrice) break;
        }
      }

      if (!snsPrice) {
        const sections = doc.querySelectorAll(
          "[id*='sns'], [id*='accordion'], [id*='subscribe'], [class*='sns']"
        );
        for (const sec of sections) {
          const offscreen = sec.querySelector(".a-offscreen");
          if (offscreen) {
            const p = parsePriceText(offscreen.textContent);
            if (p) {
              snsPrice = p;
              break;
            }
          }
        }
      }

      if (!snsPrice) {
        const walker = doc.createTreeWalker(
          doc.body,
          NodeFilter.SHOW_TEXT,
          null
        );
        while (walker.nextNode()) {
          const t = walker.currentNode.textContent;
          if (/subscribe\s*&?\s*save/i.test(t)) {
            let ancestor = walker.currentNode.parentElement;
            for (let i = 0; i < 6 && ancestor; i++) {
              const priceEl = ancestor.querySelector(".a-offscreen");
              if (priceEl) {
                snsPrice = parsePriceText(priceEl.textContent);
                if (snsPrice) break;
              }
              ancestor = ancestor.parentElement;
            }
            if (snsPrice) break;
          }
        }
      }

      const otpSels = [
        "#corePrice_feature_div .a-offscreen",
        "#newBuyBoxPrice .a-offscreen",
        "#price_inside_buybox",
        "#priceblock_ourprice",
        "#newAccordionRow_0 .a-price .a-offscreen",
        "#oneTimeBuyBox .a-offscreen",
        ".a-price[data-a-size='xl'] .a-offscreen",
        "#tp_price_block_total_price_ww .a-offscreen",
      ];
      for (const sel of otpSels) {
        const el = doc.querySelector(sel);
        if (el) {
          onetimePrice = parsePriceText(el.textContent);
          if (onetimePrice) break;
        }
      }

      return { snsPrice, onetimePrice };
    } catch (e) {
      console.warn(`AST: Failed to fetch prices for ${asin}:`, e);
      return { snsPrice: null, onetimePrice: null };
    }
  }

  // ── CSV ──

  function toCSV(rows) {
    if (!rows.length) return "";
    const headers = Object.keys(rows[0]);
    return [
      headers.join(","),
      ...rows.map((r) =>
        headers
          .map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ].join("\r\n");
  }

  function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ── Handlers ──

  async function handleExport() {
    const btn = document.getElementById("ast-export-csv");
    const account = detectAccountType();
    const existingScan = await store.get(account + "_scan");

    if (existingScan && existingScan.items.length) {
      setButtonState(btn, "Exporting from scan data...", true);
      const rows = existingScan.items.map((item) => ({
        Title: item.title,
        ASIN: item.asin,
        Frequency: item.frequency,
        NextDelivery: item.nextDelivery,
        Address: item.address || "",
        SnSPrice: item.snsPrice != null ? fmt(item.snsPrice) : "",
        OneTimePrice: item.onetimePrice != null ? fmt(item.onetimePrice) : "",
        PreviousSnSPrice: item.previousSnsPrice != null ? fmt(item.previousSnsPrice) : "",
        PriceChange: item.priceChange != null ? (item.priceChange >= 0 ? "+" : "") + fmt(item.priceChange) : "",
      }));
      const date = new Date().toISOString().slice(0, 10);
      const csv = toCSV(rows);
      downloadCSV(csv, `SubscriptionWizard_Export_${date}.csv`);
      console.log(`Exported ${rows.length} subscriptions from saved scan (${existingScan.scannedAt}).`);
      console.table(rows);
    } else {
      setButtonState(btn, "Loading all items...", true);
      await scrollToLoadAll((msg) => setButtonState(btn, msg, true));

      const rows = scrapeSubscriptions();
      if (!rows.length) {
        alert("No subscriptions found.\n\nClick Scan Prices first, then Export CSV.");
        setButtonState(btn, "Export CSV", false);
        return;
      }

      setButtonState(btn, `Fetching prices (0/${rows.length})...`, true);

      for (let i = 0; i < rows.length; i++) {
        if (rows[i].ASIN) {
          const prices = await fetchProductPrices(rows[i].ASIN);
          rows[i].SnSPrice = prices.snsPrice != null ? fmt(prices.snsPrice) : "";
          rows[i].OneTimePrice =
            prices.onetimePrice != null ? fmt(prices.onetimePrice) : "";
        } else {
          rows[i].SnSPrice = "";
          rows[i].OneTimePrice = "";
        }
        setButtonState(
          btn,
          `Fetching prices (${i + 1}/${rows.length})...`,
          true
        );
        if (i < rows.length - 1) await sleep(FETCH_DELAY_MS);
      }

      const date = new Date().toISOString().slice(0, 10);
      const csv = toCSV(rows);
      downloadCSV(csv, `SubscriptionWizard_Export_${date}.csv`);
      console.log(`Exported ${rows.length} subscriptions with live prices.`);
      console.table(rows);
    }

    setButtonState(btn, `Exported ${rows.length} items`, true);
    setTimeout(() => setButtonState(btn, "Export CSV", false), 3000);
  }

  async function handleScan() {
    const btn = document.getElementById("ast-scan-prices");
    const account = detectAccountType();

    if (document.querySelectorAll("[data-edit-url]").length === 0) {
      setButtonState(btn, "Looking for subscriptions...", true);
      await sleep(2000);
      if (document.querySelectorAll("[data-edit-url]").length === 0) {
        if (location.href.includes("/manager/viewsubscriptions")) {
          alert("No subscriptions found on this account.\n\nIf you expected subscriptions, try refreshing the page.");
          setButtonState(btn, "Scan Prices", false);
          return;
        }
        setButtonState(btn, "Redirecting to subscriptions...", true);
        window.location.href =
          "https://www.amazon.com/gp/subscribe-and-save/manager/viewsubscriptions#ast-scan";
        return;
      }
    }

    setButtonState(btn, "Loading all items...", true);
    await scrollToLoadAll((msg) => setButtonState(btn, msg, true));

    let subs = scrapeSubscriptions();
    const otherKey = account === "business" ? "personal_scan" : "business_scan";
    const otherScan = await store.get(otherKey);

    if (!subs.length && otherScan && otherScan.items.length) {
      subs = otherScan.items.map((item) => ({
        Title: item.title,
        ASIN: item.asin,
        Frequency: item.frequency,
        NextDelivery: item.nextDelivery,
        Address: item.address || "",
      }));
      console.log(`AST: No subscriptions on page — using ${otherScan.items.length} ASINs from ${otherKey}`);
    }

    if (!subs.length && (!otherScan || !otherScan.items.length)) {
      alert(
        "No subscriptions found on this page and no other account scan saved.\n\n" +
        "Scan your personal account first, then switch to business and scan again."
      );
      setButtonState(btn, "Scan Prices", false);
      return;
    }

    subs.forEach((s) => (s._subscribed = true));
    const pageAsins = new Set(subs.map((s) => s.ASIN));
    let mergedFromOther = 0;
    if (otherScan && otherScan.items.length) {
      for (const item of otherScan.items) {
        if (item.asin && !pageAsins.has(item.asin)) {
          subs.push({
            Title: item.title,
            ASIN: item.asin,
            Frequency: item.frequency,
            NextDelivery: item.nextDelivery,
            Address: item.address || "",
            _subscribed: false,
          });
          pageAsins.add(item.asin);
          mergedFromOther++;
        }
      }
      if (mergedFromOther) {
        console.log(`AST: Merged ${mergedFromOther} additional ASINs from ${otherKey}`);
      }
    }

    const prevScan = await store.get(account + "_scan");
    const prevPrices = new Map();
    if (prevScan && prevScan.items) {
      for (const item of prevScan.items) {
        if (item.asin && item.snsPrice != null) prevPrices.set(item.asin, item.snsPrice);
      }
    }

    const results = [];
    for (let i = 0; i < subs.length; i++) {
      const sub = subs[i];
      setButtonState(
        btn,
        `Scanning ${account} (${i + 1}/${subs.length})...`,
        true
      );
      let prices = { snsPrice: null, onetimePrice: null };
      if (sub.ASIN) {
        prices = await fetchProductPrices(sub.ASIN);
      }
      const prev = prevPrices.get(sub.ASIN);
      const priceChange = (prices.snsPrice != null && prev != null) ? prices.snsPrice - prev : null;
      results.push({
        title: sub.Title,
        asin: sub.ASIN,
        frequency: sub.Frequency,
        nextDelivery: sub.NextDelivery,
        address: sub.Address || "",
        snsPrice: prices.snsPrice,
        onetimePrice: prices.onetimePrice,
        previousSnsPrice: prev ?? null,
        priceChange,
        subscribed: !!sub._subscribed,
      });
      if (i < subs.length - 1) await sleep(FETCH_DELAY_MS);
    }

    const scanData = {
      account,
      scannedAt: new Date().toISOString(),
      items: results,
    };
    await store.set(account + "_scan", scanData);

    const priced = results.filter((r) => r.snsPrice != null).length;
    const mergedMsg = mergedFromOther ? `Also checked ${mergedFromOther} products from other account.\n` : "";
    const otherLabel = account === "business" ? "personal" : "business";

    console.log(`AST: ${account} scan complete`, results);
    console.table(results);

    let nextStep;
    if (!otherScan) {
      nextStep = `Switch to your ${otherLabel} account and scan again for a full comparison between the two accounts, then click Compare for the results.`;
    } else {
      const thisAsins = new Set(results.map((r) => r.asin));
      const otherAsins = new Set(otherScan.items.map((i) => i.asin));
      const otherMissing = results.filter((r) => !otherAsins.has(r.asin)).length;
      if (otherMissing > 0) {
        nextStep = `Your ${otherLabel} scan is missing prices for ${otherMissing} product(s). Switch to your ${otherLabel} account and scan again for a full comparison between the two accounts, then click Compare for the results.`;
      } else {
        nextStep = "Both sides are up to date — click Compare!";
      }
    }

    alert(
      `${account.charAt(0).toUpperCase() + account.slice(1)} scan complete!\n\n` +
      `Items scanned: ${results.length}\n` +
      `Prices found: ${priced}/${results.length}\n` +
      mergedMsg +
      `\nNext step: ${nextStep}`
    );

    setButtonState(btn, "Scan Prices", false);
    updateButtonStates();
  }

  async function handleCompare() {
    const personal = await store.get("personal_scan");
    const business = await store.get("business_scan");

    if (!personal && !business) {
      alert(
        "No scans found.\n\n" +
          "1. On your personal account, click 'Scan Prices'\n" +
          "2. Switch to your business account\n" +
          "3. Click 'Scan Prices' again\n" +
          "4. Then click 'Compare'"
      );
      return;
    }
    if (!personal) {
      alert(
        "Personal account scan missing.\n\nSwitch to your personal account and click 'Scan Prices'."
      );
      return;
    }
    if (!business) {
      alert(
        "Business account scan missing.\n\nSwitch to your business account and click 'Scan Prices'."
      );
      return;
    }

    showComparisonOverlay(personal, business);
  }

  // ── Comparison Overlay ──

  function showComparisonOverlay(personal, business) {
    let existing = document.getElementById("ast-compare-overlay");
    if (existing) existing.remove();

    const personalMap = new Map();
    personal.items.forEach((item) => {
      if (item.asin) personalMap.set(item.asin, item);
    });

    const businessMap = new Map();
    business.items.forEach((item) => {
      if (item.asin) businessMap.set(item.asin, item);
    });

    const allAsins = new Set([...personalMap.keys(), ...businessMap.keys()]);
    const rows = [];
    let personalCheaper = 0;
    let businessCheaper = 0;
    let samePrice = 0;
    let totalPersonalAnnual = 0;
    let totalBusinessAnnual = 0;
    let potentialSavings = 0;

    for (const asin of allAsins) {
      const p = personalMap.get(asin);
      const b = businessMap.get(asin);
      const title = (p || b).title;
      const frequency = (p || b).frequency;
      const perYear = deliveriesPerYear(frequency);
      const pPrice = p?.snsPrice;
      const bPrice = b?.snsPrice;

      let winner = "—";
      let diff = null;
      let annualDiff = null;

      if (pPrice != null && bPrice != null) {
        diff = bPrice - pPrice;
        annualDiff = diff * perYear;
        if (Math.abs(diff) < 0.01) {
          winner = "Same";
          samePrice++;
        } else if (pPrice < bPrice) {
          winner = "Personal";
          personalCheaper++;
          potentialSavings += Math.abs(annualDiff);
        } else {
          winner = "Business";
          businessCheaper++;
          potentialSavings += Math.abs(annualDiff);
        }
      } else if (pPrice != null) {
        winner = "Personal only";
      } else if (bPrice != null) {
        winner = "Business only";
      }

      if (pPrice != null) totalPersonalAnnual += pPrice * perYear;
      if (bPrice != null) totalBusinessAnnual += bPrice * perYear;

      rows.push({
        title,
        asin,
        frequency,
        perYear,
        pAddress: p?.address || "",
        bAddress: b?.address || "",
        pPrice,
        bPrice,
        pOtp: p?.onetimePrice,
        bOtp: b?.onetimePrice,
        diff,
        annualDiff,
        winner,
      });
    }

    rows.sort((a, b) => {
      if (a.annualDiff == null && b.annualDiff == null) return 0;
      if (a.annualDiff == null) return 1;
      if (b.annualDiff == null) return -1;
      return a.annualDiff - b.annualDiff;
    });

    const overlay = document.createElement("div");
    overlay.id = "ast-compare-overlay";

    const tableRows = rows
      .map((r) => {
        const rowClass =
          r.winner === "Personal"
            ? "ast-row-personal"
            : r.winner === "Business"
              ? "ast-row-business"
              : "";
        return `<tr class="${rowClass}">
        <td class="ast-td-title">${r.title}</td>
        <td class="ast-td-addr">${r.pAddress || "—"}</td>
        <td class="ast-td-addr">${r.bAddress || "—"}</td>
        <td class="ast-td-num">${fmt(r.pPrice)}</td>
        <td class="ast-td-num">${fmt(r.bPrice)}</td>
        <td class="ast-td-num">${r.diff != null ? (r.diff > 0 ? "+" : "") + fmt(r.diff).replace("$", "$") : "—"}</td>
        <td class="ast-td-num">${r.annualDiff != null ? (r.annualDiff > 0 ? "+" : "") + "$" + Math.abs(r.annualDiff).toFixed(2) + "/yr" : "—"}</td>
        <td class="ast-td-winner ast-winner-${r.winner.toLowerCase().replace(/\s+/g, "")}">${r.winner}</td>
      </tr>`;
      })
      .join("");

    const personalOnlyCount = rows.filter((r) => r.winner === "Personal only").length;
    const businessOnlyCount = rows.filter((r) => r.winner === "Business only").length;
    const comparedCount = rows.filter((r) => r.pPrice != null && r.bPrice != null).length;
    const currentAccount = detectAccountType();

    let coverageWarning = "";
    if (personalOnlyCount > 0 || businessOnlyCount > 0) {
      const parts = [];
      if (personalOnlyCount > 0) parts.push(`${personalOnlyCount} missing business prices`);
      if (businessOnlyCount > 0) parts.push(`${businessOnlyCount} missing personal prices`);
      coverageWarning = `
        <div class="ast-coverage-warning">
          ${parts.join(" &bull; ")} &mdash; scan the other account for full comparison
        </div>`;
    }

    safeSetHTML(overlay, `
      <div class="ast-overlay-backdrop"></div>
      <div class="ast-overlay-content">
        <div class="ast-overlay-header">
          <div style="display:flex;align-items:center;gap:12px;">
            <img src="${browser.runtime.getURL("icons/icon128.png")}" alt="SW" style="width:48px;height:48px;border-radius:8px;">
            <h2>Subscription Wizard Price Comparison</h2>
          </div>
          <button class="ast-close-btn">&times;</button>
        </div>
        <div class="ast-summary-bar">
          <div class="ast-stat ast-stat-personal">
            <span class="ast-stat-num">${personalCheaper}</span>
            <span class="ast-stat-label">Cheaper on Personal</span>
          </div>
          <div class="ast-stat ast-stat-business">
            <span class="ast-stat-num">${businessCheaper}</span>
            <span class="ast-stat-label">Cheaper on Business</span>
          </div>
          <div class="ast-stat ast-stat-same">
            <span class="ast-stat-num">${samePrice}</span>
            <span class="ast-stat-label">Same Price</span>
          </div>
          <div class="ast-stat ast-stat-savings">
            <span class="ast-stat-num">$${potentialSavings.toFixed(2)}</span>
            <span class="ast-stat-label">Potential Annual Savings</span>
          </div>
        </div>
        <div class="ast-meta">
          <div class="ast-meta-scans">
            <span class="ast-meta-scan">Personal: ${personal.items.length} items &mdash; ${new Date(personal.scannedAt).toLocaleString()}</span>
            <span class="ast-meta-scan">Business: ${business.items.length} items &mdash; ${new Date(business.scannedAt).toLocaleString()}</span>
            <span class="ast-meta-scan">Compared: ${comparedCount} of ${rows.length} products have prices on both sides</span>
          </div>
          ${coverageWarning}
        </div>
        <div class="ast-table-wrap">
          <table class="ast-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Personal Address</th>
                <th>Business Address</th>
                <th>Personal S&S</th>
                <th>Business S&S</th>
                <th>Difference</th>
                <th>Annual Impact</th>
                <th>Best Deal</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
        <div class="ast-overlay-footer">
          <button class="ast-btn ast-btn-export-compare">Export Comparison CSV</button>
          <button class="ast-btn ast-btn-close">Close</button>
        </div>
      </div>
    `);

    document.body.appendChild(overlay);

    overlay.querySelector(".ast-close-btn").addEventListener("click", () => overlay.remove());
    overlay.querySelector(".ast-overlay-backdrop").addEventListener("click", () => overlay.remove());
    overlay.querySelector(".ast-btn-close").addEventListener("click", () => overlay.remove());
    overlay.querySelector(".ast-btn-export-compare").addEventListener("click", () => {
      const csvRows = rows.map((r) => ({
        Product: r.title,
        ASIN: r.asin,
        Frequency: r.frequency,
        "Deliveries/Year": r.perYear,
        "Personal Address": r.pAddress || "",
        "Business Address": r.bAddress || "",
        "Personal S&S": r.pPrice != null ? r.pPrice : "",
        "Business S&S": r.bPrice != null ? r.bPrice : "",
        "Personal One-Time": r.pOtp != null ? r.pOtp : "",
        "Business One-Time": r.bOtp != null ? r.bOtp : "",
        "Annual Cost (Personal S&S)": r.pPrice != null && r.perYear ? (r.pPrice * r.perYear).toFixed(2) : "",
        "Annual Cost (Business S&S)": r.bPrice != null && r.perYear ? (r.bPrice * r.perYear).toFixed(2) : "",
        "Annual Cost (Personal One-Time)": r.pOtp != null && r.perYear ? (r.pOtp * r.perYear).toFixed(2) : "",
        "Annual Cost (Business One-Time)": r.bOtp != null && r.perYear ? (r.bOtp * r.perYear).toFixed(2) : "",
        Difference: r.diff != null ? r.diff.toFixed(2) : "",
        "Annual Impact": r.annualDiff != null ? r.annualDiff.toFixed(2) : "",
        "Best Deal": r.winner,
      }));
      const date = new Date().toISOString().slice(0, 10);
      downloadCSV(
        toCSV(csvRows),
        `SubscriptionWizard_Comparison_${date}.csv`
      );
    });

    document.addEventListener("keydown", function escHandler(e) {
      if (e.key === "Escape") {
        overlay.remove();
        document.removeEventListener("keydown", escHandler);
      }
    });
  }

  // ── Bulk Cancel ──

  async function handleBulkCancel() {
    const btn = document.getElementById("ast-bulk-cancel");

    const quickCount = document.querySelectorAll("[data-edit-url]").length;
    if (!quickCount) {
      if (location.href.includes("/manager/viewsubscriptions")) {
        alert("No subscriptions found on this account to cancel.");
        setButtonState(btn, "Bulk Cancel", false);
        return;
      }
      setButtonState(btn, "Redirecting to subscriptions...", true);
      window.location.href =
        "https://www.amazon.com/gp/subscribe-and-save/manager/viewsubscriptions#ast-bulk-cancel";
      return;
    }

    const confirmed = confirm(
      `WARNING: This will cancel ALL subscriptions on this account (at least ${quickCount} visible).\n\n` +
      `Make sure you've already set up these subscriptions on your other account before proceeding.\n\n` +
      `This cannot be undone. Continue?`
    );
    if (!confirmed) {
      setButtonState(btn, "Bulk Cancel", false);
      return;
    }

    const doubleConfirm = confirm(
      `Are you absolutely sure?\n\nCanceling all subscriptions right now.`
    );
    if (!doubleConfirm) {
      setButtonState(btn, "Bulk Cancel", false);
      return;
    }

    setButtonState(btn, "Loading all items...", true);
    await scrollToLoadAll((msg) => setButtonState(btn, msg, true));

    let subs = scrapeSubscriptions().filter((s) => s.SubscriptionID);
    if (!subs.length) {
      alert("No subscriptions found on this page to cancel.");
      setButtonState(btn, "Bulk Cancel", false);
      return;
    }

    const results = { success: 0, failed: 0, errors: [] };

    for (let i = 0; i < subs.length; i++) {
      const sub = subs[i];
      setButtonState(
        btn,
        `Canceling (${i + 1}/${subs.length})...`,
        true
      );

      try {
        const cancelPageUrl =
          `https://www.amazon.com/auto-deliveries/cancelSubscription` +
          `?enableMydExperience=1&subscriptionId=${encodeURIComponent(sub.SubscriptionID)}` +
          `&sourcePage=subscriptionList`;

        const pageResp = await fetch(cancelPageUrl, {
          credentials: "include",
          headers: { Accept: "text/html" },
        });

        if (!pageResp.ok) {
          results.failed++;
          results.errors.push(`${sub.Title}: HTTP ${pageResp.status} loading cancel page`);
          continue;
        }

        const html = await pageResp.text();
        const doc = new DOMParser().parseFromString(html, "text/html");

        const cancelBtn = doc.querySelector("[data-csa-c-content-id='confirm-cancel']");
        const cancelForm = cancelBtn?.closest("form");

        if (!cancelForm) {
          results.failed++;
          results.errors.push(`${sub.Title}: Cancel form not found`);
          continue;
        }

        let action = cancelForm.getAttribute("action") || "";
        if (action.startsWith("/")) {
          action = "https://www.amazon.com" + action;
        }

        const formData = new URLSearchParams();
        cancelForm.querySelectorAll("input[type='hidden']").forEach((input) => {
          if (input.name) formData.append(input.name, input.value || "");
        });

        const cancelResp = await fetch(action, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formData.toString(),
        });

        if (cancelResp.ok) {
          results.success++;
          console.log(`AST: Canceled ${sub.Title} (${sub.SubscriptionID})`);
        } else {
          results.failed++;
          results.errors.push(`${sub.Title}: HTTP ${cancelResp.status} on cancel POST`);
        }
      } catch (e) {
        results.failed++;
        results.errors.push(`${sub.Title}: ${e.message}`);
      }

      if (i < subs.length - 1) await sleep(FETCH_DELAY_MS);
    }

    const msg =
      `Bulk cancel complete!\n\n` +
      `Canceled: ${results.success}\n` +
      `Failed: ${results.failed}` +
      (results.errors.length
        ? `\n\nErrors:\n${results.errors.join("\n")}`
        : "");

    alert(msg);
    console.log("AST: Bulk cancel results", results);

    window.location.href =
      "https://www.amazon.com/gp/subscribe-and-save/manager/viewsubscriptions";
  }

  // ── Bulk Subscribe ──

  function parseFrequencyCode(frequency) {
    const m = frequency.match(/every\s+(\d+)\s+month/i);
    if (m) return m[1] + "M";
    return "6M";
  }

  async function extractSubscribeData(asin) {
    const resp = await fetch(`https://www.amazon.com/dp/${asin}`, {
      credentials: "include",
      headers: { Accept: "text/html" },
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    let offerListingID = null;
    const offerInputs = doc.querySelectorAll('input[name="offerListingID"]');
    for (const input of offerInputs) {
      if (input.value) { offerListingID = input.value; break; }
    }
    if (!offerListingID) {
      const buyboxOffer = doc.querySelector("#newBuyBoxPrice, #corePrice_feature_div, #buybox");
      if (buyboxOffer) {
        const el = buyboxOffer.closest("form")?.querySelector('input[name="offerListingID"]');
        if (el) offerListingID = el.value;
      }
    }
    if (!offerListingID) {
      const m = html.match(/"offerListingID"\s*:\s*"([^"]+)"/);
      if (m) offerListingID = m[1];
    }

    let snsAntiCsrfToken = "";
    const csrfEl = doc.querySelector('input[name="snsAntiCsrfToken"]');
    if (csrfEl) snsAntiCsrfToken = csrfEl.value;

    return { offerListingID, snsAntiCsrfToken };
  }

  async function subscribeToProduct(asin, frequencyCode, offerListingID, snsAntiCsrfToken) {
    const subscribeBody = new URLSearchParams({
      snsAsin: asin,
      rcxOrdFreqOnml: frequencyCode + "|onml",
      rcxOrdFreqSns: frequencyCode + "|sns",
      offerListingID: offerListingID,
      snsAntiCsrfToken: snsAntiCsrfToken || "",
      isSubSameDayDeliveryEligible: "true",
      isOnmlPriceLesserThanFreeShippingThreshold: "false",
      snsAddToCartEnabled: "true",
      onmlSelected: "true",
      vmfEnabled: "true",
      quantity: "1",
      ref: "sns-subscribe-btn-dp-vmf-onml",
      "submit.subscribe": "1",
    });

    const subResp = await fetch(
      "https://www.amazon.com/auto-deliveries/checkout/subscribe/ref=sns-subscribe-btn-dp-vmf-onml",
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: subscribeBody.toString(),
        redirect: "follow",
      }
    );

    if (!subResp.ok) return { success: false, error: `Subscribe POST returned ${subResp.status}` };

    const checkoutHtml = await subResp.text();
    const checkoutDoc = new DOMParser().parseFromString(checkoutHtml, "text/html");

    let pipelineId = null;
    const finalUrl = subResp.url;
    const pidMatch = finalUrl.match(/\/checkout\/p\/(p-[\d-]+)\//);
    if (pidMatch) {
      pipelineId = pidMatch[1];
    } else {
      const formAction = checkoutDoc.querySelector("form[action*='/spc/place-order']")?.getAttribute("action");
      if (formAction) {
        const m2 = formAction.match(/\/checkout\/p\/(p-[\d-]+)\//);
        if (m2) pipelineId = m2[1];
      }
    }
    if (!pipelineId) {
      const links = checkoutHtml.match(/\/checkout\/p\/(p-[\d-]+)\//);
      if (links) pipelineId = links[1];
    }

    if (!pipelineId) return { success: false, error: "Could not find pipeline ID in checkout page" };

    let csrfToken = "";
    const csrfInput = checkoutDoc.querySelector('input[name="anti-csrftoken-a2z"]');
    if (csrfInput) csrfToken = csrfInput.value;

    if (!csrfToken) {
      const m = checkoutHtml.match(/name="anti-csrftoken-a2z"\s+value="([^"]+)"/);
      if (m) csrfToken = m[1];
    }

    if (!csrfToken) return { success: false, error: "Could not find CSRF token on checkout page" };

    const placeOrderBody = new URLSearchParams({
      "anti-csrftoken-a2z": csrfToken,
      hasWorkingJavascript: "1",
      SnsPaymentConfirmationImb: "1",
      placeYourOrder1: "1",
    });

    const orderResp = await fetch(
      `https://www.amazon.com/checkout/p/${pipelineId}/spc/place-order?pipelineType=Chewbacca&referrer=spc&ref_=chk_spc_chw_placeOrder`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: placeOrderBody.toString(),
        redirect: "follow",
      }
    );

    if (orderResp.ok || orderResp.status === 302) {
      const thankYou = await orderResp.text();
      if (thankYou.includes("thankyou") || thankYou.includes("order") || orderResp.url.includes("thankyou")) {
        return { success: true };
      }
    }

    return { success: true };
  }

  async function handleBulkSubscribe() {
    const account = detectAccountType();
    const otherKey = account === "business" ? "personal_scan" : "business_scan";
    const thisKey = account === "business" ? "business_scan" : "personal_scan";
    const otherLabel = account === "business" ? "personal" : "business";
    const sourceScan = await store.get(otherKey);
    const thisScan = await store.get(thisKey);

    if (!sourceScan || !sourceScan.items.length) {
      alert(
        `No ${otherLabel} scan found.\n\n` +
        `Switch to your ${otherLabel} account, click "Scan Prices", then come back here and click Bulk Subscribe.`
      );
      return;
    }

    const thisAsins = new Set(
      thisScan && thisScan.items ? thisScan.items.filter(i => i.subscribed).map(i => i.asin) : []
    );
    const filteredItems = sourceScan.items.filter(i => i.subscribed && !thisAsins.has(i.asin));

    if (!filteredItems.length) {
      alert(`No new subscriptions to bring over from your ${otherLabel} account.\n\nAll ${otherLabel} subscriptions already exist on this account, or the ${otherLabel} account has no subscriptions.`);
      return;
    }

    const filteredScan = { ...sourceScan, items: filteredItems };
    showSubscribeOverlay(filteredScan, otherLabel, account);
  }

  function showSubscribeOverlay(sourceScan, fromLabel, toLabel) {
    let existing = document.getElementById("ast-subscribe-overlay");
    if (existing) existing.remove();

    const items = sourceScan.items.map((item) => ({
      ...item,
      selected: true,
      freqCode: parseFrequencyCode(item.frequency),
    }));

    const overlay = document.createElement("div");
    overlay.id = "ast-subscribe-overlay";

    function render() {
      const selectedCount = items.filter((i) => i.selected).length;

      const tableRows = items
        .map((item, idx) => {
          const shortTitle = item.title.length > 55 ? item.title.slice(0, 52) + "..." : item.title;
          return `<tr class="${item.selected ? "" : "ast-sub-row-disabled"}">
            <td class="ast-sub-td-check"><input type="checkbox" data-idx="${idx}" ${item.selected ? "checked" : ""}></td>
            <td class="ast-td-title" title="${item.title.replace(/"/g, "&quot;")}">${shortTitle}</td>
            <td class="ast-td-num">${fmt(item.snsPrice)}</td>
            <td>${item.frequency || "—"}</td>
            <td>${item.freqCode}</td>
          </tr>`;
        })
        .join("");

      safeSetHTML(overlay, `
        <div class="ast-overlay-backdrop"></div>
        <div class="ast-overlay-content">
          <div class="ast-overlay-header">
            <div style="display:flex;align-items:center;gap:12px;">
              <img src="${browser.runtime.getURL("icons/icon128.png")}" alt="SW" style="width:48px;height:48px;border-radius:8px;">
              <h2>Bulk Subscribe — ${fromLabel.charAt(0).toUpperCase() + fromLabel.slice(1)} → ${toLabel.charAt(0).toUpperCase() + toLabel.slice(1)}</h2>
            </div>
            <button class="ast-close-btn">&times;</button>
          </div>
          <div class="ast-sub-info-bar">
            <span>${selectedCount} of ${items.length} selected</span>
            <div class="ast-sub-toggle-btns">
              <button class="ast-btn ast-btn-small ast-btn-select-all">Select All</button>
              <button class="ast-btn ast-btn-small ast-btn-select-none">Select None</button>
            </div>
          </div>
          <div class="ast-table-wrap">
            <table class="ast-table">
              <thead>
                <tr>
                  <th style="width:40px"></th>
                  <th>Product</th>
                  <th>S&S Price</th>
                  <th>Frequency</th>
                  <th>Code</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
          <div class="ast-overlay-footer">
            <div class="ast-sub-footer-info">
              Default payment & shipping will be used for each subscription.
            </div>
            <button class="ast-btn ast-btn-subscribe ast-sub-go" ${selectedCount === 0 ? "disabled" : ""}>
              Subscribe to ${selectedCount} Product${selectedCount !== 1 ? "s" : ""}
            </button>
            <button class="ast-btn ast-btn-close">Cancel</button>
          </div>
        </div>
      `);

      const close = () => overlay.remove();
      overlay.querySelector(".ast-close-btn").addEventListener("click", close);
      overlay.querySelector(".ast-overlay-backdrop").addEventListener("click", close);
      overlay.querySelector(".ast-btn-close").addEventListener("click", close);

      overlay.querySelector(".ast-btn-select-all").addEventListener("click", () => {
        items.forEach((i) => (i.selected = true));
        render();
      });

      overlay.querySelector(".ast-btn-select-none").addEventListener("click", () => {
        items.forEach((i) => (i.selected = false));
        render();
      });

      overlay.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener("change", () => {
          items[parseInt(cb.dataset.idx)].selected = cb.checked;
          render();
        });
      });

      overlay.querySelector(".ast-sub-go").addEventListener("click", () => {
        const selected = items.filter((i) => i.selected);
        if (!selected.length) return;
        overlay.remove();
        runBulkSubscribe(selected);
      });

      document.addEventListener("keydown", function escHandler(e) {
        if (e.key === "Escape") {
          overlay.remove();
          document.removeEventListener("keydown", escHandler);
        }
      });
    }

    document.body.appendChild(overlay);
    render();
  }

  async function runBulkSubscribe(selectedItems) {
    const btn = document.getElementById("ast-bulk-subscribe");
    setButtonState(btn, "Preparing...", true);

    const results = { success: 0, failed: 0, errors: [] };

    for (let i = 0; i < selectedItems.length; i++) {
      const item = selectedItems[i];
      const shortTitle = item.title.length > 40 ? item.title.slice(0, 37) + "..." : item.title;
      setButtonState(btn, `Subscribing (${i + 1}/${selectedItems.length})...`, true);

      try {
        const data = await extractSubscribeData(item.asin);
        if (!data || !data.offerListingID) {
          results.failed++;
          results.errors.push(`${shortTitle}: Could not find offerListingID`);
          continue;
        }

        const freqCode = item.freqCode || parseFrequencyCode(item.frequency);

        console.log(`AST: Subscribing to ${item.asin} (${shortTitle}) freq=${freqCode}`);

        const result = await subscribeToProduct(
          item.asin,
          freqCode,
          data.offerListingID,
          data.snsAntiCsrfToken
        );

        if (result.success) {
          results.success++;
          console.log(`AST: Successfully subscribed to ${shortTitle}`);
        } else {
          results.failed++;
          results.errors.push(`${shortTitle}: ${result.error}`);
        }
      } catch (e) {
        results.failed++;
        results.errors.push(`${shortTitle}: ${e.message}`);
      }

      if (i < selectedItems.length - 1) await sleep(3000);
    }

    const msg =
      `Bulk subscribe complete!\n\n` +
      `Subscribed: ${results.success}\n` +
      `Failed: ${results.failed}` +
      (results.errors.length
        ? `\n\nErrors:\n${results.errors.join("\n")}`
        : "");

    alert(msg);
    console.log("AST: Bulk subscribe results", results);

    window.location.href =
      "https://www.amazon.com/gp/subscribe-and-save/manager/viewsubscriptions";
  }

  // ── Subscribe Navigator ──

  async function handleNavigator() {
    const account = detectAccountType();
    const otherKey = account === "business" ? "personal_scan" : "business_scan";
    const thisKey = account === "business" ? "business_scan" : "personal_scan";
    const otherLabel = account === "business" ? "personal" : "business";
    const sourceScan = await store.get(otherKey);
    const thisScan = await store.get(thisKey);

    if (!sourceScan || !sourceScan.items.length) {
      alert(
        `No ${otherLabel} scan found.\n\n` +
        `Switch to your ${otherLabel} account, click "Scan Prices", then come back here and click Subscribe Navigator.`
      );
      return;
    }

    const thisAsins = new Set(
      thisScan && thisScan.items ? thisScan.items.filter(i => i.subscribed).map(i => i.asin) : []
    );
    const filtered = sourceScan.items.filter(i => i.subscribed && !thisAsins.has(i.asin));

    if (!filtered.length) {
      alert(`No new subscriptions to bring over from your ${otherLabel} account.\n\nAll ${otherLabel} subscriptions already exist on this account, or the ${otherLabel} account has no subscriptions.`);
      return;
    }

    showNavigator(filtered, otherLabel, account);
  }

  function showNavigator(items, fromLabel, toLabel) {
    let existing = document.getElementById("ast-nav-panel");
    if (existing) existing.remove();

    const state = {
      index: 0,
      results: { subscribed: 0, skipped: 0, failed: 0 },
      processing: false,
    };

    const panel = document.createElement("div");
    panel.id = "ast-nav-panel";

    function render() {
      const item = items[state.index];
      const shortTitle = item.title.length > 80 ? item.title.slice(0, 77) + "..." : item.title;
      const progress = ((state.index / items.length) * 100).toFixed(0);
      const done = state.index >= items.length;

      if (done) {
        safeSetHTML(panel, `
          <div class="ast-nav-header">
            <img src="${browser.runtime.getURL("icons/icon48.png")}" alt="SW" style="width:24px;height:24px;border-radius:4px;">
            <strong>Subscribe Navigator</strong>
            <span class="ast-nav-direction">${fromLabel.charAt(0).toUpperCase() + fromLabel.slice(1)} → ${toLabel.charAt(0).toUpperCase() + toLabel.slice(1)}</span>
            <button class="ast-nav-close">&times;</button>
          </div>
          <div class="ast-nav-complete">
            <strong>All done!</strong>
            <div class="ast-nav-stats">
              Subscribed: ${state.results.subscribed} &nbsp;|&nbsp; Skipped: ${state.results.skipped} &nbsp;|&nbsp; Failed: ${state.results.failed}
            </div>
            <button class="ast-btn ast-btn-scan ast-nav-finish">Close & Refresh</button>
          </div>
        `);
        panel.querySelector(".ast-nav-close").addEventListener("click", () => panel.remove());
        panel.querySelector(".ast-nav-finish").addEventListener("click", () => {
          panel.remove();
          window.location.href = "https://www.amazon.com/gp/subscribe-and-save/manager/viewsubscriptions";
        });
        return;
      }

      safeSetHTML(panel, `
        <div class="ast-nav-header">
          <img src="${browser.runtime.getURL("icons/icon48.png")}" alt="SW" style="width:24px;height:24px;border-radius:4px;">
          <strong>Subscribe Navigator</strong>
          <span class="ast-nav-direction">${fromLabel.charAt(0).toUpperCase() + fromLabel.slice(1)} → ${toLabel.charAt(0).toUpperCase() + toLabel.slice(1)}</span>
          <button class="ast-nav-close">&times;</button>
        </div>
        <div class="ast-nav-progress">
          <div class="ast-nav-progress-bar" style="width:${progress}%"></div>
        </div>
        <div class="ast-nav-counter">${state.index + 1} of ${items.length}</div>
        <div class="ast-nav-current">
          <div class="ast-nav-title" title="${item.title.replace(/"/g, "&quot;")}">${shortTitle}</div>
          <div class="ast-nav-meta">
            ${item.snsPrice != null ? `S&S Price: <strong>${fmt(item.snsPrice)}</strong>` : "No price found"}
            ${item.frequency ? ` &nbsp;|&nbsp; ${item.frequency}` : ""}
          </div>
        </div>
        <div class="ast-nav-actions">
          <button class="ast-btn ast-nav-prev" ${state.index === 0 || state.processing ? "disabled" : ""}>&#9664; Prev</button>
          <button class="ast-btn ast-btn-subscribe ast-nav-subscribe" ${state.processing ? "disabled" : ""}>Subscribe</button>
          <button class="ast-btn ast-nav-skip" ${state.processing ? "disabled" : ""}>Skip &#9654;</button>
        </div>
        <div class="ast-nav-stats">
          Subscribed: ${state.results.subscribed} &nbsp;|&nbsp; Skipped: ${state.results.skipped}${state.results.failed ? ` &nbsp;|&nbsp; Failed: ${state.results.failed}` : ""}
        </div>
      `);

      panel.querySelector(".ast-nav-close").addEventListener("click", () => {
        if (state.results.subscribed > 0) {
          if (confirm(`You've subscribed to ${state.results.subscribed} product(s). Close navigator and refresh?`)) {
            panel.remove();
            window.location.href = "https://www.amazon.com/gp/subscribe-and-save/manager/viewsubscriptions";
          }
        } else {
          panel.remove();
        }
      });

      panel.querySelector(".ast-nav-prev").addEventListener("click", () => {
        if (state.index > 0) {
          state.index--;
          render();
        }
      });

      panel.querySelector(".ast-nav-skip").addEventListener("click", () => {
        state.results.skipped++;
        state.index++;
        render();
      });

      panel.querySelector(".ast-nav-subscribe").addEventListener("click", async () => {
        state.processing = true;
        const subBtn = panel.querySelector(".ast-nav-subscribe");
        const skipBtn = panel.querySelector(".ast-nav-skip");
        subBtn.textContent = "Subscribing...";
        subBtn.disabled = true;
        skipBtn.disabled = true;

        try {
          const data = await extractSubscribeData(item.asin);
          if (!data || !data.offerListingID) {
            state.results.failed++;
            alert(`Could not find offer data for: ${item.title.slice(0, 50)}`);
          } else {
            const freqCode = parseFrequencyCode(item.frequency);
            const result = await subscribeToProduct(item.asin, freqCode, data.offerListingID, data.snsAntiCsrfToken);
            if (result.success) {
              state.results.subscribed++;
            } else {
              state.results.failed++;
              alert(`Failed to subscribe: ${result.error}`);
            }
          }
        } catch (e) {
          state.results.failed++;
          alert(`Error: ${e.message}`);
        }

        state.processing = false;
        state.index++;
        await sleep(1500);
        render();
      });
    }

    document.body.appendChild(panel);
    render();
  }

  // ── Reset Data ──

  async function handleReset() {
    const confirmed = confirm(
      "This will clear all saved scan data, navigator progress, and comparison data.\n\nContinue?"
    );
    if (!confirmed) return;

    await store.set("personal_scan", null);
    await store.set("business_scan", null);

    alert("All S&S Wizard data has been cleared.");
    location.reload();
  }

  // ── UI Helpers ──

  function setButtonState(btn, text, disabled) {
    if (!btn) return;
    btn.textContent = text;
    btn.disabled = disabled;
  }

  async function updateButtonStates() {
    const p = await store.get("personal_scan");
    const b = await store.get("business_scan");
    const hasBoth = p && b;
    const hasEither = p || b;
    const account = detectAccountType();
    const otherScan = account === "business" ? p : b;
    const otherLabel = account === "business" ? "personal" : "business";

    const compareBtn = document.getElementById("ast-compare");
    if (compareBtn) {
      if (hasBoth) {
        compareBtn.classList.add("ast-btn-ready");
        compareBtn.disabled = false;
        compareBtn.title = `Personal: ${p.items.length} items | Business: ${b.items.length} items — Ready to compare`;
      } else if (hasEither) {
        compareBtn.classList.remove("ast-btn-ready");
        compareBtn.disabled = true;
        const missing = !p ? "personal" : "business";
        compareBtn.title = `Scan your ${missing} account first`;
      } else {
        compareBtn.classList.remove("ast-btn-ready");
        compareBtn.disabled = true;
        compareBtn.title = "Scan both accounts first";
      }
    }

    const subscribeBtn = document.getElementById("ast-bulk-subscribe");
    if (subscribeBtn) {
      if (otherScan && otherScan.items.length) {
        subscribeBtn.disabled = false;
        subscribeBtn.title = `Subscribe to ${otherScan.items.length} products from ${otherLabel} scan`;
      } else {
        subscribeBtn.disabled = true;
        subscribeBtn.title = `Scan your ${otherLabel} account first`;
      }
    }

    const navBtn = document.getElementById("ast-navigate");
    if (navBtn) {
      if (otherScan && otherScan.items.length) {
        navBtn.disabled = false;
        navBtn.title = `Step through ${otherScan.items.length} products from ${otherLabel} one at a time`;
      } else {
        navBtn.disabled = true;
        navBtn.title = `Scan your ${otherLabel} account first`;
      }
    }

    const cancelBtn = document.getElementById("ast-bulk-cancel");
    if (cancelBtn) {
      cancelBtn.title = "Cancel all subscriptions on this account";
    }

    const exportBtn = document.getElementById("ast-export-csv");
    if (exportBtn) {
      exportBtn.title = "Export current page subscriptions to CSV";
    }
  }

  // ── Inject UI ──

  function findAnchor() {
    const headerSpan = [...document.querySelectorAll("#cardHeader span")].find(
      (s) => s.textContent.trim() === "Your Subscriptions"
    );
    if (headerSpan) return headerSpan.closest("#cardHeader");

    const tabs = document.querySelector("[class*='subscriptions'] [role='tablist'], [class*='Subscriptions'] [role='tablist']");
    if (tabs) return tabs;

    const subHeading = [...document.querySelectorAll("h1, h2, h3, [class*='heading'], [class*='header'], a[class*='nav']")].find(
      (el) => /subscriptions/i.test(el.textContent.trim()) && el.offsetParent !== null
    );
    if (subHeading) return subHeading;

    const navTabs = [...document.querySelectorAll("a, span, div")].find(
      (el) => el.textContent.trim() === "SUBSCRIPTIONS" && el.offsetParent !== null
    );
    if (navTabs) return navTabs.parentElement || navTabs;

    if (document.querySelectorAll("[data-edit-url]").length > 0) {
      const firstCard = document.querySelector("[data-edit-url]");
      return firstCard?.parentElement;
    }

    return null;
  }

  function injectButtons() {
    if (document.getElementById("ast-export-csv")) return;

    const header = findAnchor();
    if (!header) return;

    const toolbar = document.createElement("div");
    toolbar.id = "ast-toolbar";
    toolbar.className = "ast-toolbar";

    const brand = document.createElement("span");
    brand.className = "ast-brand";
    const logo = document.createElement("img");
    logo.src = browser.runtime.getURL("icons/icon48.png");
    logo.className = "ast-brand-logo";
    brand.appendChild(logo);
    brand.appendChild(document.createTextNode("Subscription Wizard"));
    toolbar.appendChild(brand);

    const btnGroup = document.createElement("div");
    btnGroup.className = "ast-btn-group";

    const exportBtn = document.createElement("button");
    exportBtn.id = "ast-export-csv";
    exportBtn.textContent = "Export CSV";
    exportBtn.className = "ast-btn ast-btn-export";
    exportBtn.addEventListener("click", handleExport);

    const scanBtn = document.createElement("button");
    scanBtn.id = "ast-scan-prices";
    scanBtn.textContent = "Scan Prices";
    scanBtn.className = "ast-btn ast-btn-scan";
    scanBtn.addEventListener("click", handleScan);

    const compareBtn = document.createElement("button");
    compareBtn.id = "ast-compare";
    compareBtn.textContent = "Compare";
    compareBtn.className = "ast-btn ast-btn-compare";
    compareBtn.addEventListener("click", handleCompare);

    const cancelBtn = document.createElement("button");
    cancelBtn.id = "ast-bulk-cancel";
    cancelBtn.textContent = "Bulk Cancel";
    cancelBtn.className = "ast-btn ast-btn-cancel";
    cancelBtn.addEventListener("click", handleBulkCancel);

    const subscribeBtn = document.createElement("button");
    subscribeBtn.id = "ast-bulk-subscribe";
    subscribeBtn.textContent = "Bulk Subscribe";
    subscribeBtn.className = "ast-btn ast-btn-subscribe";
    subscribeBtn.addEventListener("click", handleBulkSubscribe);

    const navBtn = document.createElement("button");
    navBtn.id = "ast-navigate";
    navBtn.textContent = "Subscribe Navigator";
    navBtn.className = "ast-btn ast-btn-navigate";
    navBtn.addEventListener("click", handleNavigator);

    btnGroup.appendChild(scanBtn);
    btnGroup.appendChild(compareBtn);
    btnGroup.appendChild(subscribeBtn);
    btnGroup.appendChild(navBtn);
    btnGroup.appendChild(cancelBtn);
    btnGroup.appendChild(exportBtn);
    toolbar.appendChild(btnGroup);

    const spacer = document.createElement("div");
    spacer.id = "ast-toolbar-spacer";
    spacer.style.height = "50px";
    document.body.prepend(spacer);
    document.body.prepend(toolbar);

    updateButtonStates();
  }

  // ── Init ──

  function tryInject() {
    if (!isSubscriptionPage()) return;
    injectButtons();

    if (location.hash === "#ast-bulk-cancel") {
      history.replaceState(null, "", location.href.replace("#ast-bulk-cancel", ""));
      setTimeout(() => handleBulkCancel(), 1500);
    }
    if (location.hash === "#ast-scan") {
      history.replaceState(null, "", location.href.replace("#ast-scan", ""));
      setTimeout(() => handleScan(), 1500);
    }
  }

  if (document.readyState === "complete") {
    tryInject();
  } else {
    window.addEventListener("load", tryInject);
  }

  const observer = new MutationObserver(() => {
    if (!document.getElementById("ast-toolbar") && isSubscriptionPage()) {
      injectButtons();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
