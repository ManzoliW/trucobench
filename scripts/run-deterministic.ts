import { execSync } from "node:child_process";

const models = [
    "gpt-4o",
    "google/gemini-2.5-pro",
    "claude-sonnet-4.6",
    "deepseek-r1",
    "gpt-4o-mini",
    "google/gemini-2.5-flash",
    "claude-haiku-4.5",
    "moonshotai/kimi-k2.5"
];

for (const model of models) {
    const safeModel = model.replace("/", "-").replace("google-", "");
    
    // Standard Mode
    console.log(`[DET] Running Standard: ${model}`);
    try {
        execSync(`bunx tsx packages/cli/src/index.ts eval --model ${model} --provider vercel --prompt standard --scenarios experiments/diagnostics-v1.json --temperature 0 --output results/arxiv-v2/deterministic/standard/${safeModel}.json`, { stdio: "inherit" });
    } catch (e) {
        console.error(`Failed Standard ${model}`);
    }

    // Wiki Mode
    console.log(`[DET] Running Wiki: ${model}`);
    try {
        execSync(`bunx tsx packages/cli/src/index.ts eval --model ${model} --provider vercel --prompt wiki --scenarios experiments/diagnostics-v1.json --temperature 0 --output results/arxiv-v2/deterministic/wiki/${safeModel}.json`, { stdio: "inherit" });
    } catch (e) {
        console.error(`Failed Wiki ${model}`);
    }
}
