import sys
import json
import random
import argparse
from typing import Dict, List, Any, Optional

from truco_engine import SUITS, RANKS, hand_to_buckets, card_bucket
from cfr_solver import RegretTable

def ts_card_to_int(ts_card) -> int:
    if ts_card is None:
        return None
    suit_idx = SUITS.index(ts_card["suit"])
    rank_idx = RANKS.index(ts_card["rank"])
    return suit_idx * 10 + rank_idx

def ts_action_to_int(ts_action) -> int:
    t = ts_action["type"]
    if t == "PLAY_CARD":
        return ts_action["cardIndex"]
    return {"TRUCO": 3, "ACCEPT": 4, "RAISE": 5, "FOLD": 6}[t]

def int_action_to_ts(action_int: int) -> dict:
    if action_int <= 2:
        return {"type": "PLAY_CARD", "cardIndex": action_int}
    return {
        3: {"type": "TRUCO"},
        4: {"type": "ACCEPT"},
        5: {"type": "RAISE"},
        6: {"type": "FOLD"}
    }[action_int]

def get_info_state_string_from_obs(obsDict: dict) -> str:
    player = obsDict["playerId"]
    score = obsDict["score"]
    
    # Hand
    hand_ints = [ts_card_to_int(c) for c in obsDict["hand"]]
    vira_int = ts_card_to_int(obsDict["vira"])
    my_hand_buckets = hand_to_buckets(hand_ints, vira_int)
    
    # Tricks history
    # obs["tricks"] is list of { cards: [Card, Card], firstPlayer: PlayerId, winner: PlayerId | null }
    # Map winner: in TS, winner is 0, 1, or null. In Python, it is 0, 1, or None.
    trick_summary = tuple(t["winner"] for t in obsDict["tricks"])
    
    # Escalation state
    esc = obsDict["escalation"]
    esc_key = (esc["level"], esc["pendingRequest"], esc["requestedBy"])
    
    # First card of current trick
    fc_bucket = None
    if obsDict["currentTrick"]["firstCard"] is not None:
        fc_bucket = card_bucket(ts_card_to_int(obsDict["currentTrick"]["firstCard"]), vira_int)
        
    # Mão de Onze
    p0_at = score[0] == 11
    p1_at = score[1] == 11
    mao_de_ferro = p0_at and p1_at

    if mao_de_ferro:
        mao_de_onze_team = None
        mao_de_onze_decided = True
    elif p0_at:
        mao_de_onze_team = 0
        mao_de_onze_decided = not obsDict["maoDeOnze"]
    elif p1_at:
        mao_de_onze_team = 1
        mao_de_onze_decided = not obsDict["maoDeOnze"]
    else:
        mao_de_onze_team = None
        mao_de_onze_decided = True
        
    first_player = obsDict["currentTrick"]["firstPlayer"]
    
    return (
        f"p{player}|sc{score[0]}-{score[1]}|h{my_hand_buckets}|"
        f"tr{trick_summary}|fc{fc_bucket}|esc{esc_key}|"
        f"fp{first_player}|mdz{mao_de_onze_team}-{mao_de_onze_decided}"
    )

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--strategy", required=True, help="Path to trained strategy pkl file")
    parser.add_argument("--epsilon", type=float, default=0.05, help="Epsilon-greedy exploration floor")
    args = parser.parse_args()

    # Load strategy table
    try:
        original_stdout = sys.stdout
        sys.stdout = sys.stderr
        table = RegretTable.load(args.strategy)
        sys.stdout = original_stdout
        sys.stderr.write(f"CFR Strategy loaded successfully from {args.strategy}\n")
        sys.stderr.flush()
    except Exception as e:
        # Restore stdout just in case
        sys.stdout = sys.__stdout__
        sys.stderr.write(f"Error loading strategy: {e}\n")
        sys.stderr.flush()
        sys.exit(1)

    # Read from stdin line by line
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            obs = json.loads(line)
            legal_ts = obs["legalActions"]
            if not legal_ts:
                sys.stderr.write("No legal actions in observation\n")
                sys.stderr.flush()
                print(json.dumps({"type": "FOLD"}))
                sys.stdout.flush()
                continue

            legal = [ts_action_to_int(act) for act in legal_ts]
            
            # Epsilon-greedy exploration
            if random.random() < args.epsilon:
                chosen_int = random.choice(legal)
            else:
                infostate = get_info_state_string_from_obs(obs)
                avg_strat = table.get_average_strategy(infostate, legal)
                
                # Sample from average strategy
                r = random.random()
                cumulative = 0.0
                chosen_int = legal[-1]
                for i, p in enumerate(avg_strat):
                    cumulative += p
                    if r <= cumulative:
                        chosen_int = legal[i]
                        break
            
            chosen_ts = int_action_to_ts(chosen_int)
            print(json.dumps(chosen_ts))
            sys.stdout.flush()
            
        except Exception as e:
            sys.stderr.write(f"Error processing observation: {e}\n")
            sys.stderr.flush()
            # Safe fallback: play the first legal action
            try:
                fallback = obs["legalActions"][0]
                print(json.dumps(fallback))
            except:
                print(json.dumps({"type": "FOLD"}))
            sys.stdout.flush()

if __name__ == "__main__":
    main()
