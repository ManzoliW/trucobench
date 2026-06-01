import type { Action } from "@trucobench/engine";
import type { GameSnapshot } from "./game-manager";

interface LogEntry {
	seat: number;
	action: Action;
	reasoning?: string;
}

export interface GameStats {
	rounds: number;
	duration: number;
	trucosCalled: number;
	trucosAccepted: number;
	folds: number;
	cardsPlayed: number;
}

export function computeStats(log: LogEntry[], snap: GameSnapshot, startTime: number): GameStats {
	let trucosCalled = 0;
	let trucosAccepted = 0;
	let folds = 0;
	let cardsPlayed = 0;

	for (const entry of log) {
		switch (entry.action.type) {
			case "TRUCO":
				trucosCalled++;
				break;
			case "ACCEPT":
				trucosAccepted++;
				break;
			case "FOLD":
				folds++;
				break;
			case "PLAY_CARD":
				cardsPlayed++;
				break;
		}
	}

	return {
		rounds: snap.roundNumber,
		duration: Date.now() - startTime,
		trucosCalled,
		trucosAccepted,
		folds,
		cardsPlayed,
	};
}

export function formatDuration(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
