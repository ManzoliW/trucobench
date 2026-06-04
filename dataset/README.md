---
license: mit
task_categories:
- text-generation
language:
- pt
- en
tags:
- game
- reasoning
- card-game
- truco
- truco-paulista
pretty_name: TrucoPaulista SFT v2
size_categories:
- 1M<n<10M
---

# TrucoPaulista SFT v2 Dataset

This dataset contains **8,204,630 reasoning-augmented instruction turns** generated from 100,000 self-play games of a mathematically optimal heuristic agent (`HeuristicAgent`) playing Truco Paulista. It is designed to fine-tune Large Language Models (LLMs) to master strategic reasoning, bluffing, and decision-making under imperfect information.

## Dataset Details

- **Game**: Truco Paulista (Brazilian card game)
- **Total Turns/Examples**: 8,204,630
- **Source**: Simulated self-play of `HeuristicAgent`
- **Format**: OpenAI JSONL format (chat messages with `system`, `user`, and `assistant` roles)
- **Features**: Real heuristic introspection traces embedded in the assistant's thoughts before actions are taken.

### Action Distribution
The dataset matches the realistic distribution of strategic game actions:
*   **PLAY_CARD**: 73.3%
*   **TRUCO** (asking/raising stakes): 12.2%
*   **FOLD**: 11.7%
*   **ACCEPT** (answering stakes): 2.5%
*   **RAISE** (retruco / vale 9 / vale 12): 0.3%

## Data Format

Each entry is a chat conversation representing the state of the game from the active player's perspective, followed by their internal reasoning and their final action.

### Example Schema
```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are a professional Truco Paulista player. Decide your next move. Play card index, fold, accept/raise/decline stakes, or call Truco."
    },
    {
      "role": "user",
      "content": "Game State:\nYour Hand: [4 of Clubs, Jack of Hearts, Queen of Diamonds]\nVira: 7 of Spades (Manilha is 8)\nStakes: 1 (Normal)\n..."
    },
    {
      "role": "assistant",
      "content": "<thought>\nI have the 4 of Clubs (weakest card), Jack of Hearts, and Queen of Diamonds. The Manilha is 8. \nMy hand strength is calculated as follows:\n- 4 of Clubs: 0.1\n- Jack of Hearts: 0.3\n- Queen of Diamonds: 0.2\nAverage strength is 0.2. Given our position and the opponent's behavior, calling Truco here is risky, but playing the Queen of Diamonds is the optimal card play to test the opponent's hand.\n</thought>\nPLAY_CARD 2"
    }
  ]
}
```

## Intended Use

This dataset is intended to be used for:
1. **Supervised Fine-Tuning (SFT)** of open LLMs (like Llama-3-8B or Qwen-2.5-7B) using LoRA or full parameter tuning.
2. **Reasoning-Aware Fine-Tuning** using the `<thought>` tags to train models to reason before taking actions.
3. **Evaluating imperfect-information game agents** against traditional heuristics or reinforcement learning policies.

## How to Load in Python

You can stream this dataset directly using Hugging Face's `datasets` library:

```python
from datasets import load_dataset

dataset = load_dataset("ManzoliW/trucobench-sft", split="train", streaming=True)
for example in dataset:
    print(example["messages"])
    break
```

## Citation

If you use this dataset in your research, please cite our preprint:

```bibtex
@misc{manzoli2026trucobench,
  title={TrucoBench: Evaluating Strategic Reasoning and Imperfect Information in LLMs},
  author={Manzoli, William and others},
  year={2026},
  publisher={GitHub},
  journal={GitHub repository},
  howpublished={\url{https://github.com/ManzoliW/trucobench}}
}
```
