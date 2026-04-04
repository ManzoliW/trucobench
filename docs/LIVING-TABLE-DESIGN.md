# The Living Table — UI Redesign

> Design document for TrucoBench web UI redesign.
> Created: 2026-04-03 via brainstorming session.

## Summary

Replace the two-screen flow (setup page + game board) with a **single persistent table screen** that handles configuration, gameplay, and post-game. The table is always visible. Configuration is spatial (tap seats to fill them), not form-based.

## Aesthetic Direction

**Brazilian bar meets casino polish.** The warmth and chaos of a real Truco bar table (avatars, trash talk, personality) with the spatial clarity of a poker room (clean card layout, readable state, professional enough for paper screenshots).

## The Three Table States

### 1. Empty State (Lobby)

- Four seats around a rounded rectangular felt table
- Each seat shows a dashed outline with "+" icon — tappable
- Center shows TrucoBench branding on the felt
- Below branding: three quick templates ("Quick game" / "You + 3 AIs" / "AI Battle")
- Templates disappear once any seat is manually filled
- Table-surface settings visible: timer (vira spot), prompt mode (table edge), temperature (center dot)

### 2. Seated State (Pre-game)

- Filled seats show player identity (avatar + nameplate + provider badge)
- Empty seats still tappable
- "Deal" button appears at center when 2+ seats are filled
- Settings still adjustable on the table surface
- "x" on each filled seat to remove/change

### 3. Playing State (In-game)

- Cards deal with animation from center to seats
- South seat shows hand fanned out at bottom edge
- Other seats show card backs
- Center is the trick area (played cards land in seat-mapped slots)
- Vira card at top-center
- Timer, escalation badge, trick dots on the table surface
- Chat bubbles anchor to seats
- Signals flash at partner/opponent seat positions
- Action buttons (Truco, Accept, Fold, Raise) attached to South seat

## Seat Component

Four visual states:

| State | Shows |
|-------|-------|
| Empty | Dashed outline + "+" icon. Tappable. |
| Filled (pre-game) | Avatar, name, provider badge. "x" to remove. |
| Active (in-game) | Identity + cards + turn indicator + timer. |
| Thinking | Spinner on AI seats during their turn. |

## Seat Picker

Compact popover anchored to the tapped seat (bottom sheet on mobile).

Three sections:
1. **Quick picks**: "Sit here" (human), Heuristic Bot, Random Bot
2. **AI Models**: Grouped by provider, showing badge + name + hint. Filtered by provider mode.
3. **Future**: "Invite a friend" grayed-out placeholder.

Provider mode is set once, contextually, when first AI is picked.

## Player Identity (Three Layers)

1. **Avatar**: Provider logo for LLMs, robot/dice icon for bots, colored silhouette for humans
2. **Nameplate**: Display name + provider color accent
3. **Status**: Ready / thinking / turn indicator / countdown / last action flash

Team identity is spatial + color (amber for S+N, teal for W+E). No "Team A/B" labels.

## Table-Surface Settings (No gear menu)

| Setting | Location on table | Pre-game | In-game |
|---------|------------------|----------|---------|
| Turn timer | Vira card spot (top-center) | Clock face, tap to cycle | Countdown overlay on vira |
| Prompt mode | Table edge near South | Pill, tap to cycle | Escalation level badge |
| Temperature | Center dot | Draggable/tappable | Hidden |
| Provider mode | Table edge | Badge (set once) | Badge (read-only) |
| Language | Outside table (top-right of page) | Toggle | Toggle |

## Chat & Signals

- Chat bubbles anchor to the seat that sent them (not a corner)
- Signals flash at the relevant seat (partner or opponent)
- No sidebar game log — replaced by a history drawer (on-demand)

## Post-Game

- No modal overlay
- Winning team's seats glow with team color, losing team dims
- Final score in center with winner names
- Two actions on felt: "Deal again" (same players) / "Change table" (reset to empty)

## Decision Log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Single table screen | Table IS the app. No cognitive shift between phases. |
| 2 | Bar energy + casino polish | Dual audience: researchers + players. |
| 3 | Empty table walkup | Empty seat = configuration = future invite. |
| 4 | Seat picker popover | Spatial config at the seat itself. |
| 5 | Settings on table surface | No hidden menus. Table zones repurpose between states. |
| 6 | Provider set once contextually | One table = one provider. Future BYOK per player. |
| 7 | Avatar + nameplate + status identity | Each seat feels like a person/personality. |
| 8 | Chat anchored to seats | Positional = natural attribution. |
| 9 | Signals flash at seats | Physical gesture metaphor. |
| 10 | No log sidebar, history drawer instead | Table tells the story. Log is a research tool. |
| 11 | No win modal, table lights up | Table IS the result. "Deal again" is one tap. |
| 12 | Presets as table templates | Disappear once manual config starts. |

## Multiplayer Extensibility

- Empty seats = future invite slots
- Per-seat identity supports remote players
- BYOK per-seat provider in future
- Nothing in this design blocks multiplayer
