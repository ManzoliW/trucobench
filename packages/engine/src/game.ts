import { cardsEqual, deal, shuffleDeck } from "./deck.ts";
import {
	canEscalate,
	canRaise,
	createEscalationState,
	currentPoints,
	processEscalation,
} from "./escalation.ts";
import { canDecideEarly, otherPlayer, resolveRound, resolveTrick } from "./round.ts";
import {
	type Action,
	ActionType,
	ESCALATION_POINTS,
	ESCALATION_POINTS_MINEIRO,
	type EscalationState,
	type GameState,
	type Observation,
	type PlayerId,
	type RoundState,
	type StepResult,
	type TrickResult,
	type TrucoTiming,
	type TrucoVariant,
	} from "./types.ts";
const WIN_SCORE = 12;
const MAO_DE_ONZE_SCORE = 11;

export class Game {
	state: GameState;
	private seedBase: number | undefined;
	private roundSeedCounter = 0;
	private trucoTiming: TrucoTiming;

	constructor(options?: { seed?: number; trucoTiming?: TrucoTiming; variant?: TrucoVariant }) {
		this.seedBase = options?.seed;
		this.trucoTiming = options?.trucoTiming ?? "after-first-trick";
		this.state = {
			variant: options?.variant ?? "PAULISTA",
			scores: [0, 0],
			currentRound: null,
			roundNumber: 0,
			firstPlayer: 0,
			winner: null,
		};
	}

	reset(): GameState {
		this.state = {
			variant: this.state.variant,
			scores: [0, 0],
			currentRound: null,
			roundNumber: 0,
			firstPlayer: 0,
			winner: null,
		};
		this.roundSeedCounter = 0;
		this.startNewRound();
		return this.state;
	}

	private nextRoundSeed(): number | undefined {
		if (this.seedBase === undefined) return undefined;
		return this.seedBase + this.roundSeedCounter++;
	}

	startNewRound(): void {
		const deck = shuffleDeck(this.nextRoundSeed());
		const { hands, vira } = deal(deck);

		const threshold = this.state.variant === "PAULISTA" ? 11 : 10;
		const p0atThreshold = this.state.scores[0] === threshold;
		const p1atThreshold = this.state.scores[1] === threshold;
		const maoDeferro = p0atThreshold && p1atThreshold;

		let maoDeOnzeTeam: PlayerId | null = null;
		if (!maoDeferro) {
			if (p0atThreshold) maoDeOnzeTeam = 0;
			else if (p1atThreshold) maoDeOnzeTeam = 1;
		}

		this.state.currentRound = {
			hands,
			vira,
			tricks: [],
			currentTrick: {
				firstPlayer: this.state.firstPlayer,
				firstCard: null,
			},
			escalation: createEscalationState(),
			maoDeOnze: {
				team: maoDeOnzeTeam,
				decided: maoDeferro ? true : maoDeOnzeTeam === null,
			},
			maoDeferro,
		};
		this.state.roundNumber++;
	}

	observe(playerId: PlayerId): Observation {
		const round = this.state.currentRound;
		if (!round) throw new Error("No active round");

		return {
			variant: this.state.variant,
			hand: [...round.hands[playerId]],
			vira: round.vira,
			score: [...this.state.scores],
			opponentCardCount: round.hands[otherPlayer(playerId)].length,
			tricks: round.tricks.map((t) => ({ ...t })),
			currentTrick: { ...round.currentTrick },
			escalation: { ...round.escalation },
			playerId,
			legalActions: this.getLegalActions(playerId),
			roundNumber: this.state.roundNumber,
			maoDeOnze: !round.maoDeferro && round.maoDeOnze.team === playerId && !round.maoDeOnze.decided,
			maoDeferro: round.maoDeferro,
		};
	}

	getLegalActions(playerId: PlayerId): Action[] {
		const round = this.state.currentRound;
		if (!round) return [];
		if (this.state.winner !== null) return [];

		// Mão de onze/dez decision phase
		if (!round.maoDeOnze.decided && round.maoDeOnze.team === playerId) {
			return [{ type: ActionType.ACCEPT }, { type: ActionType.FOLD }];
		}
		if (!round.maoDeOnze.decided && round.maoDeOnze.team !== playerId) {
			return [];
		}

		if (round.escalation.pendingRequest !== null && round.escalation.requestedBy !== playerId) {
			const actions: Action[] = [{ type: ActionType.ACCEPT }, { type: ActionType.FOLD }];
			if (canRaise(round.escalation, playerId)) {
				actions.push({ type: ActionType.RAISE });
			}
			return actions;
		}

		if (round.escalation.pendingRequest !== null && round.escalation.requestedBy === playerId) {
			return [];
		}

		if (round.escalation.initiatedBySeat !== null && round.escalation.pendingRequest === null) {
			if (round.escalation.initiatedBySeat !== playerId) return [];
		} else {
			const isFirstCardPhase = round.currentTrick.firstCard === null;
			const isMyTurn = isFirstCardPhase
				? round.currentTrick.firstPlayer === playerId
				: round.currentTrick.firstPlayer !== playerId;
			if (!isMyTurn) return [];
		}

		const actions: Action[] = round.hands[playerId].map(
			(_, i): Action => ({
				type: ActionType.PLAY_CARD,
				cardIndex: i,
			}),
		);

		let escalationAllowed = true;
		if (this.trucoTiming === "after-first-trick") {
			escalationAllowed = round.tricks.length > 0;
		} else if (this.trucoTiming === "after-first-card") {
			escalationAllowed = round.currentTrick.firstCard !== null || round.tricks.length > 0;
		}

		if (escalationAllowed && !round.maoDeferro && canEscalate(round.escalation, playerId)) {
			actions.push({ type: ActionType.TRUCO });
		}

		return actions;
	}

	step(playerId: PlayerId, action: Action): StepResult {
		const round = this.state.currentRound;
		if (!round) throw new Error("No active round");
		if (this.state.winner !== null) throw new Error("Game is already over");

		const legal = this.getLegalActions(playerId);
		if (!this.isLegalAction(action, legal)) {
			throw new Error(
				`Illegal action: ${JSON.stringify(action)} for player ${playerId}. Legal: ${JSON.stringify(legal)}`,
			);
		}

		if (!round.maoDeOnze.decided && round.maoDeOnze.team === playerId) {
			return this.handleMaoDeOnze(playerId, action);
		}

		if (
			action.type === ActionType.TRUCO ||
			action.type === ActionType.ACCEPT ||
			action.type === ActionType.RAISE ||
			action.type === ActionType.FOLD
		) {
			return this.handleEscalation(playerId, action);
		}

		if (action.type === ActionType.PLAY_CARD) {
			return this.handlePlayCard(playerId, action);
		}

		throw new Error(`Unknown action type: ${(action as Action).type}`);
	}

	private handleMaoDeOnze(playerId: PlayerId, action: Action): StepResult {
		const round = this.state.currentRound!;

		if (action.type === ActionType.FOLD) {
			const opponent = otherPlayer(playerId);
			const foldPoints = this.state.variant === "PAULISTA" ? 1 : 2;
			this.state.scores[opponent] += foldPoints;
			return this.finishRound(opponent);
		}

		round.maoDeOnze.decided = true;
		round.escalation.level = "TRUCO"; // Paulista 3, Mineiro 4
		round.escalation.lastEscalatedBy = playerId;

		return this.makeStepResult();
	}

	private handleEscalation(playerId: PlayerId, action: Action): StepResult {
		const round = this.state.currentRound!;
		const scoring =
			this.state.variant === "PAULISTA" ? ESCALATION_POINTS : ESCALATION_POINTS_MINEIRO;
		const result = processEscalation(round.escalation, playerId, action, scoring);

		if (result.folded) {
			const opponent = otherPlayer(playerId);
			this.state.scores[opponent] += result.foldPoints;
			return this.finishRound(opponent);
		}

		round.escalation = result.state;
		return this.makeStepResult();
	}

	private handlePlayCard(playerId: PlayerId, action: Action): StepResult {
		if (action.type !== ActionType.PLAY_CARD) throw new Error("Expected PLAY_CARD");

		const round = this.state.currentRound!;
		const hand = round.hands[playerId];
		const card = hand[action.cardIndex];
		if (!card) throw new Error(`Invalid card index: ${action.cardIndex}`);

		round.hands[playerId] = hand.filter((_, i) => i !== action.cardIndex);

		if (round.escalation.initiatedBySeat === playerId) {
			round.escalation.initiatedBySeat = null;
		}

		if (round.currentTrick.firstCard === null) {
			round.currentTrick.firstCard = card;
			return this.makeStepResult();
		}

		const trick = resolveTrick(
			round.currentTrick.firstPlayer,
			round.currentTrick.firstCard,
			card,
			round.vira,
			this.state.variant,
		);
		round.tricks.push(trick);

		const earlyWinner = canDecideEarly(round.tricks);
		if (earlyWinner !== null) {
			const points = this.getCurrentPoints(round.escalation);
			this.state.scores[earlyWinner] += points;
			return this.finishRound(earlyWinner);
		}

		if (round.tricks.length === 3) {
			const roundWinner = resolveRound(round.tricks);
			const points = this.getCurrentPoints(round.escalation);
			if (roundWinner !== null) {
				this.state.scores[roundWinner] += points;
				return this.finishRound(roundWinner);
			}
			const firstPlayer = round.tricks[0]!.firstPlayer;
			this.state.scores[firstPlayer] += points;
			return this.finishRound(firstPlayer);
		}

		const nextFirstPlayer = trick.winner ?? round.currentTrick.firstPlayer;
		round.currentTrick = {
			firstPlayer: nextFirstPlayer,
			firstCard: null,
		};

		return this.makeStepResult();
	}

	private getCurrentPoints(esc: EscalationState): number {
		const scoring =
			this.state.variant === "PAULISTA" ? ESCALATION_POINTS : ESCALATION_POINTS_MINEIRO;
		return scoring[esc.level];
	}

	private finishRound(roundWinner: PlayerId): StepResult {
		if (this.state.scores[0]! >= WIN_SCORE) {
			this.state.scores[0] = WIN_SCORE;
			this.state.winner = 0;
		}
		if (this.state.scores[1]! >= WIN_SCORE) {
			this.state.scores[1] = WIN_SCORE;
			this.state.winner = 1;
		}

		const done = this.state.winner !== null;

		if (!done) {
			this.state.firstPlayer = otherPlayer(this.state.firstPlayer);
			this.startNewRound();
		} else {
			this.state.currentRound = null;
		}

		return {
			done,
			roundDone: true,
			winner: this.state.winner,
			roundWinner,
			scores: [...this.state.scores],
		};
	}

	private makeStepResult(): StepResult {
		return {
			done: false,
			roundDone: false,
			winner: null,
			roundWinner: null,
			scores: [...this.state.scores],
		};
	}

	private isLegalAction(action: Action, legal: Action[]): boolean {
		return legal.some((a) => {
			if (a.type !== action.type) return false;
			if (a.type === ActionType.PLAY_CARD && action.type === ActionType.PLAY_CARD) {
				return a.cardIndex === action.cardIndex;
			}
			return true;
		});
	}

	getCurrentPlayer(): PlayerId | null {
		if (this.state.winner !== null) return null;
		const round = this.state.currentRound;
		if (!round) return null;

		if (!round.maoDeOnze.decided) {
			return round.maoDeOnze.team;
		}

		if (round.escalation.pendingRequest !== null) {
			return otherPlayer(round.escalation.requestedBy!);
		}

		if (round.currentTrick.firstCard === null) {
			return round.currentTrick.firstPlayer;
		}
		return otherPlayer(round.currentTrick.firstPlayer);
	}
}
