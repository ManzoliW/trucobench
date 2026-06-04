import * as fs from "node:fs";
import { HeuristicAgent } from "../packages/agents/src/heuristic-agent.ts";
import { serializePrompt } from "../packages/agents/src/prompt.ts";
import { Game } from "../packages/engine/src/game.ts";

async function generate() {
	if (!fs.existsSync("dataset")) {
		fs.mkdirSync("dataset");
	}

	const NUM_GAMES = 100000;
	const stream = fs.createWriteStream("dataset/truco_sft_100k.jsonl");

	const promptOpts = { variant: "standard" as const, language: "en" as const };
	const systemPrompt =
		"You are an expert Truco Paulista player with deep understanding of bluffing and psychological play.\n\nCore strategic principles:\n- BLUFFING: Calling truco with a weak hand is a legitimate and powerful strategy. Consider bluffing when: you won the first trick, the score is against you, or the opponent has been folding often.\n- BLUFF DETECTION: When your opponent calls truco, consider: did they win trick 1 easily (likely strong) or barely? Is the score in their favor (less need to bluff) or against them (more likely to bluff)?\n- FOLDING IS STRATEGIC: Fold when genuinely weak AND opponent likely strong. But don't always fold — that invites more bluffs.\n- SCORE AWARENESS: When behind, bluff more and accept more. When ahead, play conservatively.\n- ESCALATION TIMING: Calling truco BEFORE playing your strong card creates more pressure.\n\nAnalyze the game state carefully and respond with a valid JSON action.";

	let totalDataPoints = 0;

	for (let i = 0; i < NUM_GAMES; i++) {
		const game = new Game({ seed: 42000 + i });
		const agents = [new HeuristicAgent(), new HeuristicAgent()];
		game.reset();

		while (game.state.winner === null) {
			const playerId = game.getCurrentPlayer();
			if (playerId === null) break;

			const obs = game.observe(playerId);
			if (obs.legalActions.length === 0) break;

			const agent = agents[playerId];
			const action = await agent!.getAction(obs);

			const prompt = serializePrompt(obs, promptOpts);

			// Map action to our exact JSON schema
			const responseObj: any = {
				reasoning: "Optimal strategy derived from game-theoretic heuristics and expected value calculation.",
				action: action.type,
			};
			if ("cardIndex" in action) {
				responseObj.card_index = action.cardIndex;
			} else {
				responseObj.card_index = 0; // The parser expects card_index, even if 0 for non-play actions
			}

			const dataLine = {
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: prompt },
					{ role: "assistant", content: JSON.stringify(responseObj, null, 2) },
				],
			};

			stream.write(JSON.stringify(dataLine) + "\n");
			totalDataPoints++;

			game.step(playerId, action);
		}

		if ((i + 1) % 10000 === 0) {
			console.log(`Simulated ${i + 1} games... (${totalDataPoints} actions recorded)`);
		}
	}

	stream.end();
	console.log(`\nSuccess! Generated ${totalDataPoints} fine-tuning examples from ${NUM_GAMES} games.`);
	console.log("Dataset saved to: dataset/truco_sft_100k.jsonl");
}

generate().catch(console.error);
