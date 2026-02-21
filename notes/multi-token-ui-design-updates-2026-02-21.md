# Cloak Multi-Token UI Design Updates (2026-02-21)

## Source Requirement
- `/Users/mohit/Desktop/karnot-vault/cloak/multi-token-ui-design-requirements-v1.md`

## Pass 1 (already applied)
- Added/updated multi-token Home, Wallet, Activity, Swap screens.
- Added swap states and initial Ward header updates.

## Pass 2 (this update)

### 1) Home Fix (`7Vrpd`)
- Repaired quick actions layout from compressed single-row cards to a clean 2x2 grid.
- Kept `Send`, `Shield`, `Unshield`, `Swap` with improved readability.

### 2) Global Bottom Tab Cleanup
- Removed bottom-right `Settings` tab label/icon from remaining app variants.
- Standardized tab model across affected screens to:
  - `Home`, `Send`, `Wallet`, `Swap`, `Activity`
- Updated previously stale 4th tab `Activity` labels/icons to `Swap` where needed.

### 3) Ward Updates
- `Cloak - Ward Home (Normal)` (`6UViJ`):
  - Replaced right header ward badge with quick-action icon trigger.
  - Added in-content `Ward Mode` chip near top content.
- `Cloak - Ward Home (Frozen)` (`Sap4z`) remains aligned with the same pattern.

### 4) Private Swap Copy Updates
Applied to:
- `Cloak - Swap` (`rrBFO`)
- `Cloak - Swap Confirm` (`YtUNj`)
- `Cloak - Swap Pending` (`AtV29`)

Changes:
- Converted flow language to private-unit semantics:
  - `Out: ...u` and `In est: ...u`
  - `YOU SEND (PRIVATE)`
  - quote lines in `tongo units`
  - quantization copy aligned to tongo unit quantization
- Updated statuses/CTA labels for private swap progression.

### 5) New Dedicated Progress Screen
- Added `Cloak - Swap In Progress` (`ILd68`)
- Includes explicit progress states:
  - `1. Build swap proof` (Done)
  - `2. Execute composed route` (In progress)
  - `3. Settle shielded receive` (Waiting)
- Keeps the same header and tab model consistency.

## Quick Action Clarification (implemented intent)
Top-right icon is the quick-action trigger intended to open a sheet with:
- `Quick Send`
- `Scan to Pay`
- `Show Receive QR`

## Validation
- Screenshots re-verified after pass-2 fixes for:
  - Home
  - Settings variant
  - Ward home
  - Swap main
  - Swap progress
- No placeholder flags remain on finished edited screens.

## Note on Karnot Vault Sync
- Direct write to `/Users/mohit/Desktop/karnot-vault/cloak` is blocked by sandbox policy in this session.
- This update is saved at:
  - `/Users/mohit/Desktop/personal_projects/cloak/notes/multi-token-ui-design-updates-2026-02-21.md`

## Pass 3 (latest update from feedback)

### 1) Home Actions Restored to Single Row (`7Vrpd`)
- Updated quick actions to a one-line layout with smaller cards:
  - `Send`, `Shield`, `Unshield`, `Swap`
- Removed temporary extra row wrappers and normalized action card heights.

### 2) Ward Header Model Finalized (Normal + Frozen)
- `Cloak - Ward Home (Normal)` (`6UViJ`):
  - Header now follows: `logo <> Ward Mode <> magic icon`
  - Moved `Ward Mode` chip into centered header position.
- `Cloak - Ward Home (Frozen)` (`Sap4z`):
  - Applied the same centered header chip model.
- Non-ward screens remain: `logo <> magic icon`.

### 3) Swap Progress Screen Restyled to Existing Progress Pattern
- Rebuilt progress screen in modal style to match other progress flows (like ward/2FA progress patterns).
- Old node `ILd68` was replaced with new node `8GxMW` (`Cloak - Swap In Progress`).
- Flow copy remains private-swap specific:
  - `Build swap proof` → `Execute composed route` → `Settle shielded receive`
  - Status and helper copy reference `tongo units`.

### 4) Bottom Nav Final Normalization (Legacy Settings Remnants)
- Cleaned remaining bottom-right legacy entries that still showed `Settings`.
- Standardized active/inactive tab visuals to:
  - `Home`, `Send`, `Wallet`, `Swap`, `Activity`
- Verified on key screens including Home, Settings, Activity, Ward, and Swap.

## Pass 4 (progress modal alignment)

### Private Swap Progress Modal (`8GxMW`)
- Replaced custom numbered-status modal with the same visual structure used by 2FA progress screens.
- Removed textual status qualifiers like `Done` / `In progress`.
- Switched to round step indicators:
  - completed steps use green checks
  - active step uses a highlighted round loader style
  - pending steps use muted round outlines
- Centered top icon to match the 2FA modal composition.
- Updated copy to private-swap flow:
  - `Building swap proof`
  - `Executing private route`
  - `Settling shielded receive`
  - `Finalizing`
  - `Complete`

## Pass 5 (swap completion + activity detail)

### 1) New Swap Complete Screen
- Added new screen: `Cloak - Swap Complete` (`BFHA6`).
- Built from existing success pattern to keep consistency.
- Updated success content for private swap output:
  - Pair: `STRK -> ETH`
  - Sent: `12.00 tongo units`
  - Received: `31 tongo units`
  - Tx hash row + details link retained for follow-up navigation.

### 2) New Swap Activity Detail Screen
- Added new screen: `Cloak - Swap Detail` (`1OMSF`) for when user taps activity item like `Swap STRK -> ETH`.
- Shows what user expects after click:
  - headline output amount (`31.00 tongo units`)
  - settled status pill
  - structured breakdown card:
    - Pair
    - Sent
    - Received
    - Rate
    - Route
  - Swap tx hash section
  - CTA: `View settlement on Voyager`

### 3) Activity Context
- Existing activity list (`09FBd`) already contains swap entries (for example `Swap STRK -> ETH`).
- New detail screen is the intended drill-down target for that row tap.

## Pass 4 (progress modal alignment update)

### Swap Progress Screen (`8GxMW`)
- Refined to match the existing progress-screen visual language (same pattern as 2FA progress):
  - Centered top icon and title block.
  - Replaced numbered steps and `Done / In progress / Waiting` labels.
  - Switched to round state indicators:
    - done = green circle/check
    - active = blue ring
    - pending = muted ring
- Updated copy and footer status to keep private-swap semantics while staying visually consistent with existing progress screens.

## Final Phase (Consolidated Final Information)

### Final Screen Set (Swap + Activity)
- `Cloak - Swap` (`rrBFO`)
- `Cloak - Swap Confirm` (`YtUNj`)
- `Cloak - Swap Pending` (`AtV29`)
- `Cloak - Swap In Progress` (`8GxMW`)
- `Cloak - Swap Complete` (`BFHA6`)
- `Cloak - Swap Detail` (`1OMSF`)
- Activity list source remains `Cloak - Activity` (`09FBd`)

### Final User Flow
1. User configures swap on `rrBFO`.
2. User confirms on `YtUNj`.
3. User sees pending/queued state on `AtV29`.
4. User sees execution progress on `8GxMW`:
   - round indicators
   - centered icon
   - no `Done / In progress` text labels
5. On success, user lands on `BFHA6` with final output summary.
6. From activity tap (`Swap STRK -> ETH`), user opens `1OMSF` for full swap detail.

### Final Content Model (Private Swap)
- Units use `tongo units` language in swap flow.
- Swap success output includes:
  - Pair
  - Sent amount
  - Received amount
  - Transaction hash
- Swap detail includes:
  - headline output amount
  - settled status
  - Pair / Sent / Received / Rate / Route
  - swap tx hash
  - explorer CTA

### Global UI Consistency Outcomes
- Bottom navigation standardized to:
  - `Home`, `Send`, `Wallet`, `Swap`, `Activity`
- Ward header behavior finalized:
  - ward account: `logo <> Ward Mode <> magic icon`
  - non-ward account: `logo <> magic icon`
- Home quick actions finalized to single row:
  - `Send`, `Shield`, `Unshield`, `Swap`

### Implementation / Handoff Notes
- No placeholders remain on final edited screens.
- `cloak.pen` JSON validated after updates.
- Known environment limitation:
  - Direct write to `/Users/mohit/Desktop/karnot-vault/cloak` is blocked in this session sandbox.
  - Canonical local record for this work:
    - `/Users/mohit/Desktop/personal_projects/cloak/notes/multi-token-ui-design-updates-2026-02-21.md`
