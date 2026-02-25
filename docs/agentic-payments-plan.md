# Agentic Payments Plan (Cloak)

## Goal
Ship an `Agent Mode` that can take free-text user commands and execute payment actions through existing Cloak routing (Ward + 2FA + direct), with local session/history first and Supabase later.

## Scope in this iteration
- Text-to-intent for:
  - private send
  - public send
  - session history query
  - start new session
- Session/history persistence in local JSON file
- Agent UI with:
  - session list
  - chat timeline
  - execution button when plan is complete
- End-to-end execution by reusing existing SDK integration (`useTongoTransfer`, `useTransactionRouter`)
- Unit tests for parser and service/session flow

## Architecture

### 1) Agent backend (Next.js API)
- Route: `POST /api/agent/chat`
- Route: `GET /api/agent/chat?sessionId=...`
- Domain modules:
  - `lib/agent/types.ts` - intent/session contracts
  - `lib/agent/parser.ts` - deterministic parser + contact resolver
  - `lib/agent/session-store.ts` - JSON persistence
  - `lib/agent/service.ts` - planner, replies, session mutation

### 2) Agent frontend
- Page: `app/agent/page.tsx`
- Features:
  - natural language input
  - previous session explorer
  - display parsed plan and missing fields
  - execute ready plan

### 3) Execution path
- `send_private` -> `useTongoTransfer()` -> existing route logic (ward/2FA/direct)
- `send_public` -> ERC20 transfer calldata -> `useTransactionRouter()`
- Post-execution metadata stored in local tx notes for user visibility

## Session model
`AgentSession`
- `id`
- `title`
- `createdAt`
- `updatedAt`
- `messages[]`

`AgentMessage`
- `id`
- `role` (`user` | `assistant`)
- `text`
- `createdAt`
- optional parsed `intent`

Store path defaults to:
- `./.agent-data/sessions.json`

Override for tests/dev:
- `CLOAK_AGENT_STORE_PATH=/tmp/sessions.json`

## Intent model
`AgentIntentType`
- `send_private`
- `send_public`
- `history_query`
- `start_session`
- `unknown`

`AgentPlan`
- `requiresExecution`
- `readyToExecute`
- `missing[]`
- `intent`

## Why this design
- Keeps risk low by reusing existing transaction router and approval systems.
- Makes agent layer composable: parser/planner can later be replaced by LLM tool-calling without changing execution code.
- Provides immediate local demo while preserving a clean migration path to Supabase.

## Next phases

### Phase 2: LLM planner (optional, controlled)
- Add provider adapter (`openai`/`anthropic`) with strict JSON schema output.
- Keep deterministic parser as fallback.
- Enforce policy guardrails before execution.

### Phase 3: Supabase persistence
- Mirror sessions/messages into Supabase tables:
  - `agent_sessions`
  - `agent_messages`
- Add user-scoped RLS policies.

### Phase 4: Voice
- `POST /api/voice/intent` with Sarvam STT.
- STT output feeds same planner/execution pipeline.

### Phase 5: Advanced intents
- recurring payments
- conditional buys
- monitored opportunities
- budget envelope + risk gates

## Testing strategy
- Unit tests:
  - parser extraction and contact matching
  - service session creation/history responses
- Integration tests (next):
  - mock API + execute plan in browser test harness
  - ward + 2FA pathways

## Operational notes
- This implementation never bypasses wallet/ward controls.
- No secret keys are stored for autonomous signing in this phase.
- Agent execution is explicit: user still triggers `Execute`.

## Mobile integration (Android + iOS)
- Added `Agent` tab in mobile navigation.
- Added `AgentScreen` with:
  - session list + history fetch
  - free-text prompt input
  - plan card + execute action
  - in-app server URL configuration
- Added mobile agent API client (`src/lib/agentApi.ts`) with:
  - configurable server URL saved in AsyncStorage
  - defaults:
    - Android emulator: `http://10.0.2.2:3000`
    - iOS simulator: `http://127.0.0.1:3000`
- Agent execution on mobile reuses `useTransactionRouter`:
  - private send -> `transfer`
  - public send -> `erc20_transfer`
- Contact resolution is passed from mobile saved contacts to backend parser.
