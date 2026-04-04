import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GameRecord, MatchupResult, TournamentResult } from "./types.ts";

export interface CheckpointData {
	completedGames: Map<string, GameRecord[]>; // key: "agent0 vs agent1"
	startTime: string;
}

function matchupKey(agent0: string, agent1: string): string {
	return `${agent0} vs ${agent1}`;
}

export class Checkpoint {
	private dir: string;
	private indexPath: string;
	private data: {
		completedGames: Record<string, GameRecord[]>;
		startTime: string;
	};

	constructor(dir: string) {
		this.dir = dir;
		this.indexPath = join(dir, "checkpoint.json");

		if (existsSync(this.indexPath)) {
			const raw = readFileSync(this.indexPath, "utf-8");
			this.data = JSON.parse(raw);
			console.log(`Resuming from checkpoint: ${this.completedGameCount()} games already done`);
		} else {
			mkdirSync(dir, { recursive: true });
			this.data = {
				completedGames: {},
				startTime: new Date().toISOString(),
			};
		}
	}

	getCompletedGames(agent0: string, agent1: string): GameRecord[] {
		return this.data.completedGames[matchupKey(agent0, agent1)] ?? [];
	}

	saveGame(agent0: string, agent1: string, game: GameRecord): void {
		const key = matchupKey(agent0, agent1);
		if (!this.data.completedGames[key]) {
			this.data.completedGames[key] = [];
		}
		this.data.completedGames[key].push(game);
		this.flush();
	}

	private flush(): void {
		writeFileSync(this.indexPath, JSON.stringify(this.data, null, 2));
	}

	completedGameCount(): number {
		let count = 0;
		for (const games of Object.values(this.data.completedGames)) {
			count += games.length;
		}
		return count;
	}

	get startTime(): string {
		return this.data.startTime;
	}
}

export function saveTournamentResult(dir: string, result: TournamentResult): string {
	mkdirSync(dir, { recursive: true });
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const filename = `tournament-${timestamp}.json`;
	const filepath = join(dir, filename);
	writeFileSync(filepath, JSON.stringify(result, null, 2));
	return filepath;
}
