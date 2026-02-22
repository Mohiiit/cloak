# Media and Screenshot Policy

Last updated: 2026-02-22

## Purpose
Keep repository media organized, reviewable, and safe for open-source collaboration.

## Directory Rules
- Product screenshots used in docs must live under `docs/screenshots/`.
- Historical or one-off captures must live under `docs/screenshots/archive/`.
- Root-level media files (for example `*.png`) are not allowed.
- Generated test artifacts must not be committed unless explicitly required for documentation.

## Naming Rules
- Use lowercase kebab-case names.
- Include platform or feature context where applicable.
  - Example: `mobile-ios-home.png`
  - Example: `extension-send-flow.png`
- Avoid ambiguous names like `final.png`, `new2.png`, or date-only names unless archived.

## Retention Rules
- Keep only screenshots referenced by current docs in primary folders.
- Move old parity/debug captures to archive.
- Remove obsolete assets during major UI refreshes.

## Sensitive Data Rules
- Do not commit screenshots that reveal:
  - private keys
  - seed phrases
  - personal account identifiers
  - API tokens or internal URLs not meant for public release
- If a screenshot is useful but sensitive, redact it before commit.

## Review Rules
- PRs that add media should explain why the new assets are needed.
- PRs that add >10 screenshots should include a short retention note.
- Reviewers should reject root-level media additions unless there is a documented exception.
