export const TrucoVariant = {
	PAULISTA: "PAULISTA",
	MINEIRO: "MINEIRO",
} as const;
export type TrucoVariant = (typeof TrucoVariant)[keyof typeof TrucoVariant];

export const Suits = ["ouros", "espadas", "copas", "paus"] as const;
export type Suit = (typeof Suits)[number];

export const Ranks = ["4", "5", "6", "7", "Q", "J", "K", "A", "2", "3"] as const;
export type Rank = (typeof Ranks)[number];

export interface Card {
	readonly suit: Suit;
	readonly rank: Rank;
}

export type PlayerId = 0 | 1;

export const ActionType = {
	PLAY_CARD: "PLAY_CARD",
	TRUCO: "TRUCO",
	ACCEPT: "ACCEPT",
	RAISE: "RAISE",
	FOLD: "FOLD",
} as const;

export type ActionType = (typeof ActionType)[keyof typeof ActionType];

export interface PlayCardAction {
	type: typeof ActionType.PLAY_CARD;
	cardIndex: number;
}

export interface SimpleAction {
	type:
		| typeof ActionType.TRUCO
		| typeof ActionType.ACCEPT
		| typeof ActionType.RAISE
		| typeof ActionType.FOLD;
}

export type Action = PlayCardAction | SimpleAction;

export const EscalationLevel = {
	NORMAL: "NORMAL",
	TRUCO: "TRUCO",
	SEIS: "SEIS",
	NOVE: "NOVE",
	DOZE: "DOZE",
} as const;

export type EscalationLevel = (typeof EscalationLevel)[keyof typeof EscalationLevel];

export const ESCALATION_POINTS: Record<EscalationLevel, number> = {
	NORMAL: 1,
	TRUCO: 3,
	SEIS: 6,
	NOVE: 9,
	DOZE: 12,
};

export const ESCALATION_POINTS_MINEIRO: Record<EscalationLevel, number> = {
	NORMAL: 2,
	TRUCO: 4,
	SEIS: 8,
	NOVE: 10,
	DOZE: 12,
};

export const ESCALATION_ORDER: EscalationLevel[] = [
	EscalationLevel.NORMAL,
	EscalationLevel.TRUCO,
	EscalationLevel.SEIS,
	EscalationLevel.NOVE,
	EscalationLevel.DOZE,
];

export interface TrickResult {
	cards: [Card, Card];
	firstPlayer: PlayerId;
	winner: PlayerId | null; // null = draw
}

export interface RoundResult {
	winner: PlayerId | null;
	points: number;
	tricks: TrickResult[];
}

export type TrucoTiming = "anytime" | "after-first-card" | "after-first-trick";

export interface EscalationState {
	level: EscalationLevel;
	pendingRequest: EscalationLevel | null; // the level being requested
	requestedBy: PlayerId | null;
	lastEscalatedBy: PlayerId | null; // who last escalated (they can't escalate again)
	initiatedBySeat: number | null; // who was active when escalation chain started (for turn restoration)
}

export interface RoundState {
	hands: [Card[], Card[]];
	vira: Card;
	tricks: TrickResult[];
	currentTrick: {
		firstPlayer: PlayerId;
		firstCard: Card | null;
	};
	escalation: EscalationState;
	maoDeOnze: {
		team: PlayerId | null; // which team is at 11 (null if neither or both)
		decided: boolean;
	};
	maoDeferro: boolean; // both teams at 11
}

export interface GameState {
	variant: TrucoVariant;
	scores: [number, number];
	currentRound: RoundState | null;
	roundNumber: number;
	firstPlayer: PlayerId; // who plays first this round
	winner: PlayerId | null;
}

export interface Observation {
	variant: TrucoVariant;
	hand: Card[];
	vira: Card;
	score: [number, number];
	opponentCardCount: number;
	tricks: TrickResult[];
	currentTrick: {
		firstPlayer: PlayerId;
		firstCard: Card | null;
	};
	escalation: EscalationState;
	playerId: PlayerId;
	legalActions: Action[];
	roundNumber: number;
	maoDeOnze: boolean; // whether this is a mão de onze for the observing player
	maoDeferro: boolean;
	/** Signals received from partner (4P only, empty in 2P) */
	partnerSignals?: { type: string; fromSeat: number }[];
	/** Opponent signals intercepted (4P only, empty in 2P) */
	interceptedSignals?: { type: string; fromSeat: number }[];
	/** Recent chat messages visible to this player */
	chatHistory?: { name: string; text: string }[];
}

export interface StepResult {
	done: boolean; // game over?
	roundDone: boolean; // round over?
	winner: PlayerId | null; // game winner (only if done)
	roundWinner: PlayerId | null; // round winner (only if roundDone)
	scores: [number, number];
}
