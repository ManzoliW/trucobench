import type { Agent, LLMAgent } from "@trucobench/agents";
import { type Action, ActionType, Game, type PlayerId } from "@trucobench/engine";
import { Checkpoint } from "./checkpoint.ts";
import type {
	ActionRecord,
	EscalationEvent,
	GameRecord,
	MatchupResult,
	RoundRecord,
	TournamentConfig,
	TournamentResult,
} from "./types.ts";

function generateId(): string {
	return Math.random().toString(36).slice(2, 10);
}

function isLLMAgent(agent: Agent): agent is LLMAgent {
	return "lastTrace" in agent && "stats" in agent;
}

export async function playGame(
	agent0: Agent,
	agent1: Agent,
	seed: number,
	isDuplicate = false,
	duplicateOf?: string,
): Promise<GameRecord> {
	const game = new Game({ seed });
	game.reset();

	const agents: [Agent, Agent] = [agent0, agent1];
	const rounds: RoundRecord[] = [];
	let currentRoundActions: ActionRecord[] = [];
	let currentEscalationHistory: EscalationEvent[] = [];
	const startTime = performance.now();

	let prevRoundNumber = game.state.roundNumber;

	while (game.state.winner === null) {
		const playerId = game.getCurrentPlayer();
		if (playerId === null) break;

		const obs = game.observe(playerId);
		if (obs.legalActions.length === 0) break;

		const agent = agents[playerId];
		let action: Action;
		
		try {
			// Add a timeout to prevent infinite hangs
			const timeout = new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error("Timeout getting action")), 30000);
			});
			action = await Promise.race([agent.getAction(obs), timeout]);
		} catch (err: any) {
			console.error(`[Tournament] Error getting action for ${agent.name}:`, err.message || err);
			// Simulating weakest legal action on failure
			action = obs.legalActions[0]; // fallback
		}

		// Record action
		const record: ActionRecord = { player: playerId, action };

		// Capture LLM trace if available
		if (isLLMAgent(agent) && agent.lastTrace) {
			const trace = agent.lastTrace;
			record.reasoning = trace.reasoning;
			record.raw = trace.raw;
			record.parseAttempts = trace.attempts;
			record.fallback = trace.fallback;
			record.inputTokens = trace.response.inputTokens;
			record.outputTokens = trace.response.outputTokens;
			record.latencyMs = trace.response.latencyMs;
		}

		currentRoundActions.push(record);

		// Track escalation events
		if (
			action.type === ActionType.TRUCO ||
			action.type === ActionType.ACCEPT ||
			action.type === ActionType.RAISE ||
			action.type === ActionType.FOLD
		) {
			currentEscalationHistory.push({
				player: playerId,
				action: action.type as EscalationEvent["action"],
				level: game.state.currentRound?.escalation.level ?? "NORMAL",
			});
		}

		const result = game.step(playerId, action);

		if (result.roundDone) {
			rounds.push({
				roundNumber: prevRoundNumber,
				vira: obs.vira,
				tricks: game.state.currentRound?.tricks ?? obs.tricks,
				escalationHistory: currentEscalationHistory,
				winner: result.roundWinner,
				points: 0, // will compute from score diff
				finalEscalation: obs.escalation.level,
				actions: currentRoundActions,
			});
			currentRoundActions = [];
			currentEscalationHistory = [];
			prevRoundNumber = game.state.roundNumber;
		}
	}

	const totalDurationMs = performance.now() - startTime;

	return {
		id: generateId(),
		seed,
		agents: [agent0.name, agent1.name],
		winner: game.state.winner!,
		scores: [...game.state.scores] as [number, number],
		rounds,
		totalDurationMs,
		duplicate: isDuplicate,
		duplicateOf,
	};
}

export async function playMatchup(
	makeAgent0: () => Agent,
	makeAgent1: () => Agent,
	gamesPerMatchup: number,
	baseSeed: number,
	duplicate: boolean,
): Promise<MatchupResult> {
	const games: GameRecord[] = [];
	const wins: [number, number] = [0, 0];

	for (let i = 0; i < gamesPerMatchup; i++) {
		const seed = baseSeed + i;

		// Original game
		const agent0 = makeAgent0();
		const agent1 = makeAgent1();
		const record = await playGame(agent0, agent1, seed);
		games.push(record);
		wins[record.winner]++;

		// Duplicate (swap hands) — same seed but agents swap positions
		if (duplicate) {
			const dupAgent0 = makeAgent1(); // swapped
			const dupAgent1 = makeAgent0();
			const dupRecord = await playGame(dupAgent0, dupAgent1, seed, true, record.id);
			games.push(dupRecord);
			// In duplicate, agent0 is now the original agent1, so flip winner attribution
			if (dupRecord.winner === 0) {
				wins[1]++;
			} else {
				wins[0]++;
			}
		}
	}

	return {
		agent0: makeAgent0().name,
		agent1: makeAgent1().name,
		games,
		wins,
		draws: 0, // Truco games always have a winner
	};
}

export interface AgentFactory {
	name: string;
	create: () => Agent;
}

async function asyncPool<T, R>(
	concurrency: number,
	items: T[],
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = [];
	const executing: Promise<void>[] = [];
	for (const item of items) {
		const p = fn(item).then((result) => {
			results.push(result);
		});
		executing.push(p);
		if (executing.length >= concurrency) {
			await Promise.race(executing);
			// Remove finished promises
			for (let i = executing.length - 1; i >= 0; i--) {
				// biome-ignore lint/suspicious/noExplicitAny: internal check
				if ((executing[i] as any).status === "fulfilled" || (executing[i] as any).status === "rejected") {
					executing.splice(i, 1);
				}
			}
			// Note: race doesn't tell us which one finished, so we just filter
			// A better way is to wrap promises to track status
		}
	}
	await Promise.all(executing);
	return results;
}

// Re-implementing asyncPool more robustly
async function pool<T, R>(
	concurrency: number,
	items: T[],
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let i = 0;
	const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (i < items.length) {
			const index = i++;
			results[index] = await fn(items[index]!);
		}
	});
	await Promise.all(workers);
	return results;
}

export async function runTournamentParallel(
	agents: AgentFactory[],
	config: TournamentConfig,
	concurrency = 4,
	checkpointDir?: string,
): Promise<TournamentResult> {
	const checkpoint = checkpointDir ? new Checkpoint(checkpointDir) : null;
	const startTime = checkpoint?.startTime ?? new Date().toISOString();

	const matchupTasks: { a: AgentFactory; b: AgentFactory; offset: number }[] = [];
	let seedOffset = 0;

	for (let i = 0; i < agents.length; i++) {
		for (let j = i + 1; j < agents.length; j++) {
			matchupTasks.push({ a: agents[i]!, b: agents[j]!, offset: seedOffset });
			seedOffset += config.gamesPerMatchup;
		}
	}

	const matchups = await pool(concurrency, matchupTasks, async (task) => {
		return await playMatchupWithCheckpoint(
			task.a.create,
			task.b.create,
			config.gamesPerMatchup,
			config.baseSeed + task.offset,
			config.duplicate,
			checkpoint,
		);
	});

	const totalGames = matchups.reduce((sum, m) => sum + m.games.length, 0);

	return {
		config,
		matchups,
		startTime,
		endTime: new Date().toISOString(),
		totalGames,
	};
}

export async function runTournament(
	agents: AgentFactory[],
	config: TournamentConfig,
	checkpointDir?: string,
): Promise<TournamentResult> {
	const checkpoint = checkpointDir ? new Checkpoint(checkpointDir) : null;
	const matchups: MatchupResult[] = [];
	const startTime = checkpoint?.startTime ?? new Date().toISOString();
	let seedOffset = 0;

	// Round-robin: every agent vs every other agent
	for (let i = 0; i < agents.length; i++) {
		for (let j = i + 1; j < agents.length; j++) {
			const a = agents[i]!;
			const b = agents[j]!;
			const result = await playMatchupWithCheckpoint(
				a.create,
				b.create,
				config.gamesPerMatchup,
				config.baseSeed + seedOffset,
				config.duplicate,
				checkpoint,
			);
			matchups.push(result);
			seedOffset += config.gamesPerMatchup;
		}
	}

	const totalGames = matchups.reduce((sum, m) => sum + m.games.length, 0);

	return {
		config,
		matchups,
		startTime,
		endTime: new Date().toISOString(),
		totalGames,
	};
}

async function playMatchupWithCheckpoint(
	makeAgent0: () => Agent,
	makeAgent1: () => Agent,
	gamesPerMatchup: number,
	baseSeed: number,
	duplicate: boolean,
	checkpoint: Checkpoint | null,
): Promise<MatchupResult> {
	const agent0Name = makeAgent0().name;
	const agent1Name = makeAgent1().name;
	const existing = checkpoint?.getCompletedGames(agent0Name, agent1Name) ?? [];
	const games: GameRecord[] = [...existing];
	const wins: [number, number] = [0, 0];

	// Recompute wins from existing games
	for (const g of existing) {
		if (g.duplicate) {
			// Duplicate: agents were swapped
			if (g.winner === 0) wins[1]++;
			else wins[0]++;
		} else {
			wins[g.winner]++;
		}
	}

	// Figure out how many original games are done
	const existingOriginals = existing.filter((g) => !g.duplicate).length;

	for (let i = existingOriginals; i < gamesPerMatchup; i++) {
		const seed = baseSeed + i;

		// Original game
		const agent0 = makeAgent0();
		const agent1 = makeAgent1();
		const record = await playGame(agent0, agent1, seed);
		games.push(record);
		wins[record.winner]++;
		checkpoint?.saveGame(agent0Name, agent1Name, record);

		// Duplicate (swap hands)
		if (duplicate) {
			const dupAgent0 = makeAgent1();
			const dupAgent1 = makeAgent0();
			const dupRecord = await playGame(dupAgent0, dupAgent1, seed, true, record.id);
			games.push(dupRecord);
			if (dupRecord.winner === 0) wins[1]++;
			else wins[0]++;
			checkpoint?.saveGame(agent0Name, agent1Name, dupRecord);
		}
	}

	return {
		agent0: agent0Name,
		agent1: agent1Name,
		games,
		wins,
		draws: 0,
	};
}
