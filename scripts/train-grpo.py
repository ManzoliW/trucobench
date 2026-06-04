import os
import sys
import re
import json
import argparse

# Ensure required RL libraries are installed
try:
    from peft import LoraConfig
    from trl import GRPOTrainer, GRPOConfig
    from datasets import load_dataset
    import torch
    from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
except ImportError as e:
    print(f"\nError: Missing required library. Details: {e}")
    print("Please install the required packages for GRPO RL training:")
    print("  pip install trl peft bitsandbytes accelerate datasets transformers")
    sys.exit(1)

# Helper function to parse legal actions from user prompt
def extract_legal_actions_from_prompt(prompt_text):
    legal_actions = []
    lines = prompt_text.split('\n')
    in_legal = False
    for line in lines:
        if "## LEGAL ACTIONS" in line or "LEGAL ACTIONS" in line:
            in_legal = True
            continue
        if in_legal:
            # Stop parsing when we hit another header or empty line after finding actions
            if (line.strip().startswith('#') or line.strip() == "") and len(legal_actions) > 0:
                in_legal = False
                continue
            # Matches "1. PLAY_CARD 0 (Q of Ouros (Diamonds))" or "2. FOLD"
            match = re.search(r'\d+\.\s+([A-Z_]+)(?:\s+(\d+))?', line)
            if match:
                action_name = match.group(1)
                card_idx = match.group(2)
                if card_idx is not None:
                    legal_actions.append((action_name, int(card_idx)))
                else:
                    legal_actions.append((action_name, None))
    return legal_actions

# Helper to normalize prompt formatting
def get_prompt_text(prompt):
    if isinstance(prompt, list):
        for msg in prompt:
            if msg.get("role") == "user":
                return msg.get("content", "")
        return ""
    return str(prompt)

def get_completion_text(completion):
    """
    Normalize a completion to plain text regardless of TRL version.
    - Older TRL: completions are plain strings.
    - Newer TRL (conversational format): completions are lists of message dicts.
    """
    if isinstance(completion, list):
        # Conversational format — find the assistant turn
        for msg in completion:
            if isinstance(msg, dict) and msg.get("role") == "assistant":
                return msg.get("content", "")
        # Fallback: last message content
        if completion and isinstance(completion[-1], dict):
            return completion[-1].get("content", "")
        return ""
    if isinstance(completion, dict):
        return completion.get("content", "")
    return str(completion)

# Clean assistant output from markdown blocks if any
def clean_completion(completion):
    cleaned = get_completion_text(completion).strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return cleaned.strip()

# ----------------- REWARD FUNCTIONS -----------------

_reward_debug_done = False

def json_format_reward(prompts, completions, **kwargs):
    """Rewards outputs that parse as JSON and contain 'reasoning' and 'action' keys."""
    global _reward_debug_done
    if not _reward_debug_done:
        # One-time diagnostic: show raw completion format so we can confirm text extraction works
        raw = completions[0] if completions else None
        extracted = get_completion_text(raw) if raw is not None else ""
        print(f"\n[DEBUG] completion type: {type(raw).__name__}")
        print(f"[DEBUG] raw completion[:200]: {str(raw)[:200]}")
        print(f"[DEBUG] extracted text[:200]: {extracted[:200]}")
        _reward_debug_done = True

    rewards = []
    for completion in completions:
        try:
            cleaned = clean_completion(completion)
            data = json.loads(cleaned)
            if "reasoning" in data and "action" in data:
                rewards.append(1.0)
            else:
                rewards.append(0.2)  # JSON format matches, but incorrect keys
        except Exception:
            rewards.append(0.0)
    return rewards

def legal_action_reward(prompts, completions, **kwargs):
    """Rewards choosing an action that is legal in the current game state."""
    rewards = []
    for prompt, completion in zip(prompts, completions):
        prompt_text = get_prompt_text(prompt)
        legal_actions = extract_legal_actions_from_prompt(prompt_text)
        
        # If prompt has no parsed actions, default to success to prevent false penalties
        if not legal_actions:
            rewards.append(1.0)
            continue
            
        try:
            cleaned = clean_completion(completion)
            data = json.loads(cleaned)
            action = data.get("action")
            card_idx = data.get("card_index")
            
            if action != "PLAY_CARD":
                card_idx = None
            else:
                card_idx = int(card_idx) if card_idx is not None else None
                
            matched = False
            for la, idx in legal_actions:
                if la == action:
                    if la == "PLAY_CARD":
                        if idx == card_idx:
                            matched = True
                            break
                    else:
                        matched = True
                        break
            
            rewards.append(1.0 if matched else 0.0)
        except Exception:
            rewards.append(0.0)
    return rewards

def heuristic_alignment_reward(prompts, completions, target_action, target_card_index, **kwargs):
    """Rewards matching the mathematically optimal HeuristicAgent's move."""
    rewards = []
    for completion, t_act, t_idx in zip(completions, target_action, target_card_index):
        try:
            cleaned = clean_completion(completion)
            data = json.loads(cleaned)
            action = data.get("action")
            card_idx = data.get("card_index")
            
            if action == t_act:
                if action == "PLAY_CARD":
                    if int(card_idx) == int(t_idx):
                        rewards.append(1.0) # Exact match
                    else:
                        rewards.append(0.5) # Correct general action (playing a card), wrong card index
                else:
                    rewards.append(1.0) # Correct non-card action (Truco, Fold, Accept)
            else:
                rewards.append(0.0)
        except Exception:
            rewards.append(0.0)
    return rewards

# Helper to load .env.local variables
def load_dotenv():
    if os.path.exists(".env.local"):
        with open(".env.local", "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().replace('"', '').replace("'", "")
                    if key and val:
                        os.environ[key] = val

# ----------------- MAIN TRAINING FLOW -----------------

def main():
    load_dotenv()
    parser = argparse.ArgumentParser(description="Train a Truco Paulista agent using GRPO RL.")
    parser.add_argument("--model_id", type=str, default="Qwen/Qwen2.5-1.5B-Instruct", help="Hugging Face base model ID.")
    parser.add_argument("--dataset_size", type=int, default=20000, help="Number of training samples to load.")
    parser.add_argument("--epochs", type=int, default=1, help="Number of training epochs.")
    parser.add_argument("--batch_size", type=int, default=4, help="Micro-batch size per device.")
    parser.add_argument("--gradient_accumulation_steps", type=int, default=4, help="Gradient accumulation steps.")
    parser.add_argument("--group_size", type=int, default=4, help="GRPO group size (number of completions per prompt).")
    parser.add_argument("--lr", type=float, default=1e-6, help="Learning rate.")
    parser.add_argument("--lora_r", type=int, default=16, help="LoRA rank.")
    parser.add_argument("--lora_alpha", type=int, default=32, help="LoRA alpha.")
    parser.add_argument("--load_in_4bit", action="store_true", help="Load the model in 4-bit precision (QLoRA).")
    parser.add_argument("--load_in_8bit", action="store_true", help="Load the model in 8-bit precision.")
    parser.add_argument("--output_dir", type=str, default="./output/truco-grpo", help="Output directory for checkpoints.")
    parser.add_argument("--report_to", type=str, default="tensorboard", choices=["tensorboard", "wandb", "none"], help="Framework to report metrics to.")
    parser.add_argument("--smoke-test", action="store_true", help="Run a quick 1-step verification on CPU/GPU.")
    
    args = parser.parse_args()

    if args.smoke_test:
        print("🔧 Running in SMOKE-TEST mode (1 step, batch size 1, group size 2)...")
        args.dataset_size = 4
        args.batch_size = 1
        args.group_size = 2
        args.gradient_accumulation_steps = 1
        args.output_dir = "./output/smoke-test-grpo"
        
    print(f"Loading dataset 'manzoliw/trucobench-sft' (first {args.dataset_size} rows)...")
    raw_dataset = load_dataset("manzoliw/trucobench-sft", split=f"train[:{args.dataset_size}]")

    print("Preprocessing dataset columns for GRPO...")
    def preprocess(example):
        messages = example["messages"]
        prompt = messages[:-1] # system and user messages
        assistant_content = messages[-1]["content"]
        
        target_action = ""
        target_card_index = -1
        try:
            data = json.loads(assistant_content.strip())
            target_action = data.get("action", "")
            target_card_index = data.get("card_index", -1)
        except Exception:
            pass
            
        return {
            "prompt": prompt,
            "target_action": target_action,
            "target_card_index": target_card_index
        }

    dataset = raw_dataset.map(preprocess, remove_columns=raw_dataset.column_names)

    # Configure quantization if specified
    bnb_config = None
    if args.load_in_4bit:
        print("Quantizing base model to 4-bit (NF4)...")
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
            bnb_4bit_use_double_quant=True
        )
    elif args.load_in_8bit:
        print("Quantizing base model to 8-bit...")
        bnb_config = BitsAndBytesConfig(load_in_8bit=True)

    print(f"Loading model and tokenizer for '{args.model_id}'...")
    tokenizer = AutoTokenizer.from_pretrained(args.model_id)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "left"   # Required for decoder-only models during generation
    tokenizer.truncation_side = "left" # Truncate from the left so the prompt end is always visible

    # Handle device map for CPU smoke tests vs normal GPU setups
    device_map = None
    if not args.smoke_test:
        device_map = "auto"
    elif not torch.cuda.is_available():
        device_map = {"": "cpu"}
    else:
        device_map = "cuda:0"

    model = AutoModelForCausalLM.from_pretrained(
        args.model_id,
        quantization_config=bnb_config,
        device_map=device_map,
        torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
    )

    # Configure PEFT/LoRA adapters
    print("Setting up PEFT/LoRA configuration...")
    peft_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        target_modules=["q_proj", "v_proj", "k_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM"
    )

    # Configure GRPO Trainer parameters
    print("Setting up GRPO training arguments...")
    training_args = GRPOConfig(
        output_dir=args.output_dir,
        learning_rate=args.lr,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        num_generations=args.group_size,
        # max_prompt_length removed — deprecated in newer trl versions.
        # Pre-truncate prompts at dataset level or rely on tokenizer truncation_side="left".
        max_completion_length=256,   # Increased: 192 could be too tight for JSON + reasoning
        temperature=0.7,             # Non-zero temperature prevents empty greedy outputs
        num_train_epochs=args.epochs,
        max_steps=1 if args.smoke_test else -1,
        logging_steps=1,
        save_strategy="no" if args.smoke_test else "epoch",
        bf16=torch.cuda.is_bf16_supported() if torch.cuda.is_available() else False,
        fp16=not torch.cuda.is_bf16_supported() if torch.cuda.is_available() else False,
        report_to="none" if args.smoke_test else args.report_to,
    )

    print("Initializing GRPOTrainer...")
    trainer = GRPOTrainer(
        model=model,
        processing_class=tokenizer,
        reward_funcs=[
            json_format_reward,
            legal_action_reward,
            heuristic_alignment_reward
        ],
        args=training_args,
        train_dataset=dataset,
        peft_config=peft_config,
    )

    print("\n🚀 Starting GRPO training...")
    trainer.train()
    
    if not args.smoke_test:
        print(f"\nTraining completed! Saving LoRA weights to {args.output_dir}...")
        trainer.save_model(args.output_dir)
        print("LoRA weights saved successfully!")
    else:
        print("\n✅ Smoke test completed successfully! GRPO code is verified and ready.")

if __name__ == "__main__":
    main()
