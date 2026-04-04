import {
	type Agent,
	AiSdkProvider,
	AnthropicProvider,
	DeepSeekProvider,
	GoogleProvider,
	HeuristicAgent,
	LLMAgent,
	type LLMProvider,
	OllamaProvider,
	OpenAICompatProvider,
	OpenAIProvider,
	type PromptLanguage,
	type PromptVariant,
	RandomAgent,
	RetryProvider,
	createHuggingFaceProvider,
	createOpenRouterProvider,
	createVercelGatewayProvider,
	weakestLegalAction,
} from "@trucobench/agents";
import {
	type Action,
	ActionType,
	FourPlayerGame,
	type FourPlayerObservation,
	Game,
	type Observation,
	type PlayerId,
	type SeatId,
	type SignalType,
	isManilha,
	teamOf,
} from "@trucobench/engine";

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export type ProviderMode =
	| "direct"
	| "openrouter"
	| "vercel-gateway"
	| "huggingface"
	| "ai-sdk"
	| "agent-sdk";

export interface GameConfig {
	players: PlayerConfig[]; // 2 or 4 players
	seed?: number;
	prompt: PromptVariant;
	language: PromptLanguage;
	temperature: number;
	providerMode: ProviderMode;
	/** Turn timeout in milliseconds. 0 = no limit. Default: 60000 (60s) */
	turnTimeoutMs: number;
	/** Per-provider API keys (optional — falls back to .env) */
	apiKeys?: Record<string, string>;
}

export interface PlayerConfig {
	type: "human" | "random" | "heuristic" | "llm";
	model?: string;
	name?: string;
}

export interface GameEvent {
	type:
		| "state"
		| "action"
		| "trick_end"
		| "round_end"
		| "round_pause"
		| "game_end"
		| "waiting_human"
		| "error"
		| "signal_sent"
		| "signal_received"
		| "signal_intercepted"
		| "chat"
		| "timeout";
	data: unknown;
}

export interface GameSnapshot {
	mode: "2p" | "4p";
	scores: [number, number];
	roundNumber: number;
	players: PlayerConfig[];
	currentSeat: number | null;
	winner: number | null; // team index
	// Per-seat observations (only the seat's own hand is visible)
	observations: (Observation | FourPlayerObservation | null)[];
}

/* ── Model ID mapping ──────────────────────────────────── */

const MODEL_IDS: Record<
	string,
	{ direct: [string, string]; openrouter: string; gateway: string }
> = {
	"gpt-4o": { direct: ["openai", "gpt-4o"], openrouter: "openai/gpt-4o", gateway: "gpt-4o" },
	"gpt-4o-mini": {
		direct: ["openai", "gpt-4o-mini"],
		openrouter: "openai/gpt-4o-mini",
		gateway: "gpt-4o-mini",
	},
	"claude-sonnet-4.6": {
		direct: ["anthropic", "claude-sonnet-4-6-20260327"],
		openrouter: "anthropic/claude-sonnet-4-6-20260327",
		gateway: "claude-sonnet-4-6-20260327",
	},
	"claude-haiku-4.5": {
		direct: ["anthropic", "claude-haiku-4-5-20251001"],
		openrouter: "anthropic/claude-haiku-4-5-20251001",
		gateway: "claude-haiku-4-5-20251001",
	},
	"gemini-2.5-pro": {
		direct: ["google", "gemini-2.5-pro"],
		openrouter: "google/gemini-2.5-pro",
		gateway: "gemini-2.5-pro",
	},
	"gemini-2.5-flash": {
		direct: ["google", "gemini-2.5-flash"],
		openrouter: "google/gemini-2.5-flash",
		gateway: "gemini-2.5-flash",
	},
	"deepseek-r1": {
		direct: ["deepseek", "deepseek-reasoner"],
		openrouter: "deepseek/deepseek-r1",
		gateway: "deepseek-reasoner",
	},
};

function createDirectProvider(name: string, id: string, apiKey?: string): LLMProvider {
	switch (name) {
		case "openai":
			return new OpenAIProvider(id, apiKey);
		case "anthropic":
			return new AnthropicProvider(id, apiKey);
		case "google":
			return new GoogleProvider(id, apiKey);
		case "deepseek":
			return new DeepSeekProvider(id, apiKey);
		default:
			return new OpenAIProvider(id, apiKey);
	}
}

const CLI_MODEL_MAP: Record<string, string> = {
	"claude-sonnet-4-6-20260327": "sonnet",
	"claude-haiku-4-5-20251001": "haiku",
};

function createClaudeCliProvider(model: string): LLMProvider {
	const cliModel = CLI_MODEL_MAP[model] ?? model;
	return {
		name: "agent-sdk",
		model: cliModel,
		async chat(messages) {
			const { spawn } = await import("node:child_process");
			const systemMsg = messages.find((m) => m.role === "system");
			const userMsgs = messages.filter((m) => m.role !== "system");
			const lastUserMsg = userMsgs[userMsgs.length - 1];
			if (!lastUserMsg) return { content: "", inputTokens: 0, outputTokens: 0, latencyMs: 0 };
			const prompt = systemMsg
				? `${systemMsg.content}\n\n${lastUserMsg.content}`
				: lastUserMsg.content;
			const start = performance.now();
			const result = await new Promise<string>((resolve, reject) => {
				const proc = spawn(
					"claude",
					["-p", "-", "--model", cliModel, "--max-turns", "1", "--output-format", "text"],
					{ stdio: ["pipe", "pipe", "pipe"] },
				);
				let stdout = "",
					stderr = "";
				proc.stdout.on("data", (c: Buffer) => {
					stdout += c.toString();
				});
				proc.stderr.on("data", (c: Buffer) => {
					stderr += c.toString();
				});
				proc.on("close", (code) => {
					if (code === 0) resolve(stdout);
					else reject(new Error(`claude exited ${code}: ${stderr || stdout}`));
				});
				proc.on("error", reject);
				proc.stdin.write(prompt);
				proc.stdin.end();
			});
			return {
				content: result.trim(),
				inputTokens: 0,
				outputTokens: 0,
				latencyMs: performance.now() - start,
			};
		},
	};
}

async function createAgent(config: PlayerConfig, gameConfig: GameConfig): Promise<Agent | null> {
	if (config.type === "human") return null;
	if (config.type === "random") return new RandomAgent();
	if (config.type === "heuristic") return new HeuristicAgent();

	const model = config.model ?? "";
	const promptOptions = { variant: gameConfig.prompt, language: gameConfig.language };
	const mode = gameConfig.providerMode ?? "direct";
	console.log(`[game] Creating agent: model=${model} mode=${mode}`);

	if (model.startsWith("ollama/")) {
		return new LLMAgent({
			provider: new RetryProvider(new OllamaProvider(model.slice(7))),
			promptOptions,
			temperature: gameConfig.temperature,
			economyMode: gameConfig.prompt === "economy",
		});
	}

	let provider: LLMProvider;
	switch (mode) {
		case "openrouter": {
			const orModel = MODEL_IDS[model]?.openrouter ?? model;
			const orKey = gameConfig.apiKeys?.openrouter ?? process.env.OPENROUTER_API_KEY ?? "";
			provider = new OpenAICompatProvider("openrouter", orModel, "https://openrouter.ai/api/v1", orKey);
			break;
		}
		case "vercel-gateway": {
			const vgModel = MODEL_IDS[model]?.openrouter ?? model;
			const vgKey = gameConfig.apiKeys?.["vercel-gateway"] ?? process.env.VERCEL_AI_GATEWAY_API_KEY ?? "";
			const vgUrl = process.env.VERCEL_AI_GATEWAY_URL ?? "https://ai-gateway.vercel.sh/v1";
			provider = new OpenAICompatProvider("vercel-gateway", vgModel, vgUrl, vgKey);
			break;
		}
		case "huggingface": {
			const hfKey = gameConfig.apiKeys?.huggingface ?? process.env.HF_TOKEN ?? "";
			provider = new OpenAICompatProvider("huggingface", model, "https://router.huggingface.co/v1", hfKey);
			break;
		}
		case "ai-sdk": {
			const ids = MODEL_IDS[model];
			provider = new AiSdkProvider(
				(ids?.direct[0] ?? "openai") as "openai" | "anthropic" | "google",
				ids?.direct[1] ?? model,
			);
			break;
		}
		case "agent-sdk": {
			const ids = MODEL_IDS[model];
			provider = createClaudeCliProvider(ids?.direct[1] ?? model);
			break;
		}
		default: {
			const ids = MODEL_IDS[model];
			const providerName = ids?.direct[0] ?? "openai";
			const apiKey = gameConfig.apiKeys?.[providerName];
			// Anthropic models: fallback to Claude CLI if no API key
			if (providerName === "anthropic" && !apiKey && !process.env.ANTHROPIC_API_KEY) {
				provider = createClaudeCliProvider(ids?.direct[1] ?? model);
			} else {
				provider = ids
					? createDirectProvider(ids.direct[0], ids.direct[1], apiKey)
					: new OpenAIProvider(model, apiKey);
			}
			break;
		}
	}

	console.log(`[game] Provider ready: ${provider.name}/${provider.model}`);
	return new LLMAgent({
		provider: new RetryProvider(provider),
		promptOptions,
		temperature: gameConfig.temperature,
		economyMode: gameConfig.prompt === "economy",
	});
}

/* ── Session management ───────────────────────────────── */

// Attach to globalThis so the map survives module re-evaluation in Next.js dev mode
const globalGames = globalThis as unknown as { __trucobench_games?: Map<string, GameSession> };
if (!globalGames.__trucobench_games) {
	globalGames.__trucobench_games = new Map();
}
const activeGames = globalGames.__trucobench_games;

export interface GameSession {
	id: string;
	config: GameConfig;
	mode: "2p" | "4p";
	game2p: Game | null;
	game4p: FourPlayerGame | null;
	agents: (Agent | null)[];
	events: GameEvent[];
	pendingHumanAction: ((action: Action) => void) | null;
	pendingContinue: (() => void) | null; // for round pause
	speedMultiplier: number; // 0.5=slow, 1=normal, 2=fast
	running: boolean;
	snapshot: GameSnapshot;
	/** Chat messages for the current game */
	chatMessages: { seat: number; name: string; text: string }[];
}

function generateId(): string {
	return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export async function createGame(config: GameConfig): Promise<GameSession> {
	const id = generateId();
	const seed = config.seed ?? Math.floor(Math.random() * 100000);
	const mode = config.players.length === 4 ? "4p" : "2p";

	const playerSummary = config.players.map((p) => `${p.type}${p.model ? `(${p.model})` : ""}`).join(", ");
	console.log(`[game] Creating ${mode} game ${id}: [${playerSummary}] provider=${config.providerMode}`);

	const agents: (Agent | null)[] = [];
	for (const p of config.players) {
		agents.push(await createAgent(p, config));
	}

	let game2p: Game | null = null;
	let game4p: FourPlayerGame | null = null;

	if (mode === "4p") {
		game4p = new FourPlayerGame(seed);
		game4p.reset();
	} else {
		game2p = new Game(seed);
		game2p.reset();
	}

	const session: GameSession = {
		id,
		config,
		mode,
		game2p,
		game4p,
		agents,
		events: [],
		pendingHumanAction: null,
		pendingContinue: null,
		speedMultiplier: 1,
		running: false,
		snapshot: buildSnapshot(mode, config, game2p, game4p),
		chatMessages: [],
	};

	activeGames.set(id, session);
	return session;
}

export function getGame(id: string): GameSession | undefined {
	return activeGames.get(id);
}

function buildSnapshot(
	mode: "2p" | "4p",
	config: GameConfig,
	game2p: Game | null,
	game4p: FourPlayerGame | null,
): GameSnapshot {
	if (mode === "4p" && game4p) {
		const obs = game4p.state.currentRound
			? [0, 1, 2, 3].map((s) => game4p.observe(s as SeatId))
			: [null, null, null, null];
		return {
			mode: "4p",
			scores: [...game4p.state.scores] as [number, number],
			roundNumber: game4p.state.roundNumber,
			players: config.players,
			currentSeat: game4p.getCurrentSeat(),
			winner: game4p.state.winner,
			observations: obs,
		};
	}
	if (game2p) {
		return {
			mode: "2p",
			scores: [...game2p.state.scores] as [number, number],
			roundNumber: game2p.state.roundNumber,
			players: config.players,
			currentSeat: game2p.getCurrentPlayer(),
			winner: game2p.state.winner,
			observations: game2p.state.currentRound
				? [game2p.observe(0), game2p.observe(1)]
				: [null, null],
		};
	}
	return {
		mode,
		scores: [0, 0],
		roundNumber: 0,
		players: config.players,
		currentSeat: null,
		winner: null,
		observations: [],
	};
}

export async function runGame(session: GameSession): Promise<void> {
	session.running = true;

	// Brief wait for SSE stream to connect
	await delay(500);

	if (session.mode === "4p") {
		await run4pGame(session);
	} else {
		await run2pGame(session);
	}

	session.running = false;
}

/** Speed-aware delay */
function gameDelay(session: GameSession, baseMs: number): Promise<void> {
	const ms = Math.round(baseMs / session.speedMultiplier);
	return delay(ms);
}

/** Wait for user to click "Continue" (spectator round pause) */
function waitForContinue(session: GameSession): Promise<void> {
	return new Promise((resolve) => {
		session.pendingContinue = resolve;
	});
}

async function run2pGame(session: GameSession): Promise<void> {
	const game = session.game2p!;
	const allAi = session.agents.every((a) => a !== null);
	const seatNames = getSeatNames(session.config);

	while (game.state.winner === null) {
		const pid = game.getCurrentPlayer();
		if (pid === null) break;
		session.snapshot = buildSnapshot("2p", session.config, game, null);
		session.events.push({ type: "state", data: session.snapshot });

		const agent = session.agents[pid];
		let action: Action;
		const humanTimeoutMs = session.config.turnTimeoutMs;
		// AI gets a generous 120s safety timeout — LLMs like Sonnet 4.6 need time to reason
		const aiTimeoutMs = 120_000;
		if (agent === null) {
			const obs = game.observe(pid);
			session.events.push({
				type: "waiting_human",
				data: { seat: pid, timeoutMs: humanTimeoutMs },
			});
			if (humanTimeoutMs > 0) {
				action = await Promise.race([
					new Promise<Action>((r) => {
						session.pendingHumanAction = r;
					}),
					delay(humanTimeoutMs).then(() => {
						session.pendingHumanAction = null;
						session.events.push({ type: "timeout", data: { seat: pid } });
						return weakestLegalAction(obs);
					}),
				]);
			} else {
				action = await new Promise<Action>((r) => {
					session.pendingHumanAction = r;
				});
			}
			session.pendingHumanAction = null;
		} else {
			// Brief pause before AI acts so humans can see the state change
			await gameDelay(session, 300);
			const obs = game.observe(pid);
			obs.chatHistory = session.chatMessages.slice(-10);
			try {
				action = await Promise.race([
					agent.getAction(obs),
					delay(aiTimeoutMs).then(() => {
						session.events.push({ type: "timeout", data: { seat: pid } });
						return weakestLegalAction(obs);
					}),
				]);
			} catch (err) {
				const errMsg = err instanceof Error ? err.message : String(err);
				const seatName = getSeatNames(session.config)[pid] ?? `Seat ${pid}`;
				console.error(`[game] Agent error (${seatName}, model=${session.config.players[pid]?.model}):`, errMsg);
				session.events.push({
					type: "error",
					data: { seat: pid, error: `${seatName}: ${errMsg}` },
				});
				return;
			}
		}

		const reasoning = agent instanceof LLMAgent ? agent.lastTrace?.reasoning : undefined;
		const latency = agent instanceof LLMAgent ? agent.lastTrace?.response?.latencyMs : undefined;
		const chat =
			agent instanceof LLMAgent
				? agent.lastTrace?.chat
				: (agent as HeuristicAgent | null)?.lastChat;
		console.log(`[game] Seat ${pid} (${seatNames[pid]}): ${action.type}${"cardIndex" in action ? ` card=${action.cardIndex}` : ""}${latency ? ` ${Math.round(latency)}ms` : ""}`);
		const result = game.step(pid, action);
		session.events.push({ type: "action", data: { seat: pid, action, reasoning } });
		if (chat) {
			const name = seatNames[pid] ?? `Seat ${pid}`;
			session.chatMessages.push({ seat: pid, name, text: chat });
			session.events.push({ type: "chat", data: { seat: pid, name, text: chat } });
		}
		session.snapshot = buildSnapshot("2p", session.config, game, null);

		// Pause after AI plays so the animation is visible
		if (agent !== null) {
			if (action.type === ActionType.PLAY_CARD) await gameDelay(session, 700);
			else await gameDelay(session, 1000);
		}

		if (result.roundDone) {
			console.log(`[game] Round end — scores: ${result.scores[0]}-${result.scores[1]}`);
			session.events.push({ type: "trick_end", data: session.snapshot });
			await gameDelay(session, 1200);
			session.events.push({
				type: "round_end",
				data: { winner: result.roundWinner, scores: result.scores },
			});
			if (allAi) {
				session.events.push({ type: "round_pause", data: { scores: result.scores } });
				await waitForContinue(session);
			} else {
				await gameDelay(session, 800);
			}
		}
		if (result.done) {
			console.log(`[game] Game over — winner: team ${result.winner}, final: ${result.scores[0]}-${result.scores[1]}`);
			session.events.push({
				type: "game_end",
				data: { winner: result.winner, scores: result.scores },
			});
		}
	}
}

async function run4pGame(session: GameSession): Promise<void> {
	const game = session.game4p!;
	const allAi = session.agents.every((a) => a !== null);
	const seatNames = getSeatNames(session.config);

	// Clear auto-generated signals for human seats (humans signal manually)
	const humanSeats = session.config.players
		.map((p, i) => (p.type === "human" ? i : -1))
		.filter((i) => i >= 0);
	for (const hs of humanSeats) {
		game.clearSignalsForSeat(hs as SeatId);
	}

	// Emit AI signal events visible to the human player
	if (humanSeats.length > 0 && game.state.currentRound) {
		const { getVisibleSignals } = await import("@trucobench/engine");
		for (const hs of humanSeats) {
			const { partnerSignals, interceptedSignals } = getVisibleSignals(
				game.state.currentRound.signals,
				hs,
			);
			for (const s of partnerSignals) {
				session.events.push({ type: "signal_received", data: { forSeat: hs, signal: s } });
			}
			for (const s of interceptedSignals) {
				session.events.push({ type: "signal_intercepted", data: { forSeat: hs, signal: s } });
			}
		}
	}

	let lastRoundNumber = game.state.roundNumber;

	while (game.state.winner === null) {
		const seat = game.getCurrentSeat();
		if (seat === null) break;
		session.snapshot = buildSnapshot("4p", session.config, null, game);
		session.events.push({ type: "state", data: session.snapshot });

		const agent = session.agents[seat];
		let action: Action;
		const humanTimeoutMs4p = session.config.turnTimeoutMs;
		const aiTimeoutMs4p = 120_000;
		if (agent === null) {
			const obs4p = game.observe(seat as SeatId);
			const obs2p = adapt4pObservation(obs4p);
			session.events.push({ type: "waiting_human", data: { seat, timeoutMs: humanTimeoutMs4p } });
			if (humanTimeoutMs4p > 0) {
				action = await Promise.race([
					new Promise<Action>((r) => {
						session.pendingHumanAction = r;
					}),
					delay(humanTimeoutMs4p).then(() => {
						session.pendingHumanAction = null;
						session.events.push({ type: "timeout", data: { seat } });
						return weakestLegalAction(obs2p);
					}),
				]);
			} else {
				action = await new Promise<Action>((r) => {
					session.pendingHumanAction = r;
				});
			}
			session.pendingHumanAction = null;
		} else {
			// Brief pause before AI acts
			await gameDelay(session, 300);
			const obs4p = game.observe(seat as SeatId);
			const obs2p = adapt4pObservation(obs4p);
			obs2p.chatHistory = session.chatMessages.slice(-10);
			try {
				action = await Promise.race([
					agent.getAction(obs2p),
					delay(aiTimeoutMs4p).then(() => {
						session.events.push({ type: "timeout", data: { seat } });
						return weakestLegalAction(obs2p);
					}),
				]);
			} catch (err) {
				const errMsg = err instanceof Error ? err.message : String(err);
				const seatName = getSeatNames(session.config)[seat] ?? `Seat ${seat}`;
				console.error(`[game] Agent error (${seatName}, model=${session.config.players[seat]?.model}):`, errMsg);
				session.events.push({
					type: "error",
					data: { seat, error: `${seatName}: ${errMsg}` },
				});
				return;
			}
		}

		const reasoning = agent instanceof LLMAgent ? agent.lastTrace?.reasoning : undefined;
		const latency4p = agent instanceof LLMAgent ? agent.lastTrace?.response?.latencyMs : undefined;
		const chat4p =
			agent instanceof LLMAgent
				? agent.lastTrace?.chat
				: (agent as HeuristicAgent | null)?.lastChat;
		console.log(`[game] Seat ${seat} (${seatNames[seat]}): ${action.type}${"cardIndex" in action ? ` card=${action.cardIndex}` : ""}${latency4p ? ` ${Math.round(latency4p)}ms` : ""}`);
		const result = game.step(seat as SeatId, action);
		session.events.push({ type: "action", data: { seat, action, reasoning } });
		if (chat4p) {
			const name = seatNames[seat] ?? `Seat ${seat}`;
			session.chatMessages.push({ seat, name, text: chat4p });
			session.events.push({ type: "chat", data: { seat, name, text: chat4p } });
		}
		session.snapshot = buildSnapshot("4p", session.config, null, game);

		// Pause after AI plays so the card animation is visible
		if (agent !== null) {
			if (action.type === ActionType.PLAY_CARD) await gameDelay(session, 700);
			else await gameDelay(session, 1000);
		}

		if (result.roundDone) {
			console.log(`[game] Round end — scores: ${result.scores[0]}-${result.scores[1]}`);
			session.events.push({ type: "trick_end", data: session.snapshot });
			await gameDelay(session, 1200);
			session.events.push({
				type: "round_end",
				data: { winner: result.roundWinner, scores: result.scores },
			});

			// New round started — handle signals for the new round
			if (!result.done && game.state.currentRound && game.state.roundNumber !== lastRoundNumber) {
				lastRoundNumber = game.state.roundNumber;
				for (const hs of humanSeats) {
					game.clearSignalsForSeat(hs as SeatId);
				}
				if (humanSeats.length > 0) {
					const { getVisibleSignals: getVis } = await import("@trucobench/engine");
					for (const hs of humanSeats) {
						const vis = getVis(game.state.currentRound.signals, hs);
						for (const s of vis.partnerSignals) {
							session.events.push({ type: "signal_received", data: { forSeat: hs, signal: s } });
						}
						for (const s of vis.interceptedSignals) {
							session.events.push({ type: "signal_intercepted", data: { forSeat: hs, signal: s } });
						}
					}
				}
			}

			if (allAi) {
				session.events.push({ type: "round_pause", data: { scores: result.scores } });
				await waitForContinue(session);
			} else {
				await gameDelay(session, 800);
			}
		}
		if (result.done) {
			console.log(`[game] Game over — winner: team ${result.winner}, final: ${result.scores[0]}-${result.scores[1]}`);
			session.events.push({
				type: "game_end",
				data: { winner: result.winner, scores: result.scores },
			});
		}
	}
}

/**
 * Adapt a 4-player observation to the 2-player Observation format
 * so existing LLM agents (which expect 2p format) can play.
 */
function adapt4pObservation(obs: FourPlayerObservation): Observation {
	return {
		hand: obs.hand,
		vira: obs.vira,
		score: obs.scores,
		opponentCardCount: obs.otherHandCounts
			.filter((_, i) => i !== obs.seat)
			.reduce((a, b) => a + b, 0),
		tricks: obs.tricks.map((t) => ({
			cards: [t.cards[t.firstSeat]!, t.cards[((t.firstSeat + 1) % 4) as SeatId]!] as [any, any],
			firstPlayer: (obs.team === 0 ? 0 : 1) as PlayerId,
			winner:
				t.winningTeam === null
					? null
					: t.winningTeam === obs.team
						? (obs.seat as unknown as PlayerId)
						: (((obs.seat + 1) % 2) as PlayerId),
		})),
		currentTrick: {
			firstPlayer: (teamOf(obs.currentTrick.firstSeat) === obs.team ? 0 : 1) as PlayerId,
			firstCard: obs.currentTrick.cards[obs.currentTrick.firstSeat],
		},
		escalation: obs.escalation,
		playerId: obs.seat as unknown as PlayerId,
		legalActions: obs.legalActions,
		roundNumber: obs.roundNumber,
		maoDeOnze: obs.maoDeOnze,
		maoDeferro: obs.maoDeferro,
		partnerSignals: obs.partnerSignals,
		interceptedSignals: obs.interceptedSignals,
	};
}

export function submitHumanAction(session: GameSession, action: Action): boolean {
	if (!session.pendingHumanAction) return false;
	session.pendingHumanAction(action);
	return true;
}

export function setGameSpeed(session: GameSession, speed: number): void {
	session.speedMultiplier = Math.max(0.25, Math.min(4, speed));
}

export function continueGame(session: GameSession): boolean {
	if (!session.pendingContinue) return false;
	session.pendingContinue();
	session.pendingContinue = null;
	return true;
}

/** Human player sends a signal to their partner. Returns true if the signal was processed. */
export function sendSignal(session: GameSession, seat: number, signalType: string): boolean {
	if (session.mode !== "4p" || !session.game4p) return false;
	const game = session.game4p;
	if (!game.state.currentRound) return false;

	const result = game.addSignal(seat as SeatId, signalType as SignalType);

	// Emit signal_sent to the sender (no info about whether partner received)
	session.events.push({ type: "signal_sent", data: { forSeat: seat } });

	// If partner received, emit signal_received for the partner
	if (result.partnerReceived) {
		const partner = (seat + 2) % 4;
		session.events.push({
			type: "signal_received",
			data: { forSeat: partner, signal: { type: signalType, fromSeat: seat } },
		});
	}

	// If opponents intercepted, emit signal_intercepted for each
	for (const oppSeat of result.interceptedBy) {
		session.events.push({
			type: "signal_intercepted",
			data: { forSeat: oppSeat, signal: { type: signalType, fromSeat: seat } },
		});
	}

	return true;
}

/** Human player sends a chat message visible to all players. */
export function sendChat(session: GameSession, seat: number, text: string): boolean {
	const names = getSeatNames(session.config);
	const name = names[seat] ?? `Seat ${seat}`;
	session.chatMessages.push({ seat, name, text });
	session.events.push({ type: "chat", data: { seat, name, text } });
	return true;
}

/** Deduplicate seat names: if two seats have the same label, append seat position */
const SEAT_POS = ["S", "W", "N", "E"];
export function getSeatNames(config: GameConfig): string[] {
	const raw = config.players.map((p) => {
		if (p.name) return p.name;
		if (p.type === "human") return "You";
		if (p.type === "random") return "Random";
		if (p.type === "heuristic") return "Heuristic";
		return p.model ?? "AI";
	});
	// Detect duplicates and append position
	const counts = new Map<string, number>();
	for (const n of raw) counts.set(n, (counts.get(n) ?? 0) + 1);
	return raw.map((n, i) => (counts.get(n)! > 1 ? `${n} (${SEAT_POS[i]})` : n));
}
