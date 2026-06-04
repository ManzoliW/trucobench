import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";

async function generateComparisonTable() {
    const v2Dir = "results/arxiv-v2/diagnostics";
    const v1Dir = "results/arxiv-v2/comparison/standard";
    
    const models = ["gpt-4o", "gemini-2.5-pro", "claude-sonnet-4.6", "deepseek-r1"];
    
    let tex = `\\begin{table}[ht]
\\centering
\\caption{Ablation Study: Standard vs. LLMWiki Prompting (Overall Accuracy \\%)}
\\label{tab:ablation}
\\begin{tabular}{lccc}
\\toprule
Model & Standard (v1) & LLMWiki (v2) & Delta \\\\ 
\\midrule
`;

    for (const model of models) {
        try {
            const v1Content = JSON.parse(await readFile(path.join(v1Dir, `${model}.json`), "utf-8"));
            const v2Content = JSON.parse(await readFile(path.join(v2Dir, `${model}.json`), "utf-8"));
            
            const v1Score = v1Content.overallScore * 100;
            const v2Score = v2Content.overallScore * 100;
            const delta = v2Score - v1Score;
            const deltaStr = delta >= 0 ? `+\\textbf{${delta.toFixed(1)}}` : `\\textcolor{red}{${delta.toFixed(1)}}`;
            
            const name = model.replace("_", "\\_");
            tex += `${name} & ${v1Score.toFixed(1)} & ${v2Score.toFixed(1)} & ${deltaStr} \\\\ \n`;
        } catch (e) {
            console.error(`Missing data for ${model}`);
        }
    }

    tex += `\\bottomrule
\\end{tabular}
\\end{table}`;

    await writeFile("paper/sections/comparison_table.tex", tex);
    console.log("Generated paper/sections/comparison_table.tex");
}

generateComparisonTable().catch(console.error);
