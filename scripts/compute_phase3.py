import json
import csv
import os
import glob

# Phase 3
# language_delta = accuracy_pt - accuracy_en
# inverse_info_delta_pt = llmwiki_pt - standard_pt
# inverse_info_delta_en = llmwiki_en - standard_en

models = [
    "gemini-2.5-pro", "gpt-4o", "claude-sonnet-4.6", "kimi-k2.5",
    "deepseek-r1", "gemini-2.5-flash", "gpt-4o-mini", "claude-haiku-4.5",
    "qwen-3.7-max", "qwen-3.7-plus"
]

data = {m: {} for m in models}

def safe_read_json(path):
    if not os.path.exists(path): return None
    try:
        with open(path) as f: return json.load(f)
    except: return None

# Load Qwen results
qwen_en_llmwiki = safe_read_json("results/alibaba_free/diagnostic_en_llmwiki.json")
if qwen_en_llmwiki:
    for d in qwen_en_llmwiki: data[d["model"]]["en_llmwiki"] = d["overall_accuracy"]

qwen_en_standard = safe_read_json("results/alibaba_free/diagnostic_en_standard.json")
if qwen_en_standard:
    for d in qwen_en_standard: data[d["model"]]["en_standard"] = d["overall_accuracy"]

qwen_pt_llmwiki = safe_read_json("results/alibaba_free/diagnostic_pt_llmwiki.json")
if qwen_pt_llmwiki:
    for d in qwen_pt_llmwiki: data[d["model"]]["pt_llmwiki"] = d["overall_accuracy"]

qwen_pt_standard = safe_read_json("results/alibaba_free/diagnostic_pt_standard.json")
if qwen_pt_standard:
    for d in qwen_pt_standard: data[d["model"]]["pt_standard"] = d["overall_accuracy"]

# Load 8 models pt_all
pt_all = safe_read_json("results/language_bias/diagnostic_pt_all.json")
if pt_all:
    for d in pt_all:
        m = d["model"]
        fmt = d.get("prompt_format", "standard")
        if fmt == "llmwiki" or fmt == "wiki": data[m]["pt_llmwiki"] = d["overall_accuracy"]
        else: data[m]["pt_standard"] = d["overall_accuracy"]

# Load 8 models en_standard
en_standard_all = safe_read_json("results/language_bias/diagnostic_en_standard_all.json")
if en_standard_all:
    for d in en_standard_all:
        m = d["model"]
        data[m]["en_standard"] = d["overall_accuracy"]

# Load 8 models en_llmwiki (from baseline arxiv-v2)
for m in models:
    if m.startswith("qwen"): continue
    
    # Try multiple naming conventions for files
    possible_names = [f"{m}.json", f"moonshotai-{m}.json", f"vercel-gateway-{m}.json"]
    for name in possible_names:
        p = os.path.join("results/arxiv-v2/diagnostics", name)
        if os.path.exists(p):
            res = safe_read_json(p)
            if res:
                data[m]["en_llmwiki"] = res["overallScore"]
            break

with open("results/language_bias/language_delta_table.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["model", "en_llmwiki", "pt_llmwiki", "language_delta", "inverse_info_delta_en", "inverse_info_delta_pt"])
    for m in models:
        en_llm = data[m].get("en_llmwiki", 0)
        pt_llm = data[m].get("pt_llmwiki", 0)
        en_std = data[m].get("en_standard", 0)
        pt_std = data[m].get("pt_standard", 0)
        
        lang_delta = pt_llm - en_llm
        inv_info_en = en_llm - en_std
        inv_info_pt = pt_llm - pt_std
        
        writer.writerow([m, en_llm, pt_llm, lang_delta, inv_info_en, inv_info_pt])

print("Phase 3 CSV done.")
