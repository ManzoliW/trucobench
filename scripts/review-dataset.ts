import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const targetLines = new Set([0, 1000, 100000, 1000000]);
let lineNum = 0;

const rl = createInterface({ input: createReadStream("dataset/truco_sft_100k.jsonl") });

for await (const line of rl) {
	if (targetLines.has(lineNum)) {
		const obj = JSON.parse(line);
		console.log(`\n${"=".repeat(60)}`);
		console.log(`LINE ${lineNum}`);
		console.log(`${"=".repeat(60)}`);
		console.log("[USER PROMPT (first 700 chars)]:\n");
		console.log(obj.messages[1].content.slice(0, 700));
		console.log("\n[ASSISTANT RESPONSE]:\n");
		console.log(obj.messages[2].content);
	}
	lineNum++;
	if (lineNum > 1_000_001) break;
}

console.log("\n\nTotal lines sampled up to:", lineNum);
