# Training Truco Agent via GRPO on Google Colab

This guide explains how to run Group Relative Policy Optimization (GRPO) training for your Truco Paulista agent on a Google Colab instance using a free T4 GPU (16GB VRAM) or a premium L4/A100 GPU.

---

## 1. Quick Setup in Colab

1. Open [Google Colab](https://colab.research.google.com/).
2. Click on **Upload** and upload the [`notebooks/train_grpo_colab.ipynb`](../notebooks/train_grpo_colab.ipynb) file from this repository.
3. In the top-right corner, click **Connect** and make sure you are using a **GPU runtime** (T4 GPU is available on the free tier).
   - *To check/change: Menu → Runtime → Change runtime type → select T4 GPU (or higher).*

---

## 2. Set Up Hugging Face Secret Token

To load the dataset and authenticate with Hugging Face, you need to add your write token to Colab's Secrets:
1. Click the **Key icon (Secrets)** in the left sidebar of Colab.
2. Add a new secret:
   - **Name:** `HF_TOKEN`
   - **Value:** *Your Hugging Face Write Token* (get it from [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)).
3. Enable the **Notebook access** toggle for the `HF_TOKEN` secret.

---

## 3. Training Execution Steps (Notebook Cells)

### Cell 1: Clone Repository & Install Dependencies
This cell clones the repository, navigates into the project directory, and installs the required PyTorch, TRL, PEFT, and bitsandbytes packages.

```python
# Clone the repository to absolute path if not already cloned
import os
if not os.path.exists("/content/trucobench"):
    !git clone https://github.com/ManzoliW/trucobench.git /content/trucobench

# Change directory to the absolute path to prevent duplication errors on re-run
%cd /content/trucobench

# Install GPU-accelerated RL dependencies
!pip install -q trl peft bitsandbytes accelerate datasets transformers
```

### Cell 2: Run GRPO Training
This cell imports your Hugging Face token from the Colab secrets environment and executes the training script with memory-optimized arguments for T4 (16GB VRAM):
- `--load_in_4bit`: Uses QLoRA (NF4) double quantization to shrink model size to ~1.2GB VRAM.
- `--batch_size 1`: Sets micro-batch size to 1 to prevent memory spikes.
- `--gradient_accumulation_steps 8`: Sets accumulation steps to 8, establishing an effective batch size of 8.
- `--group_size 4`: Samples 4 completions per prompt (standard GRPO setting).
- `--dataset_size 10000`: Slices the first 10,000 examples of the dataset to keep execution time reasonable.

```python
import os
from google.colab import userdata

# Inject Hugging Face token from Colab Secrets into environment variables
try:
    os.environ["HF_TOKEN"] = userdata.get('HF_TOKEN')
    print("Hugging Face Token loaded successfully!")
except Exception as e:
    print("Warning: HF_TOKEN secret not found or access not enabled. Ensure you set the secret in Colab.")

# Run the training script
!python scripts/train-grpo.py \
    --model_id "Qwen/Qwen2.5-1.5B-Instruct" \
    --load_in_4bit \
    --batch_size 1 \
    --gradient_accumulation_steps 8 \
    --group_size 4 \
    --dataset_size 10000 \
    --output_dir "./output/truco-grpo"
```

---

## 4. Retrieving Your Trained Weights

Once training completes, the LoRA adapters will be saved to `./output/truco-grpo`. You can download them to your local machine:

```python
from google.colab import files
import shutil

# Compress the adapter folder
shutil.make_archive("truco_grpo_adapter", "zip", "./output/truco-grpo")

# Download the zip file
files.download("truco_grpo_adapter.zip")
```

You can then load these adapter weights into your `LLMAgent` locally by passing the adapter path to the model loader.
