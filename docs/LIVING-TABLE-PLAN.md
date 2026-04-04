# Living Table — Implementation Plan

## Phase 1: Table Shell & Seat Component
Create the table layout and seat system. Replace page.tsx with the single-screen table.

- [ ] Create `app/components/Table.tsx` — the persistent table canvas (felt background, 4 seat positions)
- [ ] Create `app/components/Seat.tsx` — the seat component with empty/filled/active/thinking states
- [ ] Create `app/components/SeatPicker.tsx` — popover/bottom-sheet for seat configuration
- [ ] Rewrite `app/page.tsx` — single screen that renders Table, no separate setup form
- [ ] Wire seat filling to game config state (same data, spatial UI)
- [ ] Quick templates in table center ("Quick game", "You + 3 AIs", "AI Battle")
- [ ] "Deal" button appears when 2+ seats filled

**Exit criteria:** You can fill seats, see player identity, and start a game — all from the table.

## Phase 2: Table-Surface Settings
Move settings from the old form onto the table surface.

- [ ] Timer setting on vira card spot (tap to cycle)
- [ ] Prompt mode pill on table edge (tap to cycle)
- [ ] Temperature control at center (pre-game only)
- [ ] Provider mode: contextual one-time prompt on first AI pick
- [ ] Language toggle outside table (top-right)
- [ ] Settings lock during active play

**Exit criteria:** All configuration possible without any form or menu.

## Phase 3: Gameplay on the Living Table
Migrate gameplay from GameBoard.tsx into the table.

- [ ] Deal animation (cards from center to seats)
- [ ] South hand display (fanned at bottom edge)
- [ ] Opponent card backs at their seats
- [ ] Trick area at center (cards land in seat-mapped positions)
- [ ] Vira card display at top-center
- [ ] Turn indicator (pulse ring on active seat)
- [ ] Action buttons attached to South seat (Truco/Accept/Fold/Raise)
- [ ] Timer countdown at active seat
- [ ] Escalation badge on table surface
- [ ] Trick dots (win/lose/draw indicators)

**Exit criteria:** Full game playable on the new table. Old GameBoard can be removed.

## Phase 4: Social Layer
Chat, signals, and identity polish.

- [ ] Chat bubbles anchored to seats (not floating corner)
- [ ] Chat phrase bar attached to South seat area
- [ ] Signal flashes at partner/opponent seats
- [ ] Signal send panel at South seat
- [ ] AI avatar icons (provider logos, bot icons)
- [ ] Thinking state with spinner at AI seats

**Exit criteria:** Full social experience — chat, signals, identity all spatial.

## Phase 5: Post-Game & Transitions
Win sequence, deal-again, and table reset.

- [ ] Win: team seats glow, score display, winner names
- [ ] "Deal again" button (same players, new game)
- [ ] "Change table" button (reset to empty)
- [ ] Between-rounds: cards sweep off, score bumps, auto-deal next
- [ ] History drawer (replaces sidebar log, on-demand)
- [ ] Remove old page.tsx setup form and GameBoard.tsx

**Exit criteria:** Complete lifecycle — empty table → fill seats → play → win → deal again or reset.

## Phase 6: Polish & Mobile
Responsive design, animations, accessibility.

- [ ] Mobile layout (vertical table, bottom-sheet seat picker)
- [ ] Tablet intermediate layout
- [ ] Touch target compliance (44px minimum)
- [ ] Contrast compliance (WCAG AA)
- [ ] Reduced motion support
- [ ] ARIA labels on all interactive elements
- [ ] Keyboard navigation through seats and actions
