# Security Policy

## Reporting a vulnerability

If you find a security vulnerability in Amazon Subscription Wizard, **please report it privately** — do not open a public issue, since a public issue tips off potential attackers before a fix is out.

Use GitHub's **private vulnerability reporting**: go to the
[Security tab](https://github.com/WeirDave/Subscription-Wizard/security)
and click **Report a vulnerability**. This opens a private channel visible only to the maintainer.

Please include:

- What the vulnerability is and where it lives (file / feature / version).
- Steps to reproduce, or a minimal proof of concept.
- The extension version shown in Firefox's Add-ons Manager (e.g. `1.3.0`).

You'll get an acknowledgment as soon as it's seen. Confirmed issues are patched on a priority basis and credited in the release notes unless you ask otherwise.

## Supported versions

Only the **latest released version** is supported for security fixes. The current version is in `manifest.json` (`version`) and on GitHub Releases and addons.mozilla.org. If you're running an older build, update before reporting.

## Scope and design notes

Amazon Subscription Wizard is a **Firefox extension** that runs only on Amazon Subscribe & Save pages:

- There is no account, backend or telemetry. The only extension permission is `storage`; scanned prices and subscription lists stay in the browser's local extension storage.
- The content script runs on `amazon.com` Subscribe & Save pages and acts with the signed-in Amazon session, including the Bulk Subscribe checkout flow. The most serious classes of vulnerability are therefore **anything that lets page content inject script into the extension's UI** (XSS through product names, prices or other scraped text) and **anything that could cause an action on the Amazon account the user did not choose**. Reports of either are especially valued.
- CSV exports are written from scraped data; formula injection into a spreadsheet opened from an export is in scope.
