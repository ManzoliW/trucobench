import os
import sys
import numpy as np
from typing import Tuple, List, Dict, Any, Optional

# Add the parent directory of this script to sys.path so we can import scripts.cfr
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "cfr")))
from cfr.truco_engine import TrucoGame, card_bucket, card_strength, SUITS, RANKS

class TrucoEnv:
    """
    Standard two-player Gymnasium-like environment for Truco Paulista.
    Supports turn-based step execution, legal action masking, and vectorized observations.
    """
    def __init__(self, seed: Optional[int] = None):
        self.game = TrucoGame(seed=seed)
        self.seed = seed

    def reset(self, seed: Optional[int] = None) -> Tuple[np.ndarray, dict]:
        """Reset the environment to a new game."""
        if seed is not None:
            self.seed = seed
        self.game.reset(seed=self.seed)
        
        player = self.game.current_player()
        obs = self.get_observation(player)
        
        info = {
            "current_player": player,
            "legal_actions": self.game.legal_actions(player) if player is not None else [],
            "scores": list(self.game.state.scores),
        }
        return obs, info

    def step(self, action: int) -> Tuple[np.ndarray, float, bool, bool, dict]:
        """
        Apply action for the current active player.
        Returns: (obs, reward, terminated, truncated, info)
        """
        player = self.game.current_player()
        assert player is not None, "Game is already over"
        
        # Apply step in engine
        round_done, game_done, scores = self.game.step(player, action)
        
        terminated = game_done
        truncated = False
        
        # Zero-sum game outcome reward:
        # +1.0 for winning the game, -1.0 for losing.
        reward = 0.0
        if terminated:
            winner = self.game.state.winner
            reward = 1.0 if winner == player else -1.0
            
        next_player = self.game.current_player()
        
        if terminated:
            # Game is over, return terminal observation for the player who just acted
            obs = self.get_observation(player)
        else:
            # Return observation for the next active player
            obs = self.get_observation(next_player)
            
        info = {
            "current_player": next_player,
            "legal_actions": self.game.legal_actions(next_player) if next_player is not None else [],
            "scores": list(self.game.state.scores),
            "winner": self.game.state.winner if game_done else None,
            "round_done": round_done
        }
        
        return obs, reward, terminated, truncated, info

    def get_observation(self, player_id: int) -> np.ndarray:
        """
        Computes a 30-dimensional vectorized representation of the game state
        from the perspective of player_id.
        """
        r = self.game.state.round
        if r is None:
            # Game is over, return terminal zero observation
            return np.zeros(30, dtype=np.float32)
            
        vira = r.vira
        hand = r.hands[player_id]
        opp_hand = r.hands[1 - player_id]
        esc = r.escalation
        scores = self.game.state.scores
        
        obs = []
        
        # 1. My hand buckets count vector (size 6)
        hand_buckets = [card_bucket(c, vira) for c in hand]
        bucket_counts = [hand_buckets.count(b) for b in range(6)]
        obs.extend(bucket_counts)
        
        # 2. Opponent card count (size 1)
        obs.append(float(len(opp_hand)))
        
        # 3. Vira rank index (size 1)
        obs.append(float(vira % 10))
        
        # 4. Scores (size 2): self, opponent (normalized by 12)
        obs.append(float(scores[player_id]) / 12.0)
        obs.append(float(scores[1 - player_id]) / 12.0)
        
        # 5. Trick history winners (size 3)
        # -1.0: not played yet, 0.0: self won, 1.0: opponent won, 2.0: draw
        tricks_history = [-1.0] * 3
        for idx, t in enumerate(r.tricks):
            if idx < 3:
                if t.winner is None:
                    tricks_history[idx] = 2.0
                elif t.winner == player_id:
                    tricks_history[idx] = 0.0
                else:
                    tricks_history[idx] = 1.0
        obs.extend(tricks_history)
        
        # 6. Current trick state (size 2)
        # First card bucket (-1.0 if none)
        first_card_bucket = -1.0
        if r.first_card is not None:
            first_card_bucket = float(card_bucket(r.first_card, vira))
        obs.append(first_card_bucket)
        
        # Who played first in current trick (-1.0 if new trick, 0.0: self, 1.0: opp)
        trick_first_player = -1.0
        if r.first_card is not None or len(r.tricks) > 0:
            fp = r.first_player
            trick_first_player = 0.0 if fp == player_id else 1.0
        obs.append(trick_first_player)
        
        # 7. Escalation level (size 1)
        esc_levels = {"NORMAL": 0.2, "TRUCO": 0.4, "SEIS": 0.6, "NOVE": 0.8, "DOZE": 1.0}
        obs.append(esc_levels.get(esc.level, 0.0))
        
        # 8. Pending request level (size 1)
        obs.append(esc_levels.get(esc.pending, 0.0) if esc.pending is not None else 0.0)
        
        # 9. Who requested pending level (size 1: -1.0 if none, 0.0 if self, 1.0 if opp)
        req_by = -1.0
        if esc.requested_by is not None:
            req_by = 0.0 if esc.requested_by == player_id else 1.0
        obs.append(req_by)
        
        # 10. Who last escalated (size 1: -1.0 if none, 0.0 if self, 1.0 if opp)
        last_esc = -1.0
        if esc.last_escalated_by is not None:
            last_esc = 0.0 if esc.last_escalated_by == player_id else 1.0
        obs.append(last_esc)
        
        # 11. Mão de Onze status (size 4)
        p0_at = scores[0] == 11
        p1_at = scores[1] == 11
        mao_de_ferro = p0_at and p1_at
        
        is_my_mdz = 1.0 if (scores[player_id] == 11 and not mao_de_ferro) else 0.0
        is_opp_mdz = 1.0 if (scores[1 - player_id] == 11 and not mao_de_ferro) else 0.0
        is_mdf = 1.0 if mao_de_ferro else 0.0
        
        mdz_decided = 1.0
        if not r.mao_de_onze_decided:
            mdz_decided = 0.0
            
        obs.extend([is_my_mdz, is_opp_mdz, is_mdf, mdz_decided])
        
        # 12. Legal action mask (size 7)
        # index 0-6: 1.0 if legal, 0.0 if illegal (for action masking in policy gradients)
        legal_actions = self.game.legal_actions(player_id)
        mask = [0.0] * 7
        for a in legal_actions:
            mask[a] = 1.0
        obs.extend(mask)
        
        return np.array(obs, dtype=np.float32)


class SingleAgentTrucoEnv(TrucoEnv):
    """
    Wrapper environment for training a single-agent policy against a fixed baseline opponent.
    Automatically handles the opponent's turns internally.
    """
    def __init__(self, opponent_agent, player_id: int = 0, seed: Optional[int] = None):
        super().__init__(seed=seed)
        self.opponent = opponent_agent
        self.player_id = player_id

    def reset(self, seed: Optional[int] = None) -> Tuple[np.ndarray, dict]:
        """Reset the environment, executing opponent turns if opponent starts."""
        if seed is not None:
            self.seed = seed
        self.game.reset(seed=self.seed)
        
        # Run any initial opponent turns until it is our turn or game is over
        self._play_opponent_turns()
        
        obs = self.get_observation(self.player_id)
        legal = self.game.legal_actions(self.player_id) if self.game.current_player() == self.player_id else []
        
        info = {
            "legal_actions": legal,
            "scores": list(self.game.state.scores),
            "winner": self.game.state.winner
        }
        return obs, info

    def step(self, action: int) -> Tuple[np.ndarray, float, bool, bool, dict]:
        """
        Execute our action, play opponent turns until it's our turn again, and return.
        """
        cp = self.game.current_player()
        assert cp == self.player_id, "It is not the agent's turn to act"
        
        # Apply agent step
        self.game.step(self.player_id, action)
        
        # Play opponent turns until the game is over or it's our turn again
        self._play_opponent_turns()
        
        terminated = self.game.state.winner is not None
        truncated = False
        
        reward = 0.0
        if terminated:
            winner = self.game.state.winner
            reward = 1.0 if winner == self.player_id else -1.0
            
        obs = self.get_observation(self.player_id)
        legal = self.game.legal_actions(self.player_id) if self.game.current_player() == self.player_id else []
        
        info = {
            "legal_actions": legal,
            "scores": list(self.game.state.scores),
            "winner": self.game.state.winner
        }
        
        return obs, reward, terminated, truncated, info

    def _play_opponent_turns(self):
        """Execute steps for the opponent until it is our turn or the game ends."""
        while True:
            cp = self.game.current_player()
            if cp is None or cp == self.player_id:
                break
            # Query opponent agent for action
            # Note: Opponent expects a TrucoGame object and returns an action integer
            action = self.opponent.choose_action(self.game)
            self.game.step(cp, action)
