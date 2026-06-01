# Truco Rules Fix — Design Document

**Date:** 2026-04-04
**Status:** Design approved, pending implementation

---

## Understanding Summary

- **What:** Fix three engine bugs in Truco escalation mechanics + add configurable TRUCO timing variant
- **Why:** Gameplay is broken — wrong players respond to TRUCO in 4P, cards can't be played after acceptance, TRUCO timing doesn't match real rules
- **Who:** All players using the web UI and CLI
- **Constraints:** Must update all existing tests, changes affect both 2P and 4P modes
- **Non-goals:** Not redesigning the escalation FSM itself

## Assumptions

- Escalation FSM (NORMAL→TRUCO→SEIS→NOVE→DOZE) is correct
- 2P TRUCO responder logic is correct (opponent responds)
- Web game-manager loop needs updates for 4P team decision flow

---

## Bug Fixes

### Bug 1: TRUCO Timing

**Problem:** TRUCO can be called on the very first trick with no restrictions.

**Fix:** Add `trucoTiming` config with three options:
- `"after-first-trick"` — TRUCO only available after first trick resolves (default)
- `"after-first-card"` — TRUCO available after at least one card played in current trick
- `"anytime"` — no restriction

**Files:** `types.ts`, `game.ts:getLegalActions()`, `game4p.ts:getLegalActions()`

**Logic:**
```
let escalationAllowed = true
if timing == "after-first-trick":
  escalationAllowed = round.tricks.length > 0
elif timing == "after-first-card":
  escalationAllowed = round.currentTrick.firstCard !== null || round.tricks.length > 0
// "anytime" = no check
```

### Bug 2: 4P Team Decision

**Problem:** `getCurrentSeat()` returns hardcoded seat 0 or 1 instead of letting both team members respond.

**Fix:** When escalation is pending, `getCurrentSeat()` returns `null`. Both members of the responding team can act — first response wins.

- Either team member accepting → escalation accepted
- Either team member folding → round ends (but partner can override by accepting first)
- Either raising → counter-escalation

**Files:** `game4p.ts:getCurrentSeat()`, `game4p.ts:getLegalActions()`, `game4p.ts:step()`

**Validation in `step()`:** Only seats on the responding team can submit ACCEPT/FOLD/RAISE.

### Bug 3: Turn Restoration After Escalation

**Problem:** After TRUCO is accepted, the player who called it can't play their card.

**Fix:** Add `initiatedBySeat` to escalation state. Tracks who was active when escalation chain started.

```typescript
interface EscalationState {
  level: EscalationLevel;
  pendingRequest: EscalationLevel | null;
  requestedBy: number | null;
  initiatedBySeat: number | null;  // NEW
}
```

**Flow:**
1. Seat X's turn → calls TRUCO → `initiatedBySeat = X`
2. Opposing team responds (accept/fold/raise chain)
3. After resolution: `getCurrentSeat()` checks `initiatedBySeat` — if set and no pending request and that seat hasn't played yet → return that seat
4. After seat plays card → clear `initiatedBySeat`

---

## Config & UI

### Engine Types
```typescript
export type TrucoTiming = "anytime" | "after-first-card" | "after-first-trick";
```

Added to `Game` and `Game4P` constructor options, default `"after-first-trick"`.

### Web GameConfig
Add `trucoTiming: TrucoTiming` to `GameConfig` in `game-manager.ts`.

### Lobby UI
Cycle button in advanced settings panel:
```
[After 1st trick] → [After 1st card] → [Anytime]
```

### Web Game Loop (4P)
When `getCurrentSeat()` returns `null` (team escalation pending):
- Both seats on responding team can act
- AI: ask first one clockwise from requester
- Human: wait for human input
- Emit `"waiting_team"` SSE event

---

## Decision Log

| # | Decision | Alternatives | Rationale |
|---|----------|-------------|-----------|
| 1 | TRUCO timing as 3-option config | Hard-code one rule | Regional variants |
| 2 | Default "after-first-trick" | Default "anytime" | Most common variant |
| 3 | Both team members can respond (first wins) | Only next clockwise | Strategic bluffing |
| 4 | getCurrentSeat() returns null for team decisions | Return specific seat | Enables "either responds" |
| 5 | Track initiatedBySeat on escalation state | Track on round | Keeps data together |
| 6 | TRUCO doesn't consume a turn | TRUCO as action | Real-world rules |
| 7 | Full test coverage | Minimal | User chose full |
| 8 | Config in lobby advanced panel | Engine-only | User preference |

---

## Files to Modify

### Engine
1. `packages/engine/src/types.ts` — Add `TrucoTiming` type, update `EscalationState`
2. `packages/engine/src/escalation.ts` — Add `initiatedBySeat` to initial state, handle in `processEscalation()`
3. `packages/engine/src/game.ts` — Accept `trucoTiming` option, check in `getLegalActions()`, handle turn restoration
4. `packages/engine/src/game4p.ts` — Same + rewrite `getCurrentSeat()` for team decisions + validate responding team in `step()`
5. `packages/engine/src/index.ts` — Export new types

### Web
6. `packages/web/lib/game-manager.ts` — Add `trucoTiming` to `GameConfig`, pass to engine, update 4P loop for null currentSeat
7. `packages/web/app/components/Table.tsx` — Add `trucoTiming` state + cycle button in advanced settings
8. `packages/web/lib/i18n.ts` — Add truco timing labels (3 locales)

### Tests
9. `packages/engine/tests/` — Update existing escalation tests, add new tests for timing variants, team decisions, turn restoration
