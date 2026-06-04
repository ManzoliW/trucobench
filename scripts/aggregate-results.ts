import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";

async function aggregate() {
    const models = [
        "gpt-4o", 
        "gemini-2.5-pro", 
        "claude-sonnet-4.6", 
        "deepseek-r1",
        "gpt-4o-mini",
        "gemini-2.5-flash",
        "claude-haiku-4.5",
        "moonshotai-kimi-k2.5"
    ];
    const variants = ["wiki", "standard", "det-wiki", "det-standard"];
    
    const results: any = {};

    for (const model of models) {
        results[model] = { wiki: [], standard: [], detWiki: [], detStandard: [] };
        
        // Wiki paths
        const wikiPaths = [
            `results/arxiv-v2/diagnostics/${model}.json`,
            `results/arxiv-v2/diagnostics/pass2/${model}.json`,
            `results/arxiv-v2/diagnostics/pass3/${model}.json`
        ];
        
        // Standard paths
        const standardPaths = [
            `results/arxiv-v2/comparison/standard/${model}.json`,
            `results/arxiv-v2/comparison/standard/pass2/${model}.json`,
            `results/arxiv-v2/comparison/standard/pass3/${model}.json`
        ];

        for (const p of wikiPaths) {
            try {
                const data = JSON.parse(await readFile(p, "utf-8"));
                results[model].wiki.push(data);
            } catch (e) {}
        }
        for (const p of standardPaths) {
            try {
                const data = JSON.parse(await readFile(p, "utf-8"));
                results[model].standard.push(data);
            } catch (e) {}
        }

        // Deterministic
        try {
            results[model].detWiki.push(JSON.parse(await readFile(`results/arxiv-v2/deterministic/wiki/${model}.json`, "utf-8")));
        } catch(e) {}
        try {
            results[model].detStandard.push(JSON.parse(await readFile(`results/arxiv-v2/deterministic/standard/${model}.json`, "utf-8")));
        } catch(e) {}
    }

    function getMean(items: any[], field?: string) {
        if (items.length === 0) return 0;
        if (!field) {
            return items.reduce((sum, item) => sum + item.overallScore, 0) / items.length;
        }
        return items.reduce((sum, item) => sum + (item.categoryScores[field] || 0), 0) / items.length;
    }

    // Generate diagnostic_table.tex (Deterministic Wiki preferred)
    let diagTex = `\\begin{table}[ht]
\\centering
\\caption{Deterministic Diagnostic Accuracy (T=0.0) Across Strategic Categories (\\%)}
\\label{tab:diagnostics}
\\begin{tabular}{@{}lccccc@{}}
\\toprule
Model & Overall & Bluff & Defense & Logic & Escalation \\\\ 
\\midrule
`;

    for (const model of models) {
        const source = results[model].detWiki.length > 0 ? results[model].detWiki : results[model].wiki;
        const name = model.replace("_", "\\_");
        const overall = (getMean(source) * 100).toFixed(1);
        const bluff = (getMean(source, "bluff") * 100).toFixed(1);
        const defense = (getMean(source, "defense") * 100).toFixed(1);
        const logic = (getMean(source, "logic") * 100).toFixed(1);
        const escalation = (getMean(source, "escalation") * 100).toFixed(1);
        diagTex += `${name} & ${overall} & ${bluff} & ${defense} & ${logic} & ${escalation} \\\\ \n`;
    }
    diagTex += `\\bottomrule
\\end{tabular}
\\end{table}`;

    await writeFile("paper/sections/diagnostic_table.tex", diagTex);

    // Generate comparison_table.tex (Deterministic Ablation)
    let compTex = `\\begin{table}[ht]
\\centering
\\caption{Ablation Study (T=0.0): Standard vs. LLMWiki Prompting (Overall Accuracy \\%)}
\\label{tab:ablation}
\\begin{tabular}{lccc}
\\toprule
Model & Standard (v1) & LLMWiki (v2) & Delta \\\\ 
\\midrule
`;

    for (const model of models) {
        const stdSource = results[model].detStandard.length > 0 ? results[model].detStandard : results[model].standard;
        const wikiSource = results[model].detWiki.length > 0 ? results[model].detWiki : results[model].wiki;
        
        const v1Score = getMean(stdSource) * 100;
        const v2Score = getMean(wikiSource) * 100;
        const delta = v2Score - v1Score;
        const deltaStr = delta >= 0 ? `+\\textbf{${delta.toFixed(1)}}` : `\\textcolor{red}{${delta.toFixed(1)}}`;
        const name = model.replace("_", "\\_");
        compTex += `${name} & ${v1Score.toFixed(1)} & ${v2Score.toFixed(1)} & ${deltaStr} \\\\ \n`;
    }
    compTex += `\\bottomrule
\\end{tabular}
\\end{table}`;

    await writeFile("paper/sections/comparison_table.tex", compTex);
    console.log("Aggregated and updated paper/sections/");
}

aggregate().catch(console.error);
