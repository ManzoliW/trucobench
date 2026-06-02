import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";

async function generateDiagnosticTable() {
    const diagDir = "results/arxiv-v2/diagnostics";
    const files = await readdir(diagDir);
    const results: any[] = [];

    for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const content = JSON.parse(await readFile(path.join(diagDir, file), "utf-8"));
        results.push(content);
    }

    let tex = `\\begin{table}[ht]
\\centering
\\caption{Diagnostic Accuracy Across Truco Strategic Categories (\\%)}
\\label{tab:diagnostics}
\\begin{tabular}{@{}lccccc@{}}
\\toprule
Model & Overall & Bluff & Defense & Logic & Escalation \\\\ 
\\midrule
`;

    for (const res of results) {
        const name = res.modelName.replace("vercel-gateway/", "").replace("_", "\\_");
        const overall = (res.overallScore * 100).toFixed(1);
        const bluff = (res.categoryScores.bluff * 100).toFixed(1);
        const defense = (res.categoryScores.defense * 100).toFixed(1);
        const logic = (res.categoryScores.logic * 100).toFixed(1);
        const escalation = (res.categoryScores.escalation * 100).toFixed(1);

        tex += `${name} & ${overall} & ${bluff} & ${defense} & ${logic} & ${escalation} \\\\ \n`;
    }

    tex += `\\bottomrule
\\end{tabular}
\\end{table}`;

    await writeFile("paper/sections/diagnostic_table.tex", tex);
    console.log("Generated paper/sections/diagnostic_table.tex");
}

generateDiagnosticTable().catch(console.error);
