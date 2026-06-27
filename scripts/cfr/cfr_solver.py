"""
cfr_solver.py — Outcome Sampling Monte Carlo CFR (OS-MCCFR) for Truco Paulista.

Implements OS-MCCFR (Lanctot et al., 2009) which is the standard algorithm
for large imperfect-information games.  No external dependencies beyond the
truco_engine module in the same directory.

Usage
-----
    python cfr_solver.py --iterations 500000 --out truco_cfr_strategy.pkl

Then to benchmark:
    python cfr_solver.py --load truco_cfr_strategy.pkl --eval 10000
"""

from __future__ import annotations

import argparse
import math
import pickle
import random
import time
from collections import defaultdict
from typing import Dict, List, Optional, Tuple

from truco_engine import (
    TrucoGame,
    NUM_ACTIONS,
    WIN_SCORE,
    action_to_tuple,
)

# ---------------------------------------------------------------------------
# Strategy tables
# ---------------------------------------------------------------------------

class RegretTable:
    """Cumulative regret and strategy sum, keyed by info-state string."""

    def __init__(self):
        # regrets[infostate][action] = cumulative regret
        self.regrets: Dict[str, List[float]] = defaultdict(lambda: [0.0] * NUM_ACTIONS)
        # strategy_sum[infostate][action] = weighted strategy sum
        self.strategy_sum: Dict[str, List[float]] = defaultdict(lambda: [0.0] * NUM_ACTIONS)

    def get_strategy(self, infostate: str, legal: List[int]) -> List[float]:
        """Current strategy via regret matching over legal actions."""
        r = self.regrets[infostate]
        pos_regrets = [max(r[a], 0.0) for a in legal]
        total = sum(pos_regrets)
        if total > 0:
            probs = [pr / total for pr in pos_regrets]
        else:
            n = len(legal)
            probs = [1.0 / n] * n
        return probs

    def get_average_strategy(self, infostate: str, legal: List[int]) -> List[float]:
        """Average strategy (converges to Nash equilibrium)."""
        ss = self.strategy_sum[infostate]
        total = sum(ss[a] for a in legal)
        if total > 0:
            return [ss[a] / total for a in legal]
        n = len(legal)
        return [1.0 / n] * n

    def update_regrets(self, infostate: str, legal: List[int], regret_delta: List[float]):
        r = self.regrets[infostate]
        for i, a in enumerate(legal):
            r[a] += regret_delta[i]

    def update_strategy_sum(self, infostate: str, legal: List[int],
                             strategy: List[float], weight: float):
        ss = self.strategy_sum[infostate]
        for i, a in enumerate(legal):
            ss[a] += weight * strategy[i]

    def num_infostates(self) -> int:
        return len(self.regrets)

    def save(self, path: str):
        with open(path, "wb") as f:
            pickle.dump({"regrets": dict(self.regrets),
                         "strategy_sum": dict(self.strategy_sum)}, f)
        print(f"Saved strategy to {path}  ({self.num_infostates()} info-states)")

    @classmethod
    def load(cls, path: str) -> "RegretTable":
        import time
        last_err = None
        for attempt in range(10):
            try:
                with open(path, "rb") as f:
                    data = pickle.load(f)
                t = cls()
                t.regrets.update(data["regrets"])
                t.strategy_sum.update(data["strategy_sum"])
                print(f"Loaded strategy from {path}  ({t.num_infostates()} info-states)")
                return t
            except Exception as e:
                last_err = e
                time.sleep(0.05 + 0.05 * attempt)
        raise last_err


# ---------------------------------------------------------------------------
# OS-MCCFR
# ---------------------------------------------------------------------------

class MCCFRSolver:
    """
    Outcome Sampling MCCFR.

    Each iteration samples ONE terminal outcome per traversal.  This is
    O(depth) per iteration rather than O(tree) — critical for Truco where
    the tree is too large for full CFR.

    Reference: Lanctot et al. (2009), "Monte Carlo Sampling for Regret
    Minimization in Extensive Games".
    """

    def __init__(self, seed: Optional[int] = None):
        self.table = RegretTable()
        self._rng = random.Random(seed)
        self.iteration = 0

    def run(self, n_iterations: int, log_every: int = 10_000):
        """Run MCCFR for n_iterations, alternating the updating player."""
        t0 = time.time()
        for i in range(n_iterations):
            updating_player = i % 2
            game = TrucoGame(seed=self._rng.randint(0, 2**31))
            # reach_p=1, reach_opp=1, sample_prob=1 at root
            self._traverse(game, updating_player, 1.0, 1.0, 1.0)
            self.iteration += 1

            if (i + 1) % log_every == 0:
                elapsed = time.time() - t0
                rate = (i + 1) / elapsed
                print(f"  iter {i+1:>8,}  |  "
                      f"infostates: {self.table.num_infostates():>7,}  |  "
                      f"{rate:,.0f} iter/s  |  {elapsed:.1f}s elapsed")

        print(f"\nCompleted {n_iterations:,} iterations in {time.time()-t0:.1f}s")
        print(f"Total info-states visited: {self.table.num_infostates():,}")


    def _traverse(
        self,
        game: TrucoGame,
        updating_player: int,
        reach_p: float,       # reach prob of updating player
        reach_opp: float,     # reach prob of opponent × chance
        sample_prob: float,   # probability we sampled this trajectory
    ) -> float:
        """
        True Outcome Sampling MCCFR (Lanctot et al., 2009).

        Samples exactly ONE action at every node (for both players and chance).
        Uses importance sampling to correct regret updates for the updating player.

        Returns: sampled utility for `updating_player` (importance-weighted).
        """
        cp = game.current_player()

        # Terminal
        if cp is None:
            s = game.state.scores
            utility = (s[updating_player] - s[1 - updating_player]) / WIN_SCORE
            return utility / sample_prob  # importance weight correction

        infostate = game.info_state_string(cp)
        legal = game.legal_actions(cp)

        if not legal:
            return 0.0

        strategy = self.table.get_strategy(infostate, legal)

        if cp == updating_player:
            # Accumulate strategy sum (reach-weighted)
            self.table.update_strategy_sum(infostate, legal, strategy, reach_p)

            # OS-MCCFR: sample action with epsilon-on-policy mix for exploration
            # epsilon ensures every action has a minimum sampling probability
            eps = 0.6
            n = len(legal)
            sample_probs = [eps / n + (1 - eps) * strategy[j] for j in range(n)]
            j = self._sample(sample_probs)
            a = legal[j]

            # Recurse with sampled action
            g2 = game.clone()
            g2.step(cp, a)
            new_reach_p = reach_p * strategy[j]
            new_sample = sample_prob * sample_probs[j]
            sampled_value = self._traverse(g2, updating_player,
                                           new_reach_p, reach_opp, new_sample)

            # Regret update: only for the sampled action under IS correction
            # W = sampled_value (already IS-weighted from the recursion)
            # For non-sampled actions, counterfactual utility = 0 (OS-MCCFR)
            regret_delta = []
            for k in range(len(legal)):
                if k == j:
                    # counterfactual value of sampled action
                    cf_val = reach_opp * sampled_value
                    # subtract weighted average (reach_opp * E[v] ≈ reach_opp * strategy[j] * sampled_value)
                    regret_delta.append(cf_val - reach_opp * strategy[j] * sampled_value)
                else:
                    # OS-MCCFR: regret for non-sampled actions is -reach_opp * strategy[j] * sampled_value
                    regret_delta.append(-reach_opp * strategy[j] * sampled_value)
            self.table.update_regrets(infostate, legal, regret_delta)

            return sampled_value

        else:
            # Opponent node: sample one action according to their strategy
            j = self._sample(strategy)
            a = legal[j]
            g2 = game.clone()
            g2.step(cp, a)
            new_reach_opp = reach_opp * strategy[j]
            new_sample = sample_prob * strategy[j]
            return self._traverse(g2, updating_player,
                                  reach_p, new_reach_opp, new_sample)


    def _sample(self, probs: List[float]) -> int:
        """Sample index from probability distribution."""
        r = self._rng.random()
        cumulative = 0.0
        for i, p in enumerate(probs):
            cumulative += p
            if r <= cumulative:
                return i
        return len(probs) - 1


# ---------------------------------------------------------------------------
# CFR Agent — reads trained strategy table
# ---------------------------------------------------------------------------

class CFRAgent:
    """
    Agent that plays according to the average strategy from MCCFR.
    Compatible with the TrucoBench bench runner via `choose_action(game)`.
    """

    def __init__(self, table: RegretTable, player_id: int = 0,
                 epsilon: float = 0.05):
        self.table = table
        self.player_id = player_id
        self.epsilon = epsilon  # exploration floor to avoid being purely exploitable

    def choose_action(self, game: TrucoGame) -> int:
        """Return the integer action for the current game state."""
        cp = game.current_player()
        assert cp == self.player_id, f"It's player {cp}'s turn, not {self.player_id}"

        infostate = game.info_state_string(cp)
        legal = game.legal_actions(cp)

        avg_strat = self.table.get_average_strategy(infostate, legal)

        # ε-greedy exploration so the agent isn't deterministic/exploitable
        if random.random() < self.epsilon:
            return random.choice(legal)

        # Sample from average strategy
        r = random.random()
        cumulative = 0.0
        for i, p in enumerate(avg_strat):
            cumulative += p
            if r <= cumulative:
                return legal[i]
        return legal[-1]

    @classmethod
    def load(cls, path: str, player_id: int = 0, epsilon: float = 0.05) -> "CFRAgent":
        table = RegretTable.load(path)
        return cls(table, player_id=player_id, epsilon=epsilon)


# ---------------------------------------------------------------------------
# Evaluation: CFR vs Heuristic / Random
# ---------------------------------------------------------------------------

def run_evaluation(agent_table: RegretTable, n_games: int = 5000,
                   opponent: str = "random") -> dict:
    """
    Evaluate CFR agent against a baseline opponent.
    Returns win-rate, avg score differential, and timing.
    """
    from truco_engine import TrucoGame

    wins = 0
    total_score_diff = 0
    t0 = time.time()

    for g_idx in range(n_games):
        game = TrucoGame(seed=g_idx)
        cfr_player = g_idx % 2   # alternate sides

        while game.state.winner is None:
            cp = game.current_player()
            if cp is None:
                break
            legal = game.legal_actions(cp)
            if not legal:
                break

            if cp == cfr_player:
                # CFR agent
                infostate = game.info_state_string(cp)
                avg_strat = agent_table.get_average_strategy(infostate, legal)
                # Sample from average strategy
                r = random.random()
                cum = 0.0
                action = legal[-1]
                for i, p in enumerate(avg_strat):
                    cum += p
                    if r <= cum:
                        action = legal[i]
                        break
            else:
                # Opponent
                if opponent == "random":
                    action = random.choice(legal)
                elif opponent == "heuristic":
                    action = _heuristic_action(game, cp)
                else:
                    action = random.choice(legal)

            game.step(cp, action)

        s = game.state.scores
        if game.state.winner == cfr_player:
            wins += 1
        total_score_diff += s[cfr_player] - s[1 - cfr_player]

    elapsed = time.time() - t0
    win_rate = wins / n_games
    avg_diff = total_score_diff / n_games

    print(f"\nEvaluation vs {opponent} ({n_games} games, {elapsed:.1f}s):")
    print(f"  CFR Win Rate:       {win_rate:.3f}  ({wins}/{n_games})")
    print(f"  Avg Score Diff:     {avg_diff:+.2f}")

    return {"win_rate": win_rate, "avg_score_diff": avg_diff,
            "n_games": n_games, "opponent": opponent}


def _heuristic_action(game: TrucoGame, player: int) -> int:
    """
    Simple heuristic: play strongest card, accept Truco if have manilha,
    fold if hand is weak and Truco is pending.
    """
    from truco_engine import card_strength, ACTION_TRUCO, ACTION_ACCEPT, ACTION_FOLD, ACTION_RAISE

    legal = game.legal_actions(player)
    r = game.state.round
    vira = r.vira
    hand = r.hands[player]
    esc = r.escalation

    # Escalation response
    if esc.pending is not None and esc.requested_by != player:
        # Accept if any manilha in hand, fold otherwise
        has_manilha = any(card_strength(c, vira) >= 10 for c in hand)
        if ACTION_ACCEPT in legal and has_manilha:
            return ACTION_ACCEPT
        if ACTION_FOLD in legal:
            return ACTION_FOLD
        return ACTION_ACCEPT

    # Card play: play highest card
    card_indices = [a for a in legal if a <= 2]
    if card_indices:
        best_idx = max(card_indices, key=lambda i: card_strength(hand[i], vira))
        return best_idx

    # Initiate truco if have strong hand
    if ACTION_TRUCO in legal:
        avg_strength = sum(card_strength(c, vira) for c in hand) / len(hand)
        if avg_strength >= 8:
            return ACTION_TRUCO

    return legal[0]


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="OS-MCCFR solver for Truco Paulista 2-player."
    )
    parser.add_argument("--iterations", type=int, default=200_000,
                        help="Number of MCCFR iterations (default: 200,000)")
    parser.add_argument("--out", type=str, default="truco_cfr_strategy.pkl",
                        help="Output path for strategy table")
    parser.add_argument("--load", type=str, default=None,
                        help="Load existing strategy and resume or evaluate")
    parser.add_argument("--eval", type=int, default=0,
                        help="Number of evaluation games after training (0 = skip)")
    parser.add_argument("--eval_opponent", type=str, default="heuristic",
                        choices=["random", "heuristic"],
                        help="Opponent type for evaluation")
    parser.add_argument("--seed", type=int, default=42,
                        help="Random seed")
    parser.add_argument("--log_every", type=int, default=10_000,
                        help="Print progress every N iterations")
    args = parser.parse_args()

    if args.load:
        table = RegretTable.load(args.load)
        solver = MCCFRSolver(seed=args.seed)
        solver.table = table
        solver.iteration = 0
    else:
        solver = MCCFRSolver(seed=args.seed)

    if args.iterations > 0:
        print(f"Running {args.iterations:,} MCCFR iterations...")
        solver.run(args.iterations, log_every=args.log_every)
        solver.table.save(args.out)

    if args.eval > 0:
        run_evaluation(solver.table, n_games=args.eval,
                       opponent=args.eval_opponent)


if __name__ == "__main__":
    main()
