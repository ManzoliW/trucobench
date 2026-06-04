import os
import sys
import time
from huggingface_hub import HfApi, create_repo

def load_env_token():
    # Read .env.local manually to find HF_TOKEN
    if os.path.exists(".env.local"):
        with open(".env.local", "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("HF_TOKEN="):
                    val = line.split("=", 1)[1].strip()
                    # Remove quotes if present
                    if val.startswith('"') and val.endswith('"'):
                        val = val[1:-1]
                    if val.startswith("'") and val.endswith("'"):
                        val = val[1:-1]
                    return val
    return os.environ.get("HF_TOKEN")

token = load_env_token()
if not token or token == "your_token_here":
    print("Error: HF_TOKEN is not set in .env.local or in the environment variables.")
    print("Please generate a Write Token at https://huggingface.co/settings/tokens and add it to .env.local as:")
    print("HF_TOKEN=your_token_here")
    sys.exit(1)

api = HfApi(token=token)

# 0. Get the username dynamically from Hugging Face whoami
try:
    user_info = api.whoami()
    username = user_info['name']
    print(f"Logged in as Hugging Face user: {username}")
except Exception as e:
    print(f"Error authenticating: {e}")
    sys.exit(1)

repo_id = f"{username}/trucobench-sft"
print(f"Target Hugging Face repo ID: {repo_id}")

# 1. Create the repository if it doesn't exist
try:
    print(f"Creating repository '{repo_id}' on Hugging Face...")
    create_repo(repo_id=repo_id, repo_type="dataset", token=token, exist_ok=True)
    print("Repository created successfully or already exists.")
except Exception as e:
    print(f"Error creating repository: {e}")
    sys.exit(1)

# 2. Upload the compressed dataset file
dataset_path = "dataset/truco_sft_100k_v2.jsonl.gz"
if not os.path.exists(dataset_path):
    print(f"Error: {dataset_path} does not exist. Please run compress-dataset.py first.")
    sys.exit(1)

print(f"Uploading {dataset_path} to {repo_id}...")
start_time = time.time()
try:
    # upload_file supports large files and LFS automatically
    api.upload_file(
        path_or_fileobj=dataset_path,
        path_in_repo="truco_sft_100k_v2.jsonl.gz",
        repo_id=repo_id,
        repo_type="dataset",
    )
    elapsed = time.time() - start_time
    print(f"Dataset file uploaded successfully in {elapsed:.2f} seconds ({elapsed/60:.2f} minutes)!")
except Exception as e:
    print(f"Error uploading dataset file: {e}")
    sys.exit(1)

# 3. Upload the README.md
readme_path = "dataset/README.md"
if os.path.exists(readme_path):
    print(f"Uploading README.md (Dataset Card) to {repo_id}...")
    try:
        api.upload_file(
            path_or_fileobj=readme_path,
            path_in_repo="README.md",
            repo_id=repo_id,
            repo_type="dataset",
        )
        print("README.md uploaded successfully!")
    except Exception as e:
        print(f"Error uploading README.md: {e}")
        # Do not exit, the dataset file is already uploaded
        pass

print("\nAll uploads completed successfully!")
print(f"🔗 View your dataset at: https://huggingface.co/datasets/{repo_id}")
