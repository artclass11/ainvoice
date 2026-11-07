# Developing AInvoice with DeepSeek Harness

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) is a separate open-source agent development environment from DeepSeek AI. It is not a runtime dependency of AInvoice and is not bundled into the billing application.

## Why use it

Use the harness as a local coding/review agent to explore this repository, propose changes, implement scoped tasks, run tests and review diffs. Keep human review and normal CI as the merge authority.

## Install / launch

Follow the current upstream instructions because the harness is in developer preview and its commands or plugin APIs can change.

Typical Web UI launch with Node.js installed:

    npx @deepseek-ai/dsh web

Typical source setup:

    git clone https://github.com/deepseek-ai/deepseek-harness.git
    cd deepseek-harness
    pnpm install
    pnpm run build
    pnpm dsh web

Use upstream documentation for current safety guidance and configuration:
- https://github.com/deepseek-ai/deepseek-harness
- https://deepseek-harness.github.io/deepseek-harness/

## Suggested AInvoice agent workflow

1. Open the AInvoice repository as the working project.
2. Ensure the agent reads AGENTS.md and the product/security documents.
3. Give one small task at a time, such as "add tests for invoice tax rounding" or "implement the customer search empty state".
4. Ask the agent to list files it intends to change before editing.
5. Require it to run tests, type checks and build, and report exact command output.
6. Inspect the diff manually; never auto-merge code that changes tax, money, security, migration or backup logic.
7. Use synthetic test fixtures only. Do not expose live customer data, tax IDs, bank details, API keys or production backups to an AI agent.

## Security boundaries

- Do not grant an agent unrestricted access to a machine containing live financial data.
- Do not give it production credentials or payment-provider secrets.
- Do not configure automatic deployment or production database access from a coding session.
- Keep agent tool permissions minimal and use a disposable development workspace.
- Upstream DeepSeek Harness is MIT-licensed; that license applies to the upstream harness, not to AInvoice. AInvoice's own source license is Apache-2.0.
