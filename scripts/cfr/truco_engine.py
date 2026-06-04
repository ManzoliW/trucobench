"""
truco_engine.py — Pure-Python re-implementation of Truco Paulista (2-player).

Faithfully mirrors the TypeScript engine in packages/engine/src/.
No external dependencies — works standalone and as the substrate for the
OpenSpiel CFR wrapper.

Card representation
-------------------
Cards are integers 0-39:  card_id = suit_idx * 10 + rank_idx
  suits: ouros=0, espadas=1, copas=2, paus=3
  ranks: 4=0, 5=1, 6=2, 7=3, Q=4, J=5, K=6, A=7, 2=8, 3=9

Strength
--------
Regular cards  : rank_idx  (0-9)
Manilha (PAULISTA): 10 + suit_idx  (ouros=10, espadas=11, copas=12, paus=13)
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SUITS = ["ouros", "espadas", "copas", "paus"]   # indices 0-3
RANKS = ["4", "5", "6", "7", "Q", "J", "K", "A", "2", "3"]  # indices 0-9

WIN_SCORE = 12
MAO_DE_ONZE_SCORE = 11

ESCALATION_ORDER = ["NORMAL", "TRUCO", "SEIS", "NOVE", "DOZE"]
ESCALATION_POINTS = {"NORMAL": 1, "TRUCO": 3, "SEIS": 6, "NOVE": 9, "DOZE": 12}

# Action type constants
A_PLAY     = "PLAY_CARD"   # + card index (0-2 in hand)
A_TRUCO    = "TRUCO"
A_ACCEPT   = "ACCEPT"
A_RAISE    = "RAISE"
A_FOLD     = "FOLD"

# ---------------------------------------------------------------------------
# Card helpers
# ---------------------------------------------------------------------------

def card_id(suit: int, rank: int) -> int:
    return suit * 10 + rank

def suit_of(c: int) -> int:
    return c // 10

def rank_of(c: int) -> int:
    return c % 10

def manilha_rank(vira: int) -> int:
    """Rank index that is the manilha for this vira."""
    return (rank_of(vira) + 1) % 10

def card_strength(c: int, vira: int) -> int:
    """Return numeric strength (higher = stronger)."""
    mr = manilha_rank(vira)
    if rank_of(c) == mr:
        return 10 + suit_of(c)   # manilha: 10-13
    return rank_of(c)            # regular: 0-9

def compare_cards(a: int, b: int, vira: int) -> int:
    return card_strength(a, vira) - card_strength(b, vira)

def card_to_str(c: int) -> str:
    suit_sym = ["♦", "♠", "♥", "♣"]
    return f"{RANKS[rank_of(c)]}{suit_sym[suit_of(c)]}"

FULL_DECK: List[int] = [card_id(s, r) for s in range(4) for r in range(10)]

# ---------------------------------------------------------------------------
# Card abstraction (6 strength buckets for tractable CFR)
# ---------------------------------------------------------------------------

def card_bucket(c: int, vira: int) -> int:
    """
    Map a card to one of 6 strength buckets:
      5 = ZAP        (paus manilha, strongest)
      4 = STRONG_MAN (espadas + copas manilha)
      3 = WEAK_MAN   (ouros manilha)
      2 = HIGH       (3, 2)
      1 = MID        (A, K, J)
      0 = LOW        (4, 5, 6, 7, Q)
    """
    s = card_strength(c, vira)
    if s == 13: return 5   # zap
    if s in (11, 12): return 4   # strong manilha
    if s == 10: return 3   # weak manilha
    if s in (8, 9): return 2    # high (2, 3)
    if s in (5, 6, 7): return 1 # mid (J, K, A)
    return 0                    # low (4, 5, 6, 7, Q)

def hand_to_buckets(hand: List[int], vira: int) -> Tuple[int, ...]:
    """Sorted tuple of bucket ids for a hand (order-independent abstraction)."""
    return tuple(sorted(card_bucket(c, vira) for c in hand))

# ---------------------------------------------------------------------------
# Game state
# ---------------------------------------------------------------------------

@dataclass
class EscalationState:
    level: str = "NORMAL"
    pending: Optional[str] = None        # requested level
    requested_by: Optional[int] = None   # player id
    last_escalated_by: Optional[int] = None
    initiated_by: Optional[int] = None   # who started the escalation chain

@dataclass
class TrickResult:
    first_player: int
    first_card: int
    second_card: int
    winner: Optional[int]   # None = draw

@dataclass
class RoundState:
    hands: List[List[int]]          # hands[0], hands[1]
    vira: int
    tricks: List[TrickResult] = field(default_factory=list)
    first_player: int = 0           # who plays first this trick
    first_card: Optional[int] = None  # card already played this trick
    escalation: EscalationState = field(default_factory=EscalationState)
    mao_de_onze_team: Optional[int] = None   # None if neither at 11
    mao_de_onze_decided: bool = True          # False = waiting for decision
    mao_de_ferro: bool = False

@dataclass
class GameState:
    scores: List[int] = field(default_factory=lambda: [0, 0])
    round: Optional[RoundState] = None
    round_number: int = 0
    first_player: int = 0   # who goes first in the current round
    winner: Optional[int] = None

# ---------------------------------------------------------------------------
# Action encoding for CFR (integer actions)
# ---------------------------------------------------------------------------
# 0-2 : PLAY_CARD card_index 0/1/2
# 3   : TRUCO
# 4   : ACCEPT
# 5   : RAISE
# 6   : FOLD

ACTION_PLAY = [0, 1, 2]
ACTION_TRUCO  = 3
ACTION_ACCEPT = 4
ACTION_RAISE  = 5
ACTION_FOLD   = 6
NUM_ACTIONS   = 7

def action_to_tuple(a: int):
    """Convert integer action to (type, card_idx)."""
    if a <= 2:
        return (A_PLAY, a)
    return {3: (A_TRUCO, None), 4: (A_ACCEPT, None),
            5: (A_RAISE, None), 6: (A_FOLD, None)}[a]

# ---------------------------------------------------------------------------
# Game logic
# ---------------------------------------------------------------------------

class TrucoGame:
    """
    Mutable 2-player Truco Paulista game.
    Faithful translation of packages/engine/src/game.ts.
    trucoTiming fixed to 'after-first-trick' (standard).
    """

    def __init__(self, seed: Optional[int] = None):
        self._rng = random.Random(seed)
        self.state = GameState()
        self._start_new_round()

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def reset(self, seed: Optional[int] = None) -> None:
        self._rng = random.Random(seed)
        self.state = GameState()
        self._start_new_round()

    def current_player(self) -> Optional[int]:
        """Returns 0, 1, or None if game over."""
        s = self.state
        if s.winner is not None:
            return None
        r = s.round
        if r is None:
            return None
        if not r.mao_de_onze_decided:
            return r.mao_de_onze_team
        if r.escalation.pending is not None:
            return 1 - r.escalation.requested_by
        if r.first_card is None:
            return r.first_player
        return 1 - r.first_player

    def legal_actions(self, player: int) -> List[int]:
        r = self.state.round
        if r is None or self.state.winner is not None:
            return []

        # Mão de onze decision
        if not r.mao_de_onze_decided:
            if r.mao_de_onze_team == player:
                return [ACTION_ACCEPT, ACTION_FOLD]
            return []

        esc = r.escalation

        # Escalation response
        if esc.pending is not None and esc.requested_by != player:
            actions = [ACTION_ACCEPT, ACTION_FOLD]
            if self._can_raise(esc, player):
                actions.append(ACTION_RAISE)
            return actions

        # Waiting for opponent response
        if esc.pending is not None and esc.requested_by == player:
            return []

        # Post-escalation card-play turn restoration
        if esc.initiated_by is not None and esc.pending is None:
            if esc.initiated_by != player:
                return []

        # Check it's actually this player's card turn
        else:
            is_first_card = r.first_card is None
            if is_first_card:
                if r.first_player != player:
                    return []
            else:
                if r.first_player == player:
                    return []

        # Card play actions
        actions = list(range(len(r.hands[player])))  # PLAY_CARD 0,1,...

        # Escalation only after first trick
        if len(r.tricks) > 0 and not r.mao_de_ferro:
            if self._can_escalate(esc, player):
                actions.append(ACTION_TRUCO)

        return actions

    def step(self, player: int, action: int):
        """Apply action. Returns (round_done, game_done, scores)."""
        r = self.state.round
        assert r is not None
        assert self.state.winner is None

        if not r.mao_de_onze_decided and r.mao_de_onze_team == player:
            return self._handle_mao_de_onze(player, action)

        if action == ACTION_TRUCO:
            return self._handle_escalation(player, A_TRUCO)
        if action == ACTION_ACCEPT:
            return self._handle_escalation(player, A_ACCEPT)
        if action == ACTION_RAISE:
            return self._handle_escalation(player, A_RAISE)
        if action == ACTION_FOLD:
            return self._handle_escalation(player, A_FOLD)

        # PLAY_CARD (action is the card index in hand)
        return self._handle_play_card(player, action)

    def clone(self) -> "TrucoGame":
        """Deep clone for MCCFR rollout without mutating the original."""
        import copy
        g = TrucoGame.__new__(TrucoGame)
        g._rng = copy.copy(self._rng)
        g.state = _deep_clone_state(self.state)
        return g

    # ------------------------------------------------------------------
    # Information state string (for CFR lookup)
    # ------------------------------------------------------------------

    def info_state_string(self, player: int) -> str:
        """
        Encodes only what `player` can observe — used as CFR key.
        Uses bucket abstraction for tractability.
        """
        r = self.state.round
        if r is None:
            return f"terminal:{self.state.scores}"

        s = self.state.scores
        esc = r.escalation

        # My hand as sorted buckets (abstracted)
        my_hand_buckets = hand_to_buckets(r.hands[player], r.vira)

        # Trick history: winner sequence (public)
        trick_summary = tuple(t.winner for t in r.tricks)

        # Escalation state (public)
        esc_key = (esc.level, esc.pending, esc.requested_by)

        # First card of current trick (public)
        fc_bucket = None
        if r.first_card is not None:
            fc_bucket = card_bucket(r.first_card, r.vira)

        return (
            f"p{player}|sc{s[0]}-{s[1]}|h{my_hand_buckets}|"
            f"tr{trick_summary}|fc{fc_bucket}|esc{esc_key}|"
            f"fp{r.first_player}|mdz{r.mao_de_onze_team}-{r.mao_de_onze_decided}"
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _start_new_round(self):
        deck = FULL_DECK[:]
        self._rng.shuffle(deck)
        hand0 = deck[0:3]
        hand1 = deck[3:6]
        vira = deck[6]

        scores = self.state.scores
        p0_at = scores[0] == MAO_DE_ONZE_SCORE
        p1_at = scores[1] == MAO_DE_ONZE_SCORE
        mao_de_ferro = p0_at and p1_at

        mao_de_onze_team = None
        mao_de_onze_decided = True
        if not mao_de_ferro:
            if p0_at:
                mao_de_onze_team = 0
                mao_de_onze_decided = False
            elif p1_at:
                mao_de_onze_team = 1
                mao_de_onze_decided = False

        self.state.round = RoundState(
            hands=[hand0, hand1],
            vira=vira,
            first_player=self.state.first_player,
            mao_de_onze_team=mao_de_onze_team,
            mao_de_onze_decided=mao_de_onze_decided,
            mao_de_ferro=mao_de_ferro,
        )
        self.state.round_number += 1

    def _can_escalate(self, esc: EscalationState, player: int) -> bool:
        if esc.pending is not None:
            return False
        if esc.last_escalated_by == player:
            return False
        idx = ESCALATION_ORDER.index(esc.level)
        return idx < len(ESCALATION_ORDER) - 1

    def _can_raise(self, esc: EscalationState, player: int) -> bool:
        if esc.pending is None:
            return False
        if esc.requested_by == player:
            return False
        pidx = ESCALATION_ORDER.index(esc.pending)
        return pidx < len(ESCALATION_ORDER) - 1

    def _next_level(self, level: str) -> Optional[str]:
        idx = ESCALATION_ORDER.index(level)
        if idx >= len(ESCALATION_ORDER) - 1:
            return None
        return ESCALATION_ORDER[idx + 1]

    def _handle_mao_de_onze(self, player: int, action: int):
        r = self.state.round
        if action == ACTION_FOLD:
            opponent = 1 - player
            self.state.scores[opponent] += 1
            return self._finish_round(opponent)
        # Accept: play at TRUCO level (3 pts)
        r.mao_de_onze_decided = True
        r.escalation.level = "TRUCO"
        r.escalation.last_escalated_by = player
        return (False, False, list(self.state.scores))

    def _handle_escalation(self, player: int, action_type: str):
        r = self.state.round
        esc = r.escalation

        if action_type == A_TRUCO:
            next_lvl = self._next_level(esc.level)
            r.escalation = EscalationState(
                level=esc.level,
                pending=next_lvl,
                requested_by=player,
                last_escalated_by=esc.last_escalated_by,
                initiated_by=esc.initiated_by if esc.initiated_by is not None else player,
            )

        elif action_type == A_ACCEPT:
            r.escalation = EscalationState(
                level=esc.pending,
                pending=None,
                requested_by=None,
                last_escalated_by=esc.requested_by,
                initiated_by=esc.initiated_by,
            )

        elif action_type == A_RAISE:
            next_lvl = self._next_level(esc.pending)
            r.escalation = EscalationState(
                level=esc.pending,
                pending=next_lvl,
                requested_by=player,
                last_escalated_by=esc.requested_by,
                initiated_by=esc.initiated_by,
            )

        elif action_type == A_FOLD:
            opponent = 1 - player
            pts = ESCALATION_POINTS[esc.level]
            self.state.scores[opponent] += pts
            return self._finish_round(opponent)

        return (False, False, list(self.state.scores))

    def _handle_play_card(self, player: int, card_idx: int):
        r = self.state.round
        card = r.hands[player][card_idx]
        r.hands[player] = [c for i, c in enumerate(r.hands[player]) if i != card_idx]

        if r.escalation.initiated_by == player:
            r.escalation.initiated_by = None

        if r.first_card is None:
            r.first_card = card
            return (False, False, list(self.state.scores))

        # Complete the trick
        second_card = card
        first_card = r.first_card
        cmp = compare_cards(first_card, second_card, r.vira)
        winner = r.first_player if cmp > 0 else (1 - r.first_player) if cmp < 0 else None

        trick = TrickResult(r.first_player, first_card, second_card, winner)
        r.tricks.append(trick)
        r.first_card = None

        # Check early finish
        early = _can_decide_early(r.tricks)
        if early is not None:
            pts = ESCALATION_POINTS[r.escalation.level]
            self.state.scores[early] += pts
            return self._finish_round(early)

        if len(r.tricks) == 3:
            rw = _resolve_round(r.tricks)
            pts = ESCALATION_POINTS[r.escalation.level]
            if rw is not None:
                self.state.scores[rw] += pts
                return self._finish_round(rw)
            # Full draw: first player of trick 1 wins
            first_p = r.tricks[0].first_player
            self.state.scores[first_p] += pts
            return self._finish_round(first_p)

        # Next trick — winner of last trick goes first
        r.first_player = winner if winner is not None else r.first_player
        return (False, False, list(self.state.scores))

    def _finish_round(self, round_winner: int):
        s = self.state.scores
        game_done = False

        if s[0] >= WIN_SCORE:
            s[0] = WIN_SCORE
            self.state.winner = 0
            game_done = True
        if s[1] >= WIN_SCORE:
            s[1] = WIN_SCORE
            self.state.winner = 1
            game_done = True

        if not game_done:
            self.state.first_player = 1 - self.state.first_player
            self._start_new_round()
        else:
            self.state.round = None

        return (True, game_done, list(s))


# ---------------------------------------------------------------------------
# Round resolution helpers
# ---------------------------------------------------------------------------

def _can_decide_early(tricks: List[TrickResult]) -> Optional[int]:
    if len(tricks) < 2:
        return None
    t1, t2 = tricks[0], tricks[1]
    if t1.winner is not None and t1.winner == t2.winner:
        return t1.winner
    if t1.winner is None and t2.winner is not None:
        return t2.winner
    if t1.winner is not None and t2.winner is None:
        return t1.winner
    return None

def _resolve_round(tricks: List[TrickResult]) -> Optional[int]:
    t1 = tricks[0]
    if len(tricks) < 2:
        return None
    t2 = tricks[1]
    if t1.winner is not None and t1.winner == t2.winner:
        return t1.winner
    if t1.winner is None:
        if t2.winner is not None:
            return t2.winner
        if len(tricks) < 3:
            return None
        t3 = tricks[2]
        return t3.winner if t3.winner is not None else t1.first_player
    if t2.winner is None:
        return t1.winner
    if len(tricks) < 3:
        return None
    t3 = tricks[2]
    if t3.winner is None:
        return t1.winner
    return t3.winner

# ---------------------------------------------------------------------------
# Deep clone helper
# ---------------------------------------------------------------------------

def _deep_clone_state(state: GameState) -> GameState:
    import copy
    return copy.deepcopy(state)
