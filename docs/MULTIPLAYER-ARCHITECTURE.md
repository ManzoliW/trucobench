# Multiplayer Architecture Plan

> Planning doc for the "Invite a Friend" feature. No implementation yet.

## Current State

- All games are **single-machine** — human + AI on the same Next.js server
- SSE (Server-Sent Events) streams game events to one browser tab
- `GameSession` lives in server memory (`globalThis` Map)
- Human input goes through `POST /api/game/[id]/action`

## Target Experience

1. Player A creates a game, gets a **room code** (e.g. `TRUCO-4X7K`)
2. Player A shares code with Player B (link or text)
3. Player B joins via code — sees the same table, takes an open seat
4. Game plays in real-time, both see card plays, truco calls, chat

## Architecture Options

### Option A: SSE + Polling (Simplest)

Keep the current SSE architecture. Both players connect to the same `/api/game/[id]/stream` endpoint.

```
Player A browser  ←SSE←  Next.js server  →SSE→  Player B browser
         ↓ POST /action          ↑ POST /action ↓
```

**Pros:** No new infrastructure, works on Vercel/serverless
**Cons:** Higher latency (SSE is one-way, actions need POST round-trip), no instant feedback

### Option B: WebSocket (Best UX)

Add a WebSocket server alongside Next.js. Both players connect to `ws://host/game/[id]`.

```
Player A browser  ←WS→  WS Server  ←WS→  Player B browser
                         ↕ GameSession
```

**Pros:** Instant bidirectional, natural for real-time games
**Cons:** Requires long-lived connections (not Vercel-friendly), needs separate WS server

### Option C: WebSocket via Partykit/Durable Objects (Production)

Use Partykit or Cloudflare Durable Objects for managed WebSocket rooms.

**Pros:** Scales, managed infra, built-in room concept
**Cons:** External dependency, deployment complexity

## Recommended: Option A first, upgrade to B later

SSE + POST is already built. Adding multiplayer is just:
1. Allow multiple SSE listeners per game session
2. Add room code generation + join endpoint
3. Handle seat claiming (who plays which seat)

### Implementation Steps

#### Phase 1: Room Codes
- Add `POST /api/game/create` with `roomCode` generation (6-char alphanumeric)
- Add `GET /api/game/join/[code]` to resolve code → gameId
- Store room codes in the session Map

#### Phase 2: Multi-Client SSE
- Current: one `EventSource` per game
- Change: allow N `EventSource` connections per game
- Each client identifies with a `clientId` (cookie or URL param)
- Server broadcasts events to all connected clients

#### Phase 3: Seat Claiming
- `POST /api/game/[id]/claim-seat` — { clientId, seatIndex }
- Only the client who claimed a human seat can submit actions for it
- Other clients see the game but can't act on claimed seats

#### Phase 4: Reconnection
- Client stores `gameId` + `clientId` in sessionStorage
- On disconnect/reload, reconnect to same game
- Server replays missed events (keep event log in session)

#### Phase 5: Lobby UI
- Replace "Coming soon" in SeatPicker with share link
- Show "Waiting for Player B..." state
- Add copy-to-clipboard for room code

## Data Model Changes

```typescript
interface GameSession {
  // ... existing fields ...
  roomCode: string | null;           // e.g. "TRUCO-4X7K"
  clients: Map<string, {             // connected clients
    seatIndex: number | null;        // claimed seat, or null (spectator)
    stream: WritableStreamDefaultWriter | null;
  }>;
}
```

## Security Considerations

- Room codes should be unguessable (6+ chars, alphanumeric)
- Rate-limit room creation (prevent spam)
- Auto-expire rooms after 1 hour of inactivity
- Validate that only the seat owner can submit actions
- Don't leak opponent hands to wrong clients (existing `Observation` model already handles this)

## Timeline Estimate

| Phase | Scope |
|-------|-------|
| Room codes | Small — new endpoint + code generator |
| Multi-client SSE | Medium — refactor event broadcasting |
| Seat claiming | Small — auth per seat |
| Reconnection | Medium — event replay, state recovery |
| Lobby UI | Small — UI changes in SeatPicker |

Phase 1-3 is an MVP. Phase 4-5 for production readiness.
