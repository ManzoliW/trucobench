import { execSync } from "node:child_process";

const models = [
    "moonshotai/kimi-k2.5"
];

const commands = [];
for (const model of models) {
    const safeModel = model.replace("/", "-");
    commands.push(`bunx tsx packages/cli/src/index.ts eval --model ${model} --provider vercel --prompt standard --scenarios experiments/diagnostics-v1.json --output results/arxiv-v2/comparison/standard/${safeModel}.json`);
    commands.push(`bunx tsx packages/cli/src/index.ts eval --model ${model} --provider vercel --prompt standard --scenarios experiments/diagnostics-v1.json --output results/arxiv-v2/comparison/standard/pass2/${safeModel}.json`);
    commands.push(`bunx tsx packages/cli/src/index.ts eval --model ${model} --provider vercel --prompt standard --scenarios experiments/diagnostics-v1.json --output results/arxiv-v2/comparison/standard/pass3/${safeModel}.json`);
    commands.push(`bunx tsx packages/cli/src/index.ts eval --model ${model} --provider vercel --prompt wiki --scenarios experiments/diagnostics-v1.json --output results/arxiv-v2/diagnostics/${safeModel}.json`);
    commands.push(`bunx tsx packages/cli/src/index.ts eval --model ${model} --provider vercel --prompt wiki --scenarios experiments/diagnostics-v1.json --output results/arxiv-v2/diagnostics/pass2/${safeModel}.json`);
    commands.push(`bunx tsx packages/cli/src/index.ts eval --model ${model} --provider vercel --prompt wiki --scenarios experiments/diagnostics-v1.json --output results/arxiv-v2/diagnostics/pass3/${safeModel}.json`);
}

for (const cmd of commands) {
    console.log(`Running: ${cmd}`);
    try {
        execSync(cmd, { stdio: "inherit" });
    } catch (e) {
        console.error(`Failed: ${cmd}`);
    }
}
