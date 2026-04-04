# Mobile Lobby Layout Design

> Vertical list layout for phones (<640px). Spatial table preserved on tablet/desktop (640px+).

## Problem

The spatial table with absolute-positioned seats is unusable on mobile:
- Seats overlap center content
- "+" buttons barely visible
- Settings collide with South seat
- Text unreadable at scale-75

## Solution

Replace the spatial table on mobile with a vertical list layout.

## Layout (top to bottom)

### 1. Header strip (fixed, 44px)
- TrucoBench wordmark left
- Locale toggle right

### 2. Opponent zone
- **North seat** (partner): full-width tappable row
- **West + East seats** (opponents): two half-width rows side by side

### 3. Table center
- Quick templates when empty (full-width stacked buttons)
- "Deal" button when seats are filled

### 4. Your seat (South)
- Prominent identity row with team color highlight
- "Sit here" button if not seated

### 5. Settings bar
- Single row of pills: timer, prompt, temperature, provider
- Tap-to-cycle, always visible, thumb-reachable

### 6. Help link (subtle, bottom)

## Key Design Choices

| Decision | Why |
|----------|-----|
| Partner above you, opponents side-by-side | Team = vertical stack, opponents = horizontal pair |
| Settings below seat | Thumb zone, never collides |
| sm: (640px) cutoff | All phones get list, tablets get spatial table |

## Breakpoint behavior

- **<640px**: Vertical list layout
- **>=640px**: Spatial table with seats around edges (existing)
