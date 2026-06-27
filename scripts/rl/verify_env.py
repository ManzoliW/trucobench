import os
import sys
import numpy as np

# Add workspace root to python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..", "scripts", "cfr")))
from scripts.rl.truco_env import TrucoEnv, SingleAgentTrucoEnv
from scripts.cfr.cfr_solver import CFRAgent

def test_env():
    print("Initializing environment...")
    env = TrucoEnv(seed=42)
    obs, info = env.reset()
    print("Initial observation shape:", obs.shape)
    print("Initial info:", info)
    
    # Step until done
    done = False
    step_count = 0
    while not done:
        player = info["current_player"]
        legal = info["legal_actions"]
        if not legal:
            print("No legal actions remaining!")
            break
        # Choose a random legal action
        action = legal[0]
        obs, reward, term, trunc, info = env.step(action)
        done = term or trunc
        step_count += 1
        
    print(f"Game finished in {step_count} steps.")
    print("Final scores:", info["scores"])
    print("Winner:", info["winner"])
    print("All checks passed for TrucoEnv!\n")

def test_single_agent():
    print("Initializing SingleAgentTrucoEnv with CFR opponent...")
    # Load CFR smoke table as opponent (representing player 1)
    # Redirect stdout to avoid print contamination
    original_stdout = sys.stdout
    sys.stdout = sys.stderr
    cfr_opp = CFRAgent.load("scripts/cfr/truco_cfr_smoke.pkl", player_id=1)
    sys.stdout = original_stdout
    
    env = SingleAgentTrucoEnv(opponent_agent=cfr_opp, player_id=0, seed=123)
    obs, info = env.reset()
    print("Initial single agent observation shape:", obs.shape)
    print("Initial single agent info:", info)
    
    # Step until done
    done = False
    step_count = 0
    while not done:
        legal = info["legal_actions"]
        if not legal:
            print("No legal actions for agent (game ended/opponent turn failed)?")
            break
        # Choose a random legal action
        action = legal[0]
        obs, reward, term, trunc, info = env.step(action)
        done = term or trunc
        step_count += 1
        
    print(f"Single agent game finished in {step_count} steps.")
    print("Final scores:", info["scores"])
    print("Winner:", info["winner"])
    print("All checks passed for SingleAgentTrucoEnv!\n")

if __name__ == "__main__":
    test_env()
    test_single_agent()
