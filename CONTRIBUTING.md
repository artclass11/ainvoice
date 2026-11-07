# Contributing to AInvoice

Thank you for helping make billing software clearer, safer and more accessible.

## Before opening a pull request

- Search existing issues and pull requests.
- For large changes, open an issue first and describe the user problem and proposed solution.
- Keep the default workflow simple. Advanced features must not make basic billing harder.
- Include tests for billing calculations, data migrations, permissions and backup/restore changes.
- Never include real customer, supplier, invoice, tax-ID, bank or payment data in fixtures, screenshots or issue reports.

## Development expectations

- Use TypeScript with strict checks.
- Keep money values as integer minor units (paise/cents), never binary floating-point currency.
- Keep business logic outside React components.
- Make offline operation the default and disclose every network request.
- Add accessible labels, keyboard support and clear validation messages.
- Use translation keys for user-facing text. Do not add hard-coded UI copy.
- Keep dependencies minimal and check their maintenance, license and security status.
- Do not add telemetry, tracking, advertising or remote data sharing without explicit product approval and user-facing controls.

## Pull request checklist

- [ ] The change solves a clearly described user problem.
- [ ] Tests cover normal, boundary and failure cases.
- [ ] Billing, tax and rounding logic has independent examples.
- [ ] Offline behavior is tested where relevant.
- [ ] Data migration and rollback behavior are considered.
- [ ] UI text uses locale dictionaries.
- [ ] No secrets, personal data or private business records are included.
- [ ] Documentation and third-party notices are updated.

## License

By intentionally submitting a contribution for inclusion, you agree that it is submitted under the Apache License 2.0, unless you and the maintainers have separately agreed otherwise in writing. You retain copyright in your contributions. See [LICENSE](./LICENSE).
