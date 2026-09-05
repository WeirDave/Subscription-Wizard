<p align="center">
  <img src="icons/Subscription Wizard Logo v3_950x950.png" alt="Amazon Subscription Wizard" width="220">
</p>

<h3 align="center">Find the best price for every Amazon subscription.</h3>

<p align="center">
  <a href="https://github.com/sponsors/WeirDave"><img src="https://img.shields.io/badge/Sponsor-%E2%9D%A4-ea4aaa?style=for-the-badge&logo=github-sponsors&logoColor=white" alt="Sponsor"></a>
  <a href="https://addons.mozilla.org/en-US/firefox/addon/subscription-wizard/"><img src="https://img.shields.io/badge/Firefox-Install_from_AMO-FF7139?style=for-the-badge&logo=firefox-browser&logoColor=white" alt="Install from AMO"></a>
  <a href="https://github.com/WeirDave/Subscription-Wizard/releases/latest"><img src="https://img.shields.io/github/v/release/WeirDave/Subscription-Wizard?style=for-the-badge&color=7b2d8e" alt="Latest Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/WeirDave/Subscription-Wizard?style=for-the-badge" alt="License"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/local--first-private-5fa970?style=flat-square" alt="Local First">
  <img src="https://img.shields.io/badge/telemetry-none-5fa970?style=flat-square" alt="No Telemetry">
  <img src="https://img.shields.io/badge/platform-Firefox%20142%2B-FF7139?style=flat-square&logo=firefox-browser&logoColor=white" alt="Firefox 142+">
</p>

---

## What is Amazon Subscription Wizard?

Amazon Subscription Wizard is a Firefox extension that compares Amazon Subscribe & Save
pricing across your personal and business accounts. Scan both sides, see every
product side by side, and migrate subscriptions to whichever account has the
better price — all from a toolbar that appears on your Subscribe & Save page.

Everything runs in your browser. No data leaves your machine, no external
servers are contacted, and no account is required.

## Features

- **Scan Prices** — Fetches real-time S&S and one-time pricing for every
  subscription on the page, including products from your other account
- **Side-by-Side Comparison** — Personal vs. business prices in a single table
  with the winner highlighted and annual savings calculated
- **Bulk Subscribe** — Select the subscriptions you want and subscribe on the
  cheaper account in one click, with the full checkout flow handled automatically
- **Subscribe Navigator** — Step through the other account's subscriptions one
  at a time: subscribe to the ones you want, skip the rest, go back to
  reconsider
- **CSV Export** — Two exports: the toolbar button exports your current
  account's subscription list with previous prices and price changes between
  scans; the comparison view exports a side-by-side report with annual cost
  breakdowns for both S&S and one-time pricing
- **Smart Workflow** — Buttons stay disabled until their prerequisites are met
  and coverage warnings tell you when data is incomplete
- **Privacy First** — All data stays in your browser's local extension storage

## How it works

Three scans to lower prices:

1. **Scan personal** — Go to your Subscribe & Save page on your personal account
   and click **Scan Prices**
2. **Switch and scan business** — Switch to your business account and scan again.
   The extension merges your personal products in so it gets business prices for
   everything
3. **Switch back and re-scan personal** — Return to your personal account and
   scan one more time. This picks up prices for any business-only subscriptions,
   giving you complete coverage
4. **Compare and migrate** — Click **Compare** to see every product side by side.
   Use **Bulk Subscribe** to move subscriptions in bulk, or **Subscribe Navigator**
   to move them selectively one at a time

> Only have subscriptions on one account? You only need two scans — scan your
> subscriptions, switch accounts, scan again, and you're ready to compare.

> Scans take roughly 3 seconds per subscription to avoid Amazon rate limits.
> A typical account with 40 items takes about 2 minutes.

## Screenshots

<p align="center">
  <img src="screenshots/Screenshot 2026-08-16 at 17-04-22 Manage Your Deliveries.png" alt="Toolbar" width="100%">
</p>

## Installation

### From Firefox Add-ons (AMO)

Install directly from the [Firefox Add-ons listing](https://addons.mozilla.org/en-US/firefox/addon/subscription-wizard/).
Updates are delivered automatically by Firefox.

### From source

1. Clone this repository
2. Open `about:debugging` in Firefox
3. Click **This Firefox** → **Load Temporary Add-on**
4. Select `manifest.json` from the cloned folder

Temporary add-ons are removed when Firefox closes. For persistent local
installation, use the AMO listing.

## Project layout

```text
manifest.json     Extension manifest (Manifest V2, Firefox 142+)
content.js        All extension logic — scanning, comparison, subscribe, navigator, export
content.css       Toolbar, overlay, and navigator panel styles
options.html      Extension settings page
options.js        Settings page logic (view/clear saved scan data)
icons/            Extension icons (48px, 128px, and source logo)
screenshots/      AMO listing screenshots
landing.html      Landing page for AMO and GitHub
```

## Privacy

- All scan data is stored in Firefox's local extension storage
- No external servers are contacted
- No tracking, analytics, or telemetry of any kind
- No accounts or sign-ups required
- Your subscription data never leaves your browser

## Help & Support

If something isn't working:

- **In the extension:** Open the extension's **Options** page (right-click the extension icon → Manage Extension → Preferences). The Help & Diagnostics section captures your environment info and lets you open a pre-filled bug report.
- **Report a bug:** [Open a new issue](https://github.com/WeirDave/Subscription-Wizard/issues/new?template=bug_report.yml)
- **View existing issues:** [GitHub Issues](https://github.com/WeirDave/Subscription-Wizard/issues)
- **Security vulnerabilities:** Use [private vulnerability reporting](https://github.com/WeirDave/Subscription-Wizard/security/advisories/new) — don't open a public issue.

## Updates

When a new version is published to AMO, Firefox delivers the update
automatically. To publish an update:

1. Bump `version` in `manifest.json`
2. Rebuild the extension ZIP
3. Upload to the [AMO Developer Hub](https://addons.mozilla.org/developers/)

## License

Subscription Wizard is available under the [MIT License](LICENSE).
