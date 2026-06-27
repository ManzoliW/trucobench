import os
import sys
import time
import random
import numpy as np
import argparse
from typing import List, Tuple, Optional

# Add paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from scripts.rl.truco_env import SingleAgentTrucoEnv
from scripts.cfr.cfr_solver import CFRAgent
from scripts.cfr.truco_engine import TrucoGame

# Check for PyTorch
try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
    from torch.distributions import Categorical
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False

class HeuristicOpponent:
    """Wrapper around Python engine heuristic action generator."""
    def choose_action(self, game: TrucoGame) -> int:
        from scripts.cfr.cfr_solver import _heuristic_action
        cp = game.current_player()
        assert cp is not None
        return _heuristic_action(game, cp)

if HAS_TORCH:
    class ActorCritic(nn.Module):
        """Actor-Critic network supporting legal action masking."""
        def __init__(self, state_dim: int = 30, action_dim: int = 7):
            super().__init__()
            # Actor network (policy)
            self.actor = nn.Sequential(
                nn.Linear(state_dim - 7, 128),
                nn.Tanh(),
                nn.Linear(128, 128),
                nn.Tanh(),
                nn.Linear(128, action_dim)
            )
            # Critic network (state value)
            self.critic = nn.Sequential(
                nn.Linear(state_dim - 7, 128),
                nn.Tanh(),
                nn.Linear(128, 128),
                nn.Tanh(),
                nn.Linear(128, 1)
            )

        def forward(self, state: torch.Tensor, action_mask: torch.Tensor) -> Tuple[Categorical, torch.Tensor]:
            # Use only non-mask features for state representation
            state_features = state[..., :-7]
            
            # Policy logits
            logits = self.actor(state_features)
            
            # Apply action mask (set illegal actions to -1e9)
            masked_logits = logits + (1.0 - action_mask) * -1e9
            
            dist = Categorical(logits=masked_logits)
            value = self.critic(state_features)
            
            return dist, value

    class PPOMemory:
        """Buffer to store collected trajectories."""
        def __init__(self):
            self.states = []
            self.actions = []
            self.masks = []
            self.logprobs = []
            self.rewards = []
            self.is_terminals = []

        def clear(self):
            del self.states[:]
            del self.actions[:]
            del self.masks[:]
            del self.logprobs[:]
            del self.rewards[:]
            del self.is_terminals[:]


def train(args):
    if not HAS_TORCH:
        print("PyTorch is not installed. Please install it to train the PPO model:")
        print("  pip install torch numpy")
        sys.exit(1)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training on device: {device}")

    # Set seeds
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)

    # Load Opponent
    if args.opponent == "cfr":
        strategy_path = args.strategy_path
        if not os.path.exists(strategy_path):
            strategy_path = "scripts/cfr/truco_cfr_smoke.pkl"
        print(f"Loading CFR opponent from: {strategy_path}")
        
        # Suppress printing during load
        orig_stdout = sys.stdout
        sys.stdout = sys.stderr
        opponent = CFRAgent.load(strategy_path, player_id=1)
        sys.stdout = orig_stdout
    else:
        print("Using Heuristic opponent")
        opponent = HeuristicOpponent()

    # Initialize environment
    env = SingleAgentTrucoEnv(opponent_agent=opponent, player_id=0, seed=args.seed)
    
    state_dim = 30
    action_dim = 7

    # Hyperparameters
    lr = args.lr
    gamma = args.gamma
    K_epochs = args.epochs
    eps_clip = args.eps_clip
    
    # Initialize networks
    policy = ActorCritic(state_dim, action_dim).to(device)
    optimizer = optim.Adam(policy.parameters(), lr=lr)
    policy_old = ActorCritic(state_dim, action_dim).to(device)
    policy_old.load_state_dict(policy.state_dict())
    
    memory = PPOMemory()

    print("\nStarting PPO training...")
    print(f"  lr={lr}, gamma={gamma}, epochs={K_epochs}, clip={eps_clip}")
    print(f"  Max episodes: {args.max_episodes:,}")
    print("--------------------------------------------------")

    timestep = 0
    running_reward = 0.0
    running_winrate = 0.0
    print_running_reward = 0.0
    print_running_wins = 0

    t0 = time.time()

    for i_episode in range(1, args.max_episodes + 1):
        state, info = env.reset(seed=args.seed + i_episode)
        done = False
        episode_reward = 0

        while not done:
            timestep += 1
            
            # Convert to torch tensors
            state_t = torch.FloatTensor(state).to(device)
            mask_t = torch.FloatTensor(state[-7:]).to(device) # mask is last 7 elements
            
            with torch.no_grad():
                dist, _ = policy_old(state_t, mask_t)
                action_t = dist.sample()
                logprob_t = dist.log_prob(action_t)

            action = action_t.item()
            
            # Step in environment
            next_state, reward, term, trunc, info = env.step(action)
            done = term or trunc
            
            # Store in memory
            memory.states.append(state)
            memory.actions.append(action)
            memory.masks.append(state[-7:])
            memory.logprobs.append(logprob_t.item())
            memory.rewards.append(reward)
            memory.is_terminals.append(done)
            
            state = next_state
            episode_reward += reward

        # Record outcome
        win = 1 if info["winner"] == 0 else 0
        print_running_wins += win
        print_running_reward += episode_reward

        # Update policy when buffer size is reached
        if timestep >= args.update_timestep:
            # Monte Carlo estimation of returns
            rewards = []
            discounted_reward = 0
            for r, is_terminal in zip(reversed(memory.rewards), reversed(memory.is_terminals)):
                if is_terminal:
                    discounted_reward = 0
                discounted_reward = r + (gamma * discounted_reward)
                rewards.insert(0, discounted_reward)

            # Normalize returns
            rewards = torch.FloatTensor(rewards).to(device)
            rewards = (rewards - rewards.mean()) / (rewards.std() + 1e-7)

            # Convert lists to tensors
            old_states = torch.FloatTensor(np.array(memory.states)).to(device)
            old_actions = torch.LongTensor(np.array(memory.actions)).to(device)
            old_masks = torch.FloatTensor(np.array(memory.masks)).to(device)
            old_logprobs = torch.FloatTensor(np.array(memory.logprobs)).to(device)

            # Optimize policy for K epochs
            for _ in range(K_epochs):
                # Evaluating old actions and values
                dist, state_values = policy(old_states, old_masks)
                logprobs = dist.log_prob(old_actions)
                dist_entropy = dist.entropy()
                
                # Finding the ratio (pi_theta / pi_theta__old)
                ratios = torch.exp(logprobs - old_logprobs)

                # Finding Surrogate Loss
                advantages = rewards - state_values.squeeze().detach()
                surr1 = ratios * advantages
                surr2 = torch.clamp(ratios, 1.0 - eps_clip, 1.0 + eps_clip) * advantages

                # Final Loss containing Value Loss and Entropy Regularization
                loss = -torch.min(surr1, surr2) + 0.5 * nn.MSELoss()(state_values.squeeze(), rewards) - 0.01 * dist_entropy
                
                # Take gradient step
                optimizer.zero_grad()
                loss.mean().backward()
                optimizer.step()

            # Copy weights to old policy
            policy_old.load_state_dict(policy.state_dict())
            memory.clear()
            timestep = 0

        # Log progress
        if i_episode % args.log_interval == 0:
            avg_winrate = print_running_wins / args.log_interval
            avg_reward = print_running_reward / args.log_interval
            elapsed = time.time() - t0
            eps_rate = i_episode / elapsed
            print(f"Episode {i_episode:>6,}  |  Win Rate: {avg_winrate:.2%}  |  Avg Reward: {avg_reward:>+5.2f}  |  {eps_rate:.1f} eps/s")
            
            print_running_wins = 0
            print_running_reward = 0.0

    print(f"\nTraining completed in {time.time()-t0:.1f}s.")
    
    # Save model weights
    if args.save_path:
        torch.save(policy.state_dict(), args.save_path)
        print(f"Model saved to: {args.save_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PPO Online RL Trainer for Truco Paulista.")
    parser.add_argument("--opponent", type=str, default="heuristic", choices=["heuristic", "cfr"],
                        help="Opponent type (default: heuristic)")
    parser.add_argument("--strategy_path", type=str, default="scripts/cfr/truco_cfr_strategy.pkl",
                        help="Path to CFR strategy pkl file (only if opponent is cfr)")
    parser.add_argument("--max_episodes", type=int, default=10000,
                        help="Total number of episodes to train (default: 10,000)")
    parser.add_argument("--log_interval", type=int, default=1000,
                        help="Log progress every N episodes (default: 1,000)")
    parser.add_argument("--update_timestep", type=int, default=2000,
                        help="Buffer size before network updates (default: 2,000 timesteps)")
    parser.add_argument("--lr", type=float, default=0.0003,
                        help="Learning rate (default: 0.0003)")
    parser.add_argument("--gamma", type=float, default=0.99,
                        help="Discount factor (default: 0.99)")
    parser.add_argument("--epochs", type=int, default=10,
                        help="Number of optimization epochs per update (default: 10)")
    parser.add_argument("--eps_clip", type=float, default=0.2,
                        help="PPO clipping parameter epsilon (default: 0.2)")
    parser.add_argument("--seed", type=int, default=42,
                        help="Random seed")
    parser.add_argument("--save_path", type=str, default="scripts/rl/truco_ppo_weights.pth",
                        help="Path to save trained PyTorch model weights")
    args = parser.parse_args()
    
    train(args)
