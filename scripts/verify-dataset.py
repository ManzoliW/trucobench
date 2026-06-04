import sys
# Reconfigure stdout to support printing UTF-8 card symbols (♠, ♥, ♦, ♣) on Windows
sys.stdout.reconfigure(encoding='utf-8')

from datasets import load_dataset

repo_id = "manzoliw/trucobench-sft"
print(f"Loading dataset '{repo_id}' from Hugging Face (streaming mode)...")

try:
    # Use streaming=True to avoid downloading the whole 450MB file
    dataset = load_dataset(repo_id, split="train", streaming=True)
    
    # Try to fetch the first example
    iterator = iter(dataset)
    first_example = next(iterator)
    
    print("\nVerification Successful!")
    print("Successfully connected and streamed the first record from the Hub:")
    print("-" * 50)
    print(first_example)
    print("-" * 50)
except Exception as e:
    print(f"\nVerification Failed: {e}")
    sys.exit(1)
