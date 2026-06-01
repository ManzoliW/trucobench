/**
 * QA driver — plays TrucoBench games against the live /api/game endpoints as a human.
 * Reports turn-advancement timing, state invariants, and any stalls.
 *
 * Usage: bun run scripts/qa-drive.ts <scenario>
 *   scenarios: heuristic | ai1 | ai3
 */

const BASE = "http://localhost:3000";
const SEED = 42;

type PlayerConfig =
	| { type: "human" }
	| { type: "heuristic" }
	| { type: "random" }
	| { type: "llm"; model: string };

interface GameCfg {
	seed: number;
	players: PlayerConfig[];
	prompt: string;
	language: string;
	temperature: number;
	providerMode: string;
	turnTimeoutMs: number;
	trucoTiming: string;
}

const SCENARIOS: Record<string, { label: string; players: PlayerConfig[] }> = {
	heuristic: {
		label: "Human vs Heuristic (2P)",
		players: [{ type: "human" }, { type: "heuristic" }],
	},
	ai1: {
		label: "Human vs 1 AI — claude-haiku-4.5 (2P, Vercel Gateway)",
		players: [{ type: "human" }, { type: "llm", model: "claude-haiku-4.5" }],
	},
	ai3: {
		label: "Human + 3 AIs (4P, Vercel Gateway)",
		players: [
			{ type: "human" },
			{ type: "llm", model: "claude-haiku-4.5" },
			{ type: "llm", model: "gpt-4o-mini" },
			{ type: "llm", model: "gemini-2.5-flash" },
		],
	},
};

interface Snap {
	mode: "2p" | "4p";
	scores: [number, number];
	roundNumber: number;
	currentSeat: number | null;
	winner: number | null;
	observations: any[];
}

async function startGame(cfg: GameCfg): Promise<string> {
	const res = await fetch(`${BASE}/api/game`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(cfg),
	});
	if (!res.ok) throw new Error(`start ${res.status}: ${await res.text()}`);
	return (await res.json()).id;
}
async function getSnap(id: string): Promise<Snap> {
	const r = await fetch(`${BASE}/api/game/${id}`);
	if (!r.ok) throw new Error(`snap ${r.status}`);
	return r.json();
}
async function submit(id: string, action: any): Promise<boolean> {
	const r = await fetch(`${BASE}/api/game/${id}/action`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(action),
	});
	return r.ok;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function playScenario(key: string): Promise<void> {
	const sc = SCENARIOS[key]!;
	console.log(`\n=== ${sc.label} ===`);
	const vgKey = process.env.VERCEL_AI_GATEWAY_API_KEY ?? "";
	const cfg: GameCfg & { apiKeys?: Record<string, string> } = {
		seed: SEED,
		players: sc.players,
		prompt: "economy",
		language: "en",
		temperature: 0.7,
		providerMode: "vercel-gateway",
		turnTimeoutMs: 0,
		trucoTiming: "after-first-trick",
		apiKeys: vgKey ? { "vercel-gateway": vgKey } : undefined,
	};
	const t0 = Date.now();
	const id = await startGame(cfg);
	console.log(`game id=${id} seed=${SEED}`);

	// Tap SSE stream for error/timeout events
	(async () => {
		try {
			const res = await fetch(`${BASE}/api/game/${id}/stream`);
			const reader = res.body?.getReader();
			if (!reader) return;
			const dec = new TextDecoder();
			let buf = "";
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buf += dec.decode(value, { stream: true });
				const lines = buf.split("\n");
				buf = lines.pop() ?? "";
				for (const ln of lines) {
					if (!ln.startsWith("data:")) continue;
					try {
						const ev = JSON.parse(ln.slice(5).trim());
						if (ev.type === "error" || ev.type === "timeout") {
							console.log(`  !! ${ev.type}: ${JSON.stringify(ev.data)}`);
						}
					} catch {}
				}
			}
		} catch {}
	})();

	const humanSeat = sc.players.findIndex((p) => p.type === "human");
	let turns = 0;
	let humanTurns = 0;
	let maxStallMs = 0;
	let lastCurrentSeat: number | null | undefined;
	let lastChangeAt = Date.now();
	const seatVisits: Record<string, number> = {};
	const invariantFailures: string[] = [];

	// Overall wall-clock cap
	const capMs = key === "heuristic" ? 300_000 : key === "ai3" ? 1_800_000 : 900_000;
	while (Date.now() - t0 < capMs) {
		const snap = await getSnap(id);
		if (snap.winner !== null) {
			console.log(
				`WINNER=team${snap.winner}  final=${snap.scores[0]}-${snap.scores[1]}  rounds=${snap.roundNumber}  turns=${turns}  humanTurns=${humanTurns}`,
			);
			console.log(`seat visits: ${JSON.stringify(seatVisits)}`);
			console.log(`elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s  maxStall=${maxStallMs}ms`);
			if (invariantFailures.length) {
				console.log(`INVARIANT FAILURES:\n  ${invariantFailures.join("\n  ")}`);
			} else {
				console.log(`invariants: OK`);
			}
			return;
		}

		// Track seat visits & stall time
		if (snap.currentSeat !== lastCurrentSeat) {
			const now = Date.now();
			maxStallMs = Math.max(maxStallMs, now - lastChangeAt);
			lastChangeAt = now;
			lastCurrentSeat = snap.currentSeat;
			const k = String(snap.currentSeat);
			seatVisits[k] = (seatVisits[k] ?? 0) + 1;
			turns++;
		}

		// Invariants
		if (snap.currentSeat !== null) {
			if (snap.mode === "2p" && (snap.currentSeat < 0 || snap.currentSeat > 1)) {
				invariantFailures.push(`2p currentSeat out of range: ${snap.currentSeat}`);
			}
			if (snap.mode === "4p" && (snap.currentSeat < 0 || snap.currentSeat > 3)) {
				invariantFailures.push(`4p currentSeat out of range: ${snap.currentSeat}`);
			}
		}
		if (snap.scores[0] > 12 || snap.scores[1] > 12) {
			invariantFailures.push(`score exceeds 12: ${snap.scores[0]}-${snap.scores[1]}`);
		}

		// If it's human's turn, OR human has legal actions during 4P escalation (currentSeat=null)
		const obs = snap.observations[humanSeat];
		const humanHasActions = obs?.legalActions?.length > 0;
		if ((snap.currentSeat === humanSeat || snap.currentSeat === null) && humanHasActions) {
			{
				// Strategy: prefer PLAY_CARD lowest index (usually weakest), ignore TRUCO unless only option,
				// ACCEPT over FOLD on escalation
				const legal = obs.legalActions;
				const play = legal.find((a: any) => a.type === "PLAY_CARD");
				const accept = legal.find((a: any) => a.type === "ACCEPT");
				const action = play ?? accept ?? legal[0];
				const ok = await submit(id, action);
				if (!ok) {
					await sleep(200);
					continue;
				}
				humanTurns++;
				console.log(
					`  turn ${humanTurns}: ${action.type}${"cardIndex" in action ? ` card=${action.cardIndex}` : ""}  score=${snap.scores[0]}-${snap.scores[1]} r${snap.roundNumber}`,
				);
				await sleep(300);
				continue;
			}
		}

		await sleep(150);
	}
	console.log(`TIMEOUT after ${((Date.now() - t0) / 1000).toFixed(1)}s — game did not finish`);
	console.log(`scores so far: ${lastCurrentSeat}  visits=${JSON.stringify(seatVisits)}`);
	if (invariantFailures.length) {
		console.log(`INVARIANT FAILURES:\n  ${invariantFailures.join("\n  ")}`);
	}
}

const scenario = process.argv[2] ?? "heuristic";
await playScenario(scenario);
