# Training Truco Agent via GRPO on Google Colab

This guide explains how to run Group Relative Policy Optimization (GRPO) training for your Truco Paulista agent on a Google Colab instance using a free T4 GPU (16GB VRAM) or a premium L4/A100 GPU.

It includes integration with **Weights & Biases (W&B)** for real-time tracking of policy rewards, KL divergence, losses, and thinking generation lengths.

---

## 1. Quick Setup in Colab

1. Open [Google Colab](https://colab.research.google.com/).
2. Click on **Upload** and upload the [`notebooks/train_grpo_colab.ipynb`](../notebooks/train_grpo_colab.ipynb) file from this repository.
3. In the top-right corner, click **Connect** and make sure you are using a **GPU runtime** (T4 GPU is available on the free tier).
   - *To check/change: Menu → Runtime → Change runtime type → select T4 GPU (or higher).*

---

## 2. Configure Colab Secrets

You should add two API keys to Colab's Secrets sidebar (Key icon) and toggle **Notebook access** to ON for both:

1. **`HF_TOKEN`**:
   - **Purpose:** Download public/private models and datasets, and upload model checkpoints.
   - **Value:** *Your Hugging Face Write Token* (get it from [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)).
2. **`WANDB_API_KEY`** (Optional but highly recommended):
   - **Purpose:** Watch live interactive training graphs (rewards, loss, KL divergence) in your browser.
   - **Value:** *Your Weights & Biases API Key* (get it for free from [wandb.ai/authorize](https://wandb.ai/authorize)).

---

## 3. Training Execution Steps (Notebook Cells)

### Cell 1: Clone Repository & Install Dependencies
This cell clones the repository, navigates into the project directory, and installs the required PyTorch, TRL, PEFT, bitsandbytes, and W&B packages.

```python
# Clone the repository to absolute path if not already cloned
import os
if not os.path.exists("/content/trucobench"):
    !git clone https://github.com/ManzoliW/trucobench.git /content/trucobench

# Change directory to the absolute path to prevent duplication errors on re-run
%cd /content/trucobench

# Install GPU-accelerated RL dependencies (including wandb)
!pip install -U -q trl peft bitsandbytes accelerate datasets transformers wandb
```

### Cell 2: Run GRPO Training
This cell reads your keys from Colab Secrets, sets the reporting framework to W&B (falling back to TensorBoard if the W&B key is missing), and runs the training script:

```python
import os
from google.colab import userdata

# Inject Hugging Face token from Colab Secrets into environment variables
try:
    os.environ["HF_TOKEN"] = userdata.get('HF_TOKEN')
    print("✅ Hugging Face Token loaded successfully!")
except Exception as e:
    print("❌ Error loading Hugging Face token. Ensure HF_TOKEN secret is configured and access is enabled in the Secrets tab.")

# Inject W&B API Key for live charts
try:
    os.environ["WANDB_API_KEY"] = userdata.get('WANDB_API_KEY')
    os.environ["WANDB_PROJECT"] = "truco-grpo"
    print("✅ Weights & Biases API Key loaded successfully!")
except Exception as e:
    print("⚠️ Warning: WANDB_API_KEY secret not found. Training will log to local TensorBoard instead of W&B.")

# Determine reporting framework
report_framework = "wandb" if os.environ.get("WANDB_API_KEY") else "tensorboard"

# Run the training script
!python scripts/train-grpo.py \
    --model_id "Qwen/Qwen2.5-1.5B-Instruct" \
    --load_in_4bit \
    --batch_size 1 \
    --gradient_accumulation_steps 8 \
    --group_size 4 \
    --dataset_size 10000 \
    --report_to {report_framework} \
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
