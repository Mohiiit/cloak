# Contributing to Cloak

Thanks for contributing. This document defines the minimum standards for changes in this repository.

## Before You Start
- Search existing issues before opening a new one.
- For larger changes, open an issue first to align scope.
- Keep PRs focused and small when possible.

## Development Setup
1. Install Node.js 22+ and Corepack.
2. Install dependencies from repository root:
   - `yarn install`
3. Run the web app:
   - `yarn start`

For package-specific setup, see package READMEs:
- `packages/mobile/README.md`
- `packages/sdk/README.md`
- `packages/snfoundry/scripts-cairo/README.md`

## Validation Checklist (Run Before PR)
From repo root, run relevant checks for your change:
- Formatting: `yarn format:check`
- Next.js lint: `yarn next:lint`
- Next.js typecheck: `yarn next:check-types`
- SDK tests: `yarn sdk:test`
- Mobile unit tests (if mobile touched): `yarn mobile:test:unit`
- Contract tests (if snfoundry touched): `yarn test`

If a command is not relevant to your changed area, explain why in the PR description.

## Coding Expectations
- Follow existing project patterns in touched files.
- Avoid unrelated refactors in functional PRs.
- Do not commit secrets, credentials, or private keys.
- Add tests for bug fixes and new behavior when practical.
- Update docs when behavior, commands, or architecture changes.

## Commit and PR Guidance
- Use clear, scoped commit messages.
- PR title format recommendation: `<area>: <summary>`.
- Include in PR description:
  - What changed
  - Why it changed
  - How it was tested
  - Any migration or follow-up needed

## Security Issues
Do not open public issues for sensitive vulnerabilities.
Follow `SECURITY.md` for responsible disclosure.
