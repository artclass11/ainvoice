# AInvoice agent instructions

These instructions apply to coding agents, including DeepSeek Harness agents, working in this repository.

## Product north star

Make billing obvious for a first-time shop owner. A user should be able to finish initial setup and create the first valid draft invoice without reading a manual. Keep advanced dealer capabilities available behind progressive disclosure.

## Non-negotiable engineering rules

1. Offline-first: creating, viewing and printing a bill must not require a network connection.
2. Local data first: do not add a remote database, telemetry, analytics or automatic upload without an explicit, documented product decision.
3. Money safety: store monetary values as integer minor units. Never use floating-point values as the canonical stored money amount.
4. Tax safety: do not invent statutory rules. Keep tax rates configurable and jurisdiction-specific; require tests and qualified review before claiming compliance.
5. Data integrity: never silently delete issued invoices. Use void/credit-note workflows and append-only audit events.
6. Security honesty: a PIN/pattern is an entry gate, not a complete security boundary. Do not claim encryption unless authenticated encryption is implemented and tested.
7. Privacy: no real business data in fixtures, telemetry, logs, prompts or screenshots.
8. Internationalization: use translation keys for every user-visible string.
9. Accessibility: support keyboard navigation, readable contrast, large touch targets and screen readers.
10. Licensing: AInvoice code is Apache-2.0. Do not copy code or assets from incompatible licenses. Preserve third-party notices.

## Before changing code

- Read README.md, docs/PRODUCT_SPEC.md, docs/ARCHITECTURE.md and SECURITY.md.
- Identify the user task and the smallest useful change.
- Inspect current package versions and APIs instead of guessing.
- State the plan and acceptance criteria before broad refactors.

## Before considering work complete

- Run lint, type-check, unit tests and production build.
- Add tests for currency rounding, discounts, tax boundaries, invoice numbering, offline state and migrations as appropriate.
- Verify empty states, slow device behavior, small screens and keyboard-only interaction.
- Review new dependencies and their licenses.
- Summarize changed files, checks actually run, known limitations and risks. Never claim an unrun test passed.
