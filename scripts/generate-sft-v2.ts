import * as fs from "node:fs";
import { HeuristicAgent } from "../packages/agents/src/heuristic-agent.ts";
import { serializePrompt } from "../packages/agents/src/prompt.ts";
import { Game } from "../packages/engine/src/game.ts";
import { cardStrength, isManilha, cardToString } from "../packages/engine/src/index.ts";

const NUM_GAMES = 100_000;
const promptOpts = { variant: "standard" as const, language: "en" as const };
const systemPrompt =
	"You are an expert Truco Paulista player with deep understanding of bluffing and psychological play.\n\nCore strategic principles:\n- BLUFFING: Calling truco with a weak hand is a legitimate and powerful strategy. Consider bluffing when: you won the first trick, the score is against you, or the opponent has been folding often.\n- BLUFF DETECTION: When your opponent calls truco, consider: did they win trick 1 easily (likely strong) or barely? Is the score in their favor (less need to bluff) or against them (more likely to bluff)?\n- FOLDING IS STRATEGIC: Fold when genuinely weak AND opponent likely strong. But don't always fold — that invites more bluffs.\n- SCORE AWARENESS: When behind, bluff more and accept more. When ahead, play conservatively.\n- ESCALATION TIMING: Calling truco BEFORE playing your strong card creates more pressure.\n\nAnalyze the game state carefully and respond with a valid JSON action.";

/**
 * Introspect the observation and chosen action to produce a meaningful reasoning trace.
 * Mirrors the HeuristicAgent decision tree logic so the reasoning is truthful.
 */
function generateReasoning(obs: any, action: any): string {
	const { hand, vira, tricks, escalation, score, playerId, currentTrick } = obs;
	const oppIdx = playerId === 0 ? 1 : 0;
	const myScore = score[playerId];
	const oppScore = score[oppIdx];
	const manilhas = hand.filter((c: any) => isManilha(c, vira));
	const highCards = hand.filter((c: any) => cardStrength(c, vira) >= 7);
	const manilhaCount = manilhas.length;
	const highCardCount = highCards.length;
	const handStrength = hand.map((c: any) => cardStrength(c, vira));
	const maxStrength = Math.max(...handStrength);
	const minStrength = Math.min(...handStrength);
	const scoreDiff = myScore - oppScore;
	const trickCount = tricks.length;
	const wonTrick1 = trickCount >= 1 && tricks[0].winner === playerId;
	const lostTrick1 = trickCount >= 1 && tricks[0].winner !== null && tricks[0].winner !== playerId;
	const isResponding = escalation.pendingRequest !== null && escalation.requestedBy !== playerId;
	const isLeading = currentTrick.firstCard === null;

	const parts: string[] = [];

	// Hand assessment
	if (manilhaCount >= 2) {
		parts.push(`Strong hand: ${manilhaCount} manilhas (${manilhas.map((c: any) => cardToString(c)).join(", ")})`);
	} else if (manilhaCount === 1) {
		parts.push(`Decent hand: 1 manilha (${cardToString(manilhas[0])}), max strength ${maxStrength}`);
	} else if (highCardCount >= 2) {
		parts.push(`Moderate hand: ${highCardCount} high cards (strength ${handStrength.join(", ")}), no manilhas`);
	} else {
		parts.push(`Weak hand: max strength ${maxStrength}, no manilhas`);
	}

	// Score context
	if (scoreDiff >= 5) {
		parts.push(`Leading by ${scoreDiff} points — playing conservatively`);
	} else if (scoreDiff <= -5) {
		parts.push(`Trailing by ${Math.abs(scoreDiff)} points — must take risks, considering bluff`);
	} else if (scoreDiff < 0) {
		parts.push(`Slightly behind (${myScore} vs ${oppScore}) — mild pressure to be aggressive`);
	} else {
		parts.push(`Score even or ahead (${myScore} vs ${oppScore})`);
	}

	// Positional context
	if (trickCount === 0) {
		parts.push("Trick 1 opening — opponent's hand unknown");
	} else if (wonTrick1) {
		parts.push("Won Trick 1 — positional advantage, opponent must win both remaining tricks");
	} else if (lostTrick1) {
		parts.push("Lost Trick 1 — must win both remaining tricks to win the round");
	}

	// Action-specific reasoning
	if (action.type === "TRUCO") {
		if (manilhaCount >= 2) {
			parts.push("Decision: Call TRUCO — dominant hand, opponent likely to fold or accept at a disadvantage");
		} else if (manilhaCount >= 1 && trickCount >= 1) {
			parts.push("Decision: Call TRUCO — decent hand with positional advantage from winning a trick");
		} else if (scoreDiff <= -5) {
			parts.push("Decision: Desperation BLUFF with TRUCO — significantly behind, the expected value of folding is already negative");
		} else if (wonTrick1) {
			parts.push("Decision: Positional BLUFF with TRUCO — won Trick 1, opponent cannot know our actual strength");
		} else {
			parts.push("Decision: Opportunistic TRUCO — creating pressure to extract fold equity");
		}
	} else if (action.type === "ACCEPT") {
		if (isResponding) {
			if (manilhaCount >= 1 || highCardCount >= 2) {
				parts.push("Decision: ACCEPT — hand is strong enough to contest at higher stakes");
			} else {
				parts.push("Decision: ACCEPT despite weak hand — opponent shows bluffing pattern (truco after losing trick or while losing)");
			}
		} else {
			parts.push("Decision: ACCEPT Mão de Onze — hand quality justifies accepting the 11-point challenge");
		}
	} else if (action.type === "FOLD") {
		parts.push("Decision: FOLD — hand is too weak to contest at current stakes, preserving points");
	} else if (action.type === "RAISE") {
		parts.push(`Decision: RAISE — strong enough hand (${manilhaCount} manilha(s)) to escalate stakes further`);
	} else if (action.type === "PLAY_CARD") {
		const cardIdx = action.cardIndex;
		const card = hand[cardIdx];
		const str = cardStrength(card, vira);
		const isM = isManilha(card, vira);

		if (!isLeading && currentTrick.firstCard) {
			const oppStr = cardStrength(currentTrick.firstCard, vira);
			if (str > oppStr) {
				parts.push(`Decision: Play ${cardToString(card)} (strength ${str}) to beat opponent's ${cardToString(currentTrick.firstCard)} (strength ${oppStr}) — minimum winning card`);
			} else {
				parts.push(`Decision: Cannot beat opponent's ${cardToString(currentTrick.firstCard)} (strength ${oppStr}) — discard weakest card ${cardToString(card)} (strength ${str})`);
			}
		} else if (trickCount === 0) {
			if (!isM && str === maxStrength) {
				parts.push(`Decision: Lead Trick 1 with strongest non-manilha ${cardToString(card)} (strength ${str}) — probe opponent's strength while preserving manilhas`);
			} else if (isM) {
				parts.push(`Decision: Lead with manilha ${cardToString(card)} — all cards are manilhas, playing the weakest one`);
			} else {
				parts.push(`Decision: Lead with ${cardToString(card)} (strength ${str})`);
			}
		} else {
			parts.push(`Decision: Play strongest card ${cardToString(card)} (strength ${str}) in Trick ${trickCount + 1} — must secure the round`);
		}
	}

	return parts.join(". ");
}

async function generate() {
	if (!fs.existsSync("dataset")) {
		fs.mkdirSync("dataset");
	}

	const stream = fs.createWriteStream("dataset/truco_sft_100k_v2.jsonl");
	let totalDataPoints = 0;
	let actionDistribution: Record<string, number> = {};

	for (let i = 0; i < NUM_GAMES; i++) {
		const game = new Game({ seed: 42000 + i });
		const agents = [new HeuristicAgent(i * 100), new HeuristicAgent(i * 200 + 1)];
		game.reset();

		while (game.state.winner === null) {
			const playerId = game.getCurrentPlayer();
			if (playerId === null) break;

			const obs = game.observe(playerId);
			if (obs.legalActions.length === 0) break;

			const agent = agents[playerId];
			const action = await agent!.getAction(obs);
			const prompt = serializePrompt(obs, promptOpts);

			// Generate real reasoning from heuristic decision context
			const reasoning = generateReasoning(obs, action);

			const responseObj: any = {
				reasoning,
				action: action.type,
			};
			if ("cardIndex" in action) {
				responseObj.card_index = action.cardIndex;
			} else {
				responseObj.card_index = 0;
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
			actionDistribution[action.type] = (actionDistribution[action.type] ?? 0) + 1;

			game.step(playerId, action);
		}

		if ((i + 1) % 10_000 === 0) {
			console.log(`Simulated ${i + 1} games... (${totalDataPoints} actions recorded)`);
		}
	}

	await new Promise<void>((res) => stream.end(res));

	console.log(`\nSuccess! Generated ${totalDataPoints} fine-tuning examples from ${NUM_GAMES} games.`);
	console.log("Dataset saved to: dataset/truco_sft_100k_v2.jsonl");
	console.log("\nAction distribution:");
	for (const [action, count] of Object.entries(actionDistribution).sort((a, b) => b[1] - a[1])) {
		console.log(`  ${action}: ${count} (${((count / totalDataPoints) * 100).toFixed(1)}%)`);
	}
}

generate().catch(console.error);
