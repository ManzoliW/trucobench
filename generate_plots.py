import matplotlib.pyplot as plt
import numpy as np
import os
from math import pi

os.makedirs('paper/figures', exist_ok=True)

# 1. Bar Chart for Overall Accuracy (Table 1)
models = ['Gemini 2.5 Flash', 'Qwen 3.7 Max\n(Mean ± Std)', 'GPT-4o-mini', 'Claude Haiku 4.5']
en_std = [73.9, 63.5, 66.6, 63.9]
en_wiki = [70.3, 58.3, 52.6, 64.5]
pt_std = [74.5, 68.0, 62.9, 66.3]

# Error bars only for Qwen (index 1), others 0
yerr_en_std = [0, 3.3, 0, 0]
yerr_en_wiki = [0, 4.2, 0, 0]
yerr_pt_std = [0, 3.1, 0, 0]

x = np.arange(len(models))
width = 0.25

fig, ax = plt.subplots(figsize=(10, 6))

rects1 = ax.bar(x - width, en_std, width, label='EN (Standard)', color='#4c72b0', yerr=yerr_en_std, capsize=5)
rects2 = ax.bar(x, en_wiki, width, label='EN (LLMWiki)', color='#dd8452', yerr=yerr_en_wiki, capsize=5)
rects3 = ax.bar(x + width, pt_std, width, label='PT (Standard)', color='#55a868', yerr=yerr_pt_std, capsize=5)

ax.set_ylabel('Accuracy (%)', fontsize=12)
ax.set_title('Overall Diagnostic Accuracy Across Prompting Conditions', fontsize=14)
ax.set_xticks(x)
ax.set_xticklabels(models, fontsize=11)
ax.legend(loc='lower right')
ax.set_ylim(0, 100)
ax.grid(axis='y', linestyle='--', alpha=0.7)

# Add value labels on top of bars
def autolabel(rects, errors):
    for idx, rect in enumerate(rects):
        height = rect.get_height()
        ax.annotate(f'{height:.1f}',
                    xy=(rect.get_x() + rect.get_width() / 2, height + errors[idx]),
                    xytext=(0, 3),  # 3 points vertical offset
                    textcoords="offset points",
                    ha='center', va='bottom', fontsize=9)

autolabel(rects1, yerr_en_std)
autolabel(rects2, yerr_en_wiki)
autolabel(rects3, yerr_pt_std)

plt.tight_layout()
plt.savefig('paper/figures/overall_accuracy.pdf')
plt.close()


# 2. Radar Chart for Qwen Categories (Table 2)
categories = ['Bluffing', 'Escalation', 'Logic & Ties', 'Defense', 'Mão de Onze', 'Late-Game', 'Math & Seq']
N = len(categories)

# We are going to plot Qwen EN Standard vs EN Wiki vs PT Standard
values_en_std = [75.0, 60.0, 93.3, 70.0, 62.5, 100.0, 51.7]
values_en_wiki = [85.0, 80.0, 93.3, 40.0, 37.5, 33.3, 35.0]
values_pt_std = [61.7, 80.0, 93.3, 80.0, 80.0, 100.0, 51.7]

# Repeat the first value to close the circular graph
values_en_std += values_en_std[:1]
values_en_wiki += values_en_wiki[:1]
values_pt_std += values_pt_std[:1]

angles = [n / float(N) * 2 * pi for n in range(N)]
angles += angles[:1]

fig, ax = plt.subplots(figsize=(8, 8), subplot_kw=dict(polar=True))

# Draw one axe per variable + add labels
plt.xticks(angles[:-1], categories, size=11)

# Draw ylabels
ax.set_rlabel_position(30)
plt.yticks([20, 40, 60, 80, 100], ["20", "40", "60", "80", "100"], color="grey", size=9)
plt.ylim(0, 100)

# Plot data
ax.plot(angles, values_en_std, linewidth=2, linestyle='solid', label='EN (Standard)', color='#4c72b0')
ax.fill(angles, values_en_std, '#4c72b0', alpha=0.1)

ax.plot(angles, values_en_wiki, linewidth=2, linestyle='solid', label='EN (LLMWiki)', color='#dd8452')
ax.fill(angles, values_en_wiki, '#dd8452', alpha=0.1)

ax.plot(angles, values_pt_std, linewidth=2, linestyle='solid', label='PT (Standard)', color='#55a868')
ax.fill(angles, values_pt_std, '#55a868', alpha=0.1)

plt.legend(loc='upper right', bbox_to_anchor=(0.1, 0.1))
plt.title('Qwen 3.7 Max: Per-Category Accuracy', size=14, y=1.1)

plt.tight_layout()
plt.savefig('paper/figures/qwen_radar.pdf')
plt.close()

print("Plots generated successfully in paper/figures/")
