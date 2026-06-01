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
	type EscalationState,
	type GameState,
	type Observation,
	type PlayerId,
	type RoundState,
	type StepResult,
	type TrickResult,
	type TrucoTiming,
} from "./types.ts";

const WIN_SCORE = 12;
const MAO_DE_ONZE_SCORE = 11;

export class Game {
	state: GameState;
	private seedBase: number | undefined;
	private roundSeedCounter = 0;
	private trucoTiming: TrucoTiming;

	constructor(options?: { seed?: number; trucoTiming?: TrucoTiming }) {
		this.seedBase = options?.seed;
		this.trucoTiming = options?.trucoTiming ?? "after-first-trick";
		this.state = {
			scores: [0, 0],
			currentRound: null,
			roundNumber: 0,
			firstPlayer: 0,
			winner: null,
		};
	}

	reset(): GameState {
		this.state = {
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

		const p0at11 = this.state.scores[0] === MAO_DE_ONZE_SCORE;
		const p1at11 = this.state.scores[1] === MAO_DE_ONZE_SCORE;
		const maoDeferro = p0at11 && p1at11;

		let maoDeOnzeTeam: PlayerId | null = null;
		if (!maoDeferro) {
			if (p0at11) maoDeOnzeTeam = 0;
			else if (p1at11) maoDeOnzeTeam = 1;
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
				decided: maoDeferro ? true : maoDeOnzeTeam === null, // auto-decided if not mão de onze
			},
			maoDeferro,
		};
		this.state.roundNumber++;
	}

	observe(playerId: PlayerId): Observation {
		const round = this.state.currentRound;
		if (!round) throw new Error("No active round");

		return {
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

		// Mão de onze decision phase: the team at 11 must accept or fold
		if (!round.maoDeOnze.decided && round.maoDeOnze.team === playerId) {
			return [{ type: ActionType.ACCEPT }, { type: ActionType.FOLD }];
		}
		// If it's mão de onze and the OTHER player is deciding, this player has no actions
		if (!round.maoDeOnze.decided && round.maoDeOnze.team !== playerId) {
			return [];
		}

		// If there's a pending escalation request and this player needs to respond
		if (round.escalation.pendingRequest !== null && round.escalation.requestedBy !== playerId) {
			const actions: Action[] = [{ type: ActionType.ACCEPT }, { type: ActionType.FOLD }];
			if (canRaise(round.escalation, playerId)) {
				actions.push({ type: ActionType.RAISE });
			}
			return actions;
		}

		// If there's a pending escalation request by this player, they can't do anything
		// (waiting for opponent to respond)
		if (round.escalation.pendingRequest !== null && round.escalation.requestedBy === playerId) {
			return [];
		}

		// Turn restoration: if an escalation was just resolved and the initiator hasn't played yet
		if (round.escalation.initiatedBySeat !== null && round.escalation.pendingRequest === null) {
			if (round.escalation.initiatedBySeat !== playerId) return [];
			// The initiator gets to play their card
		} else {
			// Normal play: it must be this player's turn to play a card
			const isFirstCardPhase = round.currentTrick.firstCard === null;
			const isMyTurn = isFirstCardPhase
				? round.currentTrick.firstPlayer === playerId
				: round.currentTrick.firstPlayer !== playerId;
			if (!isMyTurn) return [];
		}

		// Card play actions
		const actions: Action[] = round.hands[playerId].map(
			(_, i): Action => ({
				type: ActionType.PLAY_CARD,
				cardIndex: i,
			}),
		);

		// TRUCO timing guard
		let escalationAllowed = true;
		if (this.trucoTiming === "after-first-trick") {
			escalationAllowed = round.tricks.length > 0;
		} else if (this.trucoTiming === "after-first-card") {
			escalationAllowed = round.currentTrick.firstCard !== null || round.tricks.length > 0;
		}

		// Can escalate? (not in mão de ferro — stakes are fixed at 3)
		if (escalationAllowed && !round.maoDeferro && canEscalate(round.escalation, playerId)) {
			actions.push({ type: ActionType.TRUCO });
		}

		return actions;
	}

	step(playerId: PlayerId, action: Action): StepResult {
		const round = this.state.currentRound;
		if (!round) throw new Error("No active round");
		if (this.state.winner !== null) throw new Error("Game is already over");

		// Validate action is legal
		const legal = this.getLegalActions(playerId);
		if (!this.isLegalAction(action, legal)) {
			throw new Error(
				`Illegal action: ${JSON.stringify(action)} for player ${playerId}. Legal: ${JSON.stringify(legal)}`,
			);
		}

		// Handle mão de onze decision
		if (!round.maoDeOnze.decided && round.maoDeOnze.team === playerId) {
			return this.handleMaoDeOnze(playerId, action);
		}

		// Handle escalation actions
		if (
			action.type === ActionType.TRUCO ||
			action.type === ActionType.ACCEPT ||
			action.type === ActionType.RAISE ||
			action.type === ActionType.FOLD
		) {
			return this.handleEscalation(playerId, action);
		}

		// Handle card play
		if (action.type === ActionType.PLAY_CARD) {
			return this.handlePlayCard(playerId, action);
		}

		throw new Error(`Unknown action type: ${(action as Action).type}`);
	}

	private handleMaoDeOnze(playerId: PlayerId, action: Action): StepResult {
		const round = this.state.currentRound!;

		if (action.type === ActionType.FOLD) {
			// Player folds mão de onze: opponent gets 1 point
			const opponent = otherPlayer(playerId);
			this.state.scores[opponent] += 1;
			return this.finishRound(opponent);
		}

		// Accept: play the round (stakes are 3 points for mão de onze)
		round.maoDeOnze.decided = true;
		round.escalation.level = "TRUCO"; // 3 points
		// In mão de onze, the team at 11 cannot escalate, so set lastEscalatedBy to them
		round.escalation.lastEscalatedBy = playerId;

		return this.makeStepResult();
	}

	private handleEscalation(playerId: PlayerId, action: Action): StepResult {
		const round = this.state.currentRound!;
		const result = processEscalation(round.escalation, playerId, action);

		if (result.folded) {
			// The player who folded loses; opponent gets the fold points
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

		// Remove card from hand
		round.hands[playerId] = hand.filter((_, i) => i !== action.cardIndex);

		// Clear turn restoration after the initiator plays
		if (round.escalation.initiatedBySeat === playerId) {
			round.escalation.initiatedBySeat = null;
		}

		if (round.currentTrick.firstCard === null) {
			// First card of the trick
			round.currentTrick.firstCard = card;
			return this.makeStepResult();
		}

		// Second card — resolve the trick
		const trick = resolveTrick(
			round.currentTrick.firstPlayer,
			round.currentTrick.firstCard,
			card,
			round.vira,
		);
		round.tricks.push(trick);

		// Check if round can be decided early
		const earlyWinner = canDecideEarly(round.tricks);
		if (earlyWinner !== null) {
			const points = currentPoints(round.escalation);
			this.state.scores[earlyWinner] += points;
			return this.finishRound(earlyWinner);
		}

		// If 3 tricks done, resolve the round
		if (round.tricks.length === 3) {
			const roundWinner = resolveRound(round.tricks);
			if (roundWinner !== null) {
				const points = currentPoints(round.escalation);
				this.state.scores[roundWinner] += points;
				return this.finishRound(roundWinner);
			}
			// All draws — first player wins (handled by resolveRound, but shouldn't reach here)
			const firstPlayer = round.tricks[0]!.firstPlayer;
			const points = currentPoints(round.escalation);
			this.state.scores[firstPlayer] += points;
			return this.finishRound(firstPlayer);
		}

		// Set up next trick — winner of this trick plays first (or same first player if draw)
		const nextFirstPlayer = trick.winner ?? round.currentTrick.firstPlayer;
		round.currentTrick = {
			firstPlayer: nextFirstPlayer,
			firstCard: null,
		};

		return this.makeStepResult();
	}

	private finishRound(roundWinner: PlayerId): StepResult {
		// Cap scores at WIN_SCORE
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
			// Start next round — loser of last round plays first (alternating can also work;
			// in standard Truco Paulista the deal rotates, and the player after the dealer starts)
			// For simplicity: alternate first player each round
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

	/**
	 * Get the player whose turn it is to act, or null if game is over.
	 */
	getCurrentPlayer(): PlayerId | null {
		if (this.state.winner !== null) return null;
		const round = this.state.currentRound;
		if (!round) return null;

		// Mão de onze decision
		if (!round.maoDeOnze.decided) {
			return round.maoDeOnze.team;
		}

		// Pending escalation — opponent of requester must respond
		if (round.escalation.pendingRequest !== null) {
			return otherPlayer(round.escalation.requestedBy!);
		}

		// Card play
		if (round.currentTrick.firstCard === null) {
			return round.currentTrick.firstPlayer;
		}
		return otherPlayer(round.currentTrick.firstPlayer);
	}
}
