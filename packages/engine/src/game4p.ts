import { cardsEqual, compareCards, deal, shuffleDeck } from "./deck.ts";
import {
	canEscalate,
	canRaise,
	createEscalationState,
	currentPoints,
	processEscalation,
} from "./escalation.ts";
import { otherPlayer } from "./round.ts";
import {
	DEFAULT_SIGNAL_CONFIG,
	type RoundSignals,
	type Signal,
	type SignalConfig,
	type SignalResult,
	type SignalType,
	getVisibleSignals,
	processRoundSignals,
	processSingleSignal,
} from "./signals.ts";
import {
	type Action,
	ActionType,
	type Card,
	type EscalationState,
	type PlayerId,
	type StepResult,
	type TrickResult,
} from "./types.ts";

/**
 * 4-player Truco Paulista.
 * Teams: [0,2] vs [1,3]. Seating: S(0) - W(1) - N(2) - E(3).
 * Partners sit across from each other.
 */

export type SeatId = 0 | 1 | 2 | 3;

export function teamOf(seat: SeatId): 0 | 1 {
	return (seat % 2) as 0 | 1;
}

export function partnerOf(seat: SeatId): SeatId {
	return ((seat + 2) % 4) as SeatId;
}

export function nextSeat(seat: SeatId): SeatId {
	return ((seat + 1) % 4) as SeatId;
}

const WIN_SCORE = 12;
const MAO_DE_ONZE = 11;

export interface FourPlayerTrickResult {
	cards: [Card | null, Card | null, Card | null, Card | null];
	firstSeat: SeatId;
	winner: SeatId | null; // seat that played highest card
	winningTeam: 0 | 1 | null;
}

export interface FourPlayerRoundState {
	hands: [Card[], Card[], Card[], Card[]];
	vira: Card;
	tricks: FourPlayerTrickResult[];
	currentTrick: {
		firstSeat: SeatId;
		cards: [Card | null, Card | null, Card | null, Card | null];
		cardsPlayed: number;
	};
	escalation: EscalationState;
	maoDeOnze: { team: 0 | 1 | null; decided: boolean };
	maoDeferro: boolean;
	/** Sinais — partner signals processed at the start of the round */
	signals: RoundSignals;
}

export interface FourPlayerGameState {
	scores: [number, number]; // team scores
	currentRound: FourPlayerRoundState | null;
	roundNumber: number;
	dealerSeat: SeatId;
	winner: 0 | 1 | null; // winning team
}

export interface FourPlayerObservation {
	seat: SeatId;
	team: 0 | 1;
	hand: Card[];
	vira: Card;
	scores: [number, number];
	otherHandCounts: [number, number, number, number]; // cards remaining per seat
	tricks: FourPlayerTrickResult[];
	currentTrick: {
		firstSeat: SeatId;
		cards: [Card | null, Card | null, Card | null, Card | null];
		cardsPlayed: number;
	};
	escalation: EscalationState;
	legalActions: Action[];
	roundNumber: number;
	maoDeOnze: boolean;
	maoDeferro: boolean;
	/** Signals from partner that you successfully received */
	partnerSignals: Signal[];
	/** Opponent signals that you intercepted */
	interceptedSignals: Signal[];
}

export class FourPlayerGame {
	state: FourPlayerGameState;
	readonly signalConfig: SignalConfig;
	private seedBase: number | undefined;
	private seedCounter = 0;

	constructor(seed?: number, signalConfig?: Partial<SignalConfig>) {
		this.seedBase = seed;
		this.signalConfig = { ...DEFAULT_SIGNAL_CONFIG, ...signalConfig };
		this.state = {
			scores: [0, 0],
			currentRound: null,
			roundNumber: 0,
			dealerSeat: 0,
			winner: null,
		};
	}

	reset(): FourPlayerGameState {
		this.state = {
			scores: [0, 0],
			currentRound: null,
			roundNumber: 0,
			dealerSeat: 0,
			winner: null,
		};
		this.seedCounter = 0;
		this.startNewRound();
		return this.state;
	}

	private nextSeed(): number | undefined {
		if (this.seedBase === undefined) return undefined;
		return this.seedBase + this.seedCounter++;
	}

	startNewRound(): void {
		const deck = shuffleDeck(this.nextSeed());
		// Deal 3 cards to each of 4 players (12 cards) + 1 vira
		const hands: [Card[], Card[], Card[], Card[]] = [
			deck.slice(0, 3),
			deck.slice(3, 6),
			deck.slice(6, 9),
			deck.slice(9, 12),
		];
		const vira = deck[12]!;

		const t0at11 = this.state.scores[0] === MAO_DE_ONZE;
		const t1at11 = this.state.scores[1] === MAO_DE_ONZE;
		const maoDeferro = t0at11 && t1at11;
		let maoDeOnzeTeam: 0 | 1 | null = null;
		if (!maoDeferro) {
			if (t0at11) maoDeOnzeTeam = 0;
			else if (t1at11) maoDeOnzeTeam = 1;
		}

		const firstSeat = nextSeat(this.state.dealerSeat); // player after dealer starts

		// Process signals — each player signals their best cards to partner
		const signals = processRoundSignals(
			hands,
			vira,
			this.signalConfig,
			this.nextSeed() ?? Date.now(),
		);

		this.state.currentRound = {
			hands,
			vira,
			tricks: [],
			currentTrick: {
				firstSeat,
				cards: [null, null, null, null],
				cardsPlayed: 0,
			},
			escalation: createEscalationState(),
			maoDeOnze: {
				team: maoDeOnzeTeam,
				decided: maoDeferro || maoDeOnzeTeam === null,
			},
			maoDeferro,
			signals,
		};
		this.state.roundNumber++;
	}

	/** Remove auto-generated signals for a specific seat (call after round start for human players). */
	clearSignalsForSeat(seat: SeatId): void {
		if (!this.state.currentRound) return;
		this.state.currentRound.signals.results = this.state.currentRound.signals.results.filter(
			(r) => r.signal.fromSeat !== seat,
		);
	}

	/** Manually send a signal (for human players). Returns the result, but the sender should NOT see whether the partner received it. */
	addSignal(seat: SeatId, signalType: SignalType): SignalResult {
		const round = this.state.currentRound;
		if (!round) throw new Error("No active round");
		const signal: Signal = { type: signalType, fromSeat: seat };
		const result = processSingleSignal(signal, this.signalConfig, this.nextSeed() ?? Date.now());
		round.signals.results.push(result);
		return result;
	}

	getCurrentSeat(): SeatId | null {
		if (this.state.winner !== null) return null;
		const round = this.state.currentRound;
		if (!round) return null;

		// Mão de onze: first seat of the team at 11 decides
		if (!round.maoDeOnze.decided && round.maoDeOnze.team !== null) {
			// First player of that team (seat 0 or 1) decides
			return round.maoDeOnze.team === 0 ? 0 : 1;
		}

		// Pending escalation: opponent team must respond — pick next player from opponent team
		if (round.escalation.pendingRequest !== null && round.escalation.requestedBy !== null) {
			const requestingTeam = teamOf(round.escalation.requestedBy as SeatId);
			const respondingTeam = requestingTeam === 0 ? 1 : 0;
			// First seat of responding team that's "next" in play order
			return respondingTeam === 0 ? 0 : 1;
		}

		// Card play: who's next in the trick?
		const trick = round.currentTrick;
		let seat = trick.firstSeat;
		for (let i = 0; i < trick.cardsPlayed; i++) {
			seat = nextSeat(seat);
		}
		return seat;
	}

	observe(seat: SeatId): FourPlayerObservation {
		const round = this.state.currentRound;
		if (!round) throw new Error("No active round");

		const { partnerSignals, interceptedSignals } = getVisibleSignals(round.signals, seat);

		return {
			seat,
			team: teamOf(seat),
			hand: [...round.hands[seat]],
			vira: round.vira,
			scores: [...this.state.scores] as [number, number],
			otherHandCounts: [
				round.hands[0].length,
				round.hands[1].length,
				round.hands[2].length,
				round.hands[3].length,
			],
			tricks: round.tricks.map((t) => ({ ...t })),
			currentTrick: { ...round.currentTrick },
			escalation: { ...round.escalation },
			legalActions: this.getLegalActions(seat),
			roundNumber: this.state.roundNumber,
			maoDeOnze:
				!round.maoDeferro && round.maoDeOnze.team === teamOf(seat) && !round.maoDeOnze.decided,
			maoDeferro: round.maoDeferro,
			partnerSignals,
			interceptedSignals,
		};
	}

	getLegalActions(seat: SeatId): Action[] {
		const round = this.state.currentRound;
		if (!round || this.state.winner !== null) return [];

		const team = teamOf(seat);

		// Mão de onze decision
		if (!round.maoDeOnze.decided) {
			if (round.maoDeOnze.team === team && this.getCurrentSeat() === seat) {
				return [{ type: ActionType.ACCEPT }, { type: ActionType.FOLD }];
			}
			return [];
		}

		// Pending escalation: responding team
		if (round.escalation.pendingRequest !== null) {
			const requestingTeam = teamOf(round.escalation.requestedBy as SeatId);
			if (team !== requestingTeam && this.getCurrentSeat() === seat) {
				const actions: Action[] = [{ type: ActionType.ACCEPT }, { type: ActionType.FOLD }];
				// For raise, use the seat as PlayerId (cast is safe for escalation logic)
				if (canRaise(round.escalation, seat as unknown as PlayerId)) {
					actions.push({ type: ActionType.RAISE });
				}
				return actions;
			}
			return [];
		}

		// Not this seat's turn
		if (this.getCurrentSeat() !== seat) return [];

		// Card play
		const actions: Action[] = round.hands[seat].map(
			(_, i): Action => ({ type: ActionType.PLAY_CARD, cardIndex: i }),
		);

		// Can escalate?
		if (!round.maoDeferro && canEscalate(round.escalation, seat as unknown as PlayerId)) {
			actions.push({ type: ActionType.TRUCO });
		}

		return actions;
	}

	step(seat: SeatId, action: Action): StepResult {
		const round = this.state.currentRound;
		if (!round) throw new Error("No active round");
		if (this.state.winner !== null) throw new Error("Game over");

		const legal = this.getLegalActions(seat);
		if (!legal.some((a) => actionEquals(a, action))) {
			throw new Error(`Illegal action by seat ${seat}: ${JSON.stringify(action)}`);
		}

		// Mão de onze
		if (!round.maoDeOnze.decided && round.maoDeOnze.team === teamOf(seat)) {
			if (action.type === ActionType.FOLD) {
				const oppTeam = teamOf(seat) === 0 ? 1 : 0;
				this.state.scores[oppTeam] += 1;
				return this.finishRound(oppTeam);
			}
			round.maoDeOnze.decided = true;
			round.escalation.level = "TRUCO";
			round.escalation.lastEscalatedBy = seat as unknown as PlayerId;
			return this.result();
		}

		// Escalation
		if (
			action.type === ActionType.TRUCO ||
			action.type === ActionType.ACCEPT ||
			action.type === ActionType.RAISE ||
			action.type === ActionType.FOLD
		) {
			const escResult = processEscalation(round.escalation, seat as unknown as PlayerId, action);
			if (escResult.folded) {
				const callerTeam = teamOf(round.escalation.requestedBy as SeatId);
				this.state.scores[callerTeam] += escResult.foldPoints;
				return this.finishRound(callerTeam);
			}
			round.escalation = escResult.state;
			return this.result();
		}

		// Play card
		if (action.type === ActionType.PLAY_CARD && "cardIndex" in action) {
			const hand = round.hands[seat];
			const card = hand[action.cardIndex];
			if (!card) throw new Error(`Invalid card index: ${action.cardIndex}`);
			round.hands[seat] = hand.filter((_, i) => i !== action.cardIndex);

			round.currentTrick.cards[seat] = card;
			round.currentTrick.cardsPlayed++;

			// Trick complete when all 4 have played
			if (round.currentTrick.cardsPlayed === 4) {
				return this.resolveTrick();
			}
			return this.result();
		}

		throw new Error(`Unknown action: ${action.type}`);
	}

	private resolveTrick(): StepResult {
		const round = this.state.currentRound!;
		const trick = round.currentTrick;

		// Find highest card
		let bestSeat: SeatId = trick.firstSeat;
		let bestCard = trick.cards[bestSeat]!;

		let seat = nextSeat(trick.firstSeat);
		for (let i = 1; i < 4; i++) {
			const card = trick.cards[seat]!;
			if (compareCards(card, bestCard, round.vira) > 0) {
				bestSeat = seat;
				bestCard = card;
			}
			seat = nextSeat(seat);
		}

		// Check for draws (multiple cards tied for best)
		let drawCount = 0;
		for (let s = 0; s < 4; s++) {
			const c = trick.cards[s as SeatId];
			if (c && compareCards(c, bestCard, round.vira) === 0) drawCount++;
		}

		const isDraw = drawCount > 1;
		// In a draw: if tied cards are from different teams, it's a true draw
		// If from same team, that team wins
		let winnerSeat: SeatId | null = null;
		let winningTeam: 0 | 1 | null = null;

		if (!isDraw) {
			winnerSeat = bestSeat;
			winningTeam = teamOf(bestSeat);
		} else {
			// Check if all tied cards belong to same team
			const tiedTeams = new Set<0 | 1>();
			for (let s = 0; s < 4; s++) {
				const c = trick.cards[s as SeatId];
				if (c && compareCards(c, bestCard, round.vira) === 0) {
					tiedTeams.add(teamOf(s as SeatId));
				}
			}
			if (tiedTeams.size === 1) {
				winningTeam = [...tiedTeams][0]!;
				winnerSeat = bestSeat;
			}
			// else true draw — winnerSeat stays null
		}

		const trickResult: FourPlayerTrickResult = {
			cards: [...trick.cards] as [Card | null, Card | null, Card | null, Card | null],
			firstSeat: trick.firstSeat,
			winner: winnerSeat,
			winningTeam,
		};
		round.tricks.push(trickResult);

		// Check if round can be decided
		const roundWinner = this.checkRoundWinner(round.tricks);
		if (roundWinner !== null) {
			const points = currentPoints(round.escalation);
			this.state.scores[roundWinner] += points;
			return this.finishRound(roundWinner);
		}

		if (round.tricks.length >= 3) {
			// All 3 tricks played — resolve
			const winner = this.resolveAllTricks(round.tricks);
			const points = currentPoints(round.escalation);
			this.state.scores[winner] += points;
			return this.finishRound(winner);
		}

		// Next trick — winner leads (or same leader if draw)
		const nextFirst = winnerSeat ?? trick.firstSeat;
		round.currentTrick = {
			firstSeat: nextFirst,
			cards: [null, null, null, null],
			cardsPlayed: 0,
		};
		return this.result();
	}

	private checkRoundWinner(tricks: FourPlayerTrickResult[]): 0 | 1 | null {
		if (tricks.length < 2) return null;
		const t1 = tricks[0]!;
		const t2 = tricks[1]!;

		// Same team wins both tricks
		if (t1.winningTeam !== null && t1.winningTeam === t2.winningTeam) return t1.winningTeam;
		// Trick 1 draw, trick 2 has winner
		if (t1.winningTeam === null && t2.winningTeam !== null) return t2.winningTeam;
		// Trick 1 has winner, trick 2 draw
		if (t1.winningTeam !== null && t2.winningTeam === null) return t1.winningTeam;

		return null; // need trick 3
	}

	private resolveAllTricks(tricks: FourPlayerTrickResult[]): 0 | 1 {
		const t1 = tricks[0]!;
		const t3 = tricks[2];

		if (t3) {
			if (t3.winningTeam !== null) return t3.winningTeam;
			// Trick 3 draw: trick 1 winner takes it
			if (t1.winningTeam !== null) return t1.winningTeam;
		}
		// All draws: team of the first player wins
		return teamOf(t1.firstSeat);
	}

	private finishRound(winningTeam: 0 | 1): StepResult {
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
			this.state.dealerSeat = nextSeat(this.state.dealerSeat);
			this.startNewRound();
		} else {
			this.state.currentRound = null;
		}

		return {
			done,
			roundDone: true,
			winner: this.state.winner as PlayerId | null,
			roundWinner: winningTeam as unknown as PlayerId,
			scores: [...this.state.scores] as [number, number],
		};
	}

	private result(): StepResult {
		return {
			done: false,
			roundDone: false,
			winner: null,
			roundWinner: null,
			scores: [...this.state.scores] as [number, number],
		};
	}
}

function actionEquals(a: Action, b: Action): boolean {
	if (a.type !== b.type) return false;
	if (a.type === ActionType.PLAY_CARD && b.type === ActionType.PLAY_CARD)
		return a.cardIndex === b.cardIndex;
	return true;
}
