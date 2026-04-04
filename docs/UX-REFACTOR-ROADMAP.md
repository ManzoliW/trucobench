# TrucoBench UX Refactor Roadmap — 10/10 Plan

> Initial score: 3.7/10. Target: 9/10 across all areas.
> Created: 2026-04-03. Last updated: 2026-04-03.

## Progress Tracker

| Phase | Focus | Status | Score Lift |
|-------|-------|--------|-----------|
| 1 | Error Prevention & Feedback | **DONE** | 1→8 |
| 2 | Seat Picker & Key UX | **DONE** (earlier session) | 2→8 |
| 3 | Onboarding | **PARTIAL** (template hints done) | 4→6 |
| 4 | Visual Unification | TODO | 3→8 |
| 5 | Gameplay Polish | TODO | 6→9 |
| 6 | Chat & Social | TODO | 4→8 |
| 7 | Settings Clarity | TODO | 5→9 |
| 8 | Post-Game | TODO | 4→9 |
| 9 | Mobile Excellence | TODO | 4→9 |
| 10 | Identity & Brand | TODO | 3→9 |

## What's Been Built

### Phase 1: Error Prevention & Feedback — DONE
- [x] Toast notification system (`Toast.tsx`) — error/warning/success/info, auto-dismiss 5s, stacks 3
- [x] Pre-deal validation — `missingKeySeats` disables Deal button when LLM seats lack keys
- [x] Warning text on Deal: "GPT-4o, DeepSeek R1 — tap seat to add API key"
- [x] Template descriptions: each preset shows hint ("No API key needed" / "Needs API keys for all 4 models")
- [x] Server errors via toast (no more raw "Server error (500)" on screen)
- [x] Removed `startError` state — toasts handle all feedback
- [x] ToastContainer in root layout (always available)

### Phase 2: Seat Picker & Key UX — DONE
- [x] Inline key entry in SeatPicker — tap model, enter key right there
- [x] Green dot = key saved, "Claude Code" = CLI available, "needs key" = no key
- [x] Claude CLI auto-detection (`/api/check-claude` endpoint)
- [x] Server-side fallback: Anthropic models use Claude CLI when no API key
- [x] Keys stored in localStorage, sent with game config
- [x] Removed separate provider mode selector (default "direct")
- [x] Removed separate API Keys collapsible section
- [x] Removed provider picker modal

### Phase 3: Onboarding — PARTIAL
- [x] Template descriptions with key requirements (EN/PT/ES)
- [ ] Empty table guidance ("Tap a seat to add a player...")
- [ ] First-time tooltip flow (3 steps, localStorage flag)
- [ ] Animated seat pulse to draw attention

## Remaining Phases

### Phase 4: Visual Unification (3→8) — HIGH PRIORITY
The biggest architectural change. Currently the lobby (Table.tsx) and gameplay (GameBoard.tsx) are two separate UIs.

- [ ] Gameplay ON the table — don't swap to a separate GameBoard component
- [ ] Cards deal from center to seats (animation)
- [ ] Your hand at South seat edge
- [ ] Opponent card backs at their seat positions
- [ ] Score on table surface (where branding was)
- [ ] Vira card at center
- [ ] Action buttons attached to South seat
- [ ] Smooth transitions: lobby → gameplay → post-game

### Phase 5: Gameplay Polish (6→9)
- [ ] Card attribution — show who played each card in the trick
- [ ] Winning card highlight after trick resolution
- [ ] Escalation drama — spotlight effect, large "TRUCO!" text on table
- [ ] Score changes with floating +3 numbers
- [ ] "Your turn" text at your seat
- [ ] Larger timer countdown with color progression

### Phase 6: Chat & Social (4→8)
- [ ] Chat bubbles anchored to seats (not corner)
- [ ] Phrase bar as tabs with context-sensitive options
- [ ] Signals integrated into seat avatars (not toasts)
- [ ] AI reasoning as styled speech bubbles

### Phase 7: Settings Clarity (5→9)
- [ ] Descriptive pill labels: "Your turn: 60s", "AI detail: Standard", "Creativity: 0.7"
- [ ] Slide-out settings panel with labels, descriptions, previews
- [ ] Mobile: bottom sheet instead of pills
- [ ] Hover tooltips on each setting

### Phase 8: Post-Game (4→9)
- [ ] No modal — winning team seats glow
- [ ] Score on table center
- [ ] "Deal again" button (same players, new game)
- [ ] "Change table" button (reset to lobby)
- [ ] Brief stats card (rounds played, trucos called, bluffs)
- [ ] History drawer replacing sidebar log

### Phase 9: Mobile Excellence (4→9)
- [ ] Dedicated mobile gameplay layout (hand at bottom, opponents at top)
- [ ] Bottom toolbar for action buttons (thumb zone)
- [ ] Swipe gestures (swipe card to play)
- [ ] Bottom sheet for settings
- [ ] 60fps card animations

### Phase 10: Identity & Brand (3→9)
- [ ] TrucoBench logo mark (not just text)
- [ ] AI model proper avatars (provider logos, not just circles)
- [ ] Heuristic robot character, Random dice character
- [ ] Loading state with shuffling deck animation
- [ ] Optional sound design (card play, truco call, win jingle)

## Priority Order

**Done:** Phases 1-2 (quick wins, worst problems fixed)
**Partial:** Phase 3 (template hints done, onboarding flow remaining)
**Next:** Phase 4 (big architectural change — Living Table unification)
**Then:** Phases 5-10 (polish and delight, can be done in any order)

## Design Documents

- `docs/LIVING-TABLE-DESIGN.md` — Single-screen table design spec
- `docs/LIVING-TABLE-PLAN.md` — Original implementation plan
- `docs/MOBILE-LOBBY-DESIGN.md` — Mobile vertical layout
- `docs/UNIFIED-SEAT-PICKER-DESIGN.md` — Inline key entry in seat picker
- `docs/UX-REFACTOR-ROADMAP.md` — This document
