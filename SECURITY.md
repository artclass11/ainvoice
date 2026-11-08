# Security policy

## Reporting a vulnerability

Please do not publish exploitable vulnerability details in a public issue.

Use GitHub's private vulnerability reporting for this repository:
https://github.com/artclass11/ainvoice/security/advisories/new

Include the affected version or commit, platform, reproduction steps, impact, and any suggested mitigation. Please avoid including real customer invoices, personal information, passwords, backup files, or signing keys.

## Supported versions

AInvoice is currently an early-access project. The latest main-branch code is the active development line; older preview installers may contain known limitations and are not guaranteed to receive security fixes.

## Security limitations

The application PIN is an app-entry control, not encryption. Current business records are stored in WebView IndexedDB and are not encrypted at rest. Encrypted backup files protect exported data, but do not make the live database encrypted. Do not use AInvoice as the sole store for sensitive production or statutory business records until the documented production security gates have passed.
