import {
	type Card,
	ESCALATION_POINTS,
	ESCALATION_POINTS_MINEIRO,
	type EscalationState,
	type Observation,
	Ranks,
	Suits,
	cardToString,
	getManilhaRank,
	isManilha,
	cardStrength,
	type TrickResult,
} from "@trucobench/engine";

export type PromptVariant = "economy" | "minimal" | "standard" | "verbose" | "wiki";
export type PromptLanguage = "en" | "pt";

export interface PromptOptions {
	variant: PromptVariant;
	language: PromptLanguage;
}

const SUIT_NAMES_EN: Record<string, string> = {
	ouros: "Ouros (Diamonds)",
	espadas: "Espadas (Spades)",
	copas: "Copas (Hearts)",
	paus: "Paus (Clubs)",
};

const SUIT_NAMES_PT: Record<string, string> = {
	ouros: "Ouros",
	espadas: "Espadas",
	copas: "Copas",
	paus: "Paus",
};

function suitName(suit: string, lang: PromptLanguage): string {
	return lang === "pt" ? (SUIT_NAMES_PT[suit] ?? suit) : (SUIT_NAMES_EN[suit] ?? suit);
}

function cardLabel(card: Card, vira: Card, lang: PromptLanguage, variant: string = "PAULISTA"): string {
	const base = `${card.rank} of ${suitName(card.suit, lang)}`;
	if (isManilha(card, vira, variant as any)) {
		let manilhaLabel = lang === "pt" ? "manilha" : "manilha";
		if (card.rank === "4" && card.suit === "paus") manilhaLabel = "Zap";
		else if (card.rank === "7" && card.suit === "copas" && variant === "MINEIRO") manilhaLabel = "Sete de Copas";
		return `${base} (${manilhaLabel})`;
	}
	return base;
}

function formatTrick(trick: TrickResult, playerId: number, lang: PromptLanguage): string {
	const isFirst = trick.firstPlayer === playerId;
	const you = lang === "pt" ? "Voce" : "You";
	const opp = lang === "pt" ? "Oponente" : "Opponent";
	const first = isFirst ? you : opp;
	const second = isFirst ? opp : you;
	const firstCard = cardToString(trick.cards[0]);
	const secondCard = cardToString(trick.cards[1]);

	let result: string;
	if (trick.winner === null) {
		result = lang === "pt" ? "Empate" : "Draw";
	} else if (trick.winner === playerId) {
		result = lang === "pt" ? `${you} venceu` : `${you} won`;
	} else {
		result = lang === "pt" ? `${opp} venceu` : `${opp} won`;
	}

	return `${first} played ${firstCard}, ${second} played ${secondCard} → ${result}`;
}

function formatEscalation(esc: EscalationState, playerId: number, lang: PromptLanguage, variant: string = "PAULISTA"): string {
	const scoring = variant === "PAULISTA" ? ESCALATION_POINTS : ESCALATION_POINTS_MINEIRO;
	const points = scoring[esc.level];
	if (esc.level === "NORMAL" && esc.pendingRequest === null) {
		return lang === "pt" ? `Aposta atual: ${points} pontos` : `Current stake: ${points} points`;
	}

	const levelLabel = esc.level;
	const lines: string[] = [];

	if (esc.pendingRequest) {
		const pendingPoints = scoring[esc.pendingRequest];
		const caller =
			esc.requestedBy === playerId
				? lang === "pt"
					? "Voce"
					: "You"
				: lang === "pt"
					? "Oponente"
					: "Opponent";
		lines.push(
			lang === "pt"
				? `${caller} pediu ${esc.pendingRequest} (${pendingPoints} pontos). Aguardando resposta.`
				: `${caller} called ${esc.pendingRequest} (${pendingPoints} points). Awaiting response.`,
		);
	} else {
		lines.push(
			lang === "pt"
				? `Aposta atual: ${points} pontos (${levelLabel})`
				: `Current stake: ${points} points (${levelLabel})`,
		);
	}

	return lines.join("\n");
}

function formatLegalActions(obs: Observation, lang: PromptLanguage): string {
	const lines: string[] = [];
	for (let i = 0; i < obs.legalActions.length; i++) {
		const a = obs.legalActions[i]!;
		if (a.type === "PLAY_CARD") {
			const card = obs.hand[a.cardIndex]!;
			const label = cardLabel(card, obs.vira, lang, obs.variant);
			lines.push(`${i + 1}. PLAY_CARD ${a.cardIndex} (${label})`);
		} else {
			lines.push(`${i + 1}. ${a.type}`);
		}
	}
	return lines.join("\n");
}

const SIGNAL_LABELS_EN: Record<string, string> = {
	ZAP: "has Zap (paus manilha — strongest card)",
	COPAS: "has copas manilha",
	ESPADAS: "has espadas manilha",
	OUROS: "has ouros manilha",
	THREE: "has a 3",
	TWO: "has a 2",
	ACE: "has an Ace",
	NOTHING: "signals weak hand (nothing noteworthy)",
};

const SIGNAL_LABELS_PT: Record<string, string> = {
	ZAP: "tem Zap (manilha de paus — carta mais forte)",
	COPAS: "tem manilha de copas",
	ESPADAS: "tem manilha de espadas",
	OUROS: "tem manilha de ouros",
	THREE: "tem um 3",
	TWO: "tem um 2",
	ACE: "tem um As",
	NOTHING: "sinaliza mao fraca (nada notavel)",
};

function formatSignals(obs: Observation, lang: PromptLanguage): string | null {
	const partner = obs.partnerSignals;
	const intercepted = obs.interceptedSignals;

	if ((!partner || partner.length === 0) && (!intercepted || intercepted.length === 0)) {
		return null;
	}

	const labels = lang === "pt" ? SIGNAL_LABELS_PT : SIGNAL_LABELS_EN;
	const lines: string[] = [];

	if (lang === "pt") {
		lines.push("## Sinais (comunicacao com parceiro)");
		if (partner && partner.length > 0) {
			lines.push("Seu parceiro sinalizou:", ...partner.map((s) => `- ${labels[s.type] ?? s.type}`));
		}
		if (intercepted && intercepted.length > 0) {
			lines.push(
				"Voce interceptou sinais do oponente:",
				...intercepted.map((s) => `- Oponente ${labels[s.type] ?? s.type}`),
			);
		}
		lines.push(
			"(Sinais podem ser imprecisos — o oponente tambem pode ter interceptado seus sinais.)",
		);
	} else {
		lines.push("## Signals (partner communication)");
		if (partner && partner.length > 0) {
			lines.push("Your partner signaled:", ...partner.map((s) => `- ${labels[s.type] ?? s.type}`));
		}
		if (intercepted && intercepted.length > 0) {
			lines.push(
				"You intercepted opponent signals:",
				...intercepted.map((s) => `- Opponent ${labels[s.type] ?? s.type}`),
			);
		}
		lines.push("(Signals may be imprecise — opponents may have also intercepted your signals.)");
	}

	return lines.join("\n");
}

function buildEconomyPrompt(obs: Observation, _lang: PromptLanguage): string {
	const hand = obs.hand.map((c) => `${c.rank}${c.suit[0]}`).join(",");
	const vira = `${obs.vira.rank}${obs.vira.suit[0]}`;
	const score = `${obs.score[obs.playerId]}-${obs.score[obs.playerId === 0 ? 1 : 0]}`;
	const tricks = obs.tricks
		.map((t) => {
			const w = t.winner === null ? "D" : t.winner === obs.playerId ? "W" : "L";
			return w;
		})
		.join("");
	const pending = obs.currentTrick.firstCard
		? `opp:${cardToString(obs.currentTrick.firstCard)}`
		: "";
	const esc =
		obs.escalation.pendingRequest ??
		(obs.escalation.level !== "NORMAL" ? obs.escalation.level : "");
	const actions = obs.legalActions
		.map((a) => {
			if (a.type === "PLAY_CARD" && "cardIndex" in a) {
				const c = obs.hand[a.cardIndex]!;
				return `P${a.cardIndex}(${c.rank}${c.suit[0]})`;
			}
			return a.type[0];
		})
		.join(",");

	return [
		`H:${hand} V:${vira} S:${score}`,
		tricks ? `T:${tricks}` : null,
		pending || null,
		esc ? `E:${esc}` : null,
		`A:${actions}`,
		'{"reasoning":"...","action":"PLAY_CARD|TRUCO|ACCEPT|RAISE|FOLD","card_index":0}',
	]
		.filter(Boolean)
		.join("\n");
}

function buildMinimalPrompt(obs: Observation, lang: PromptLanguage): string {
	const you = lang === "pt" ? "Voce" : "You";
	const opp = lang === "pt" ? "Oponente" : "Opponent";
	const handStr = obs.hand.map((c) => cardLabel(c, obs.vira, lang, obs.variant)).join(", ");
	const viraStr = `${obs.vira.rank} ${obs.vira.suit}`;
	const trickStr = obs.tricks
		.map((t, i) => `T${i + 1}: ${formatTrick(t, obs.playerId, lang)}`)
		.join("; ");
	const pending = obs.currentTrick.firstCard
		? `Opp played: ${cardToString(obs.currentTrick.firstCard)}`
		: "";

	const signalParts: string[] = [];
	if (obs.partnerSignals?.length) {
		signalParts.push(`Partner: ${obs.partnerSignals.map((s) => s.type).join(", ")}`);
	}
	if (obs.interceptedSignals?.length) {
		signalParts.push(`Intercepted: ${obs.interceptedSignals.map((s) => s.type).join(", ")}`);
	}

	const lines = [
		`Hand: ${handStr}`,
		`Vira: ${viraStr}`,
		`Score: ${you} ${obs.score[obs.playerId]} - ${opp} ${obs.score[obs.playerId === 0 ? 1 : 0]}`,
		trickStr ? `Tricks: ${trickStr}` : null,
		pending || null,
		signalParts.length > 0 ? `Signals: ${signalParts.join("; ")}` : null,
		formatEscalation(obs.escalation, obs.playerId, lang, obs.variant),
		`Actions:\n${formatLegalActions(obs, lang)}`,
	];

	return lines.filter(Boolean).join("\n");
}

/**
 * Builds a "Cheat Sheet" strength table for all possible cards.
 * Returns a list of strings sorted from strongest to weakest.
 */
function buildStrengthTable(obs: Observation, lang: PromptLanguage): string[] {
	const allCards: Card[] = [];
	for (const suit of Suits) {
		for (const rank of Ranks) {
			allCards.push({ suit, rank });
		}
	}

	// Sort by strength
	allCards.sort((a, b) => cardStrength(b, obs.vira, obs.variant) - cardStrength(a, obs.vira, obs.variant));

	// Group by strength value to show ties
	const table: string[] = [];
	let currentStrength = -1;
	let currentGroup: string[] = [];

	for (const card of allCards) {
		const s = cardStrength(card, obs.vira, obs.variant);
		const label = cardToString(card);
		const isM = isManilha(card, obs.vira, obs.variant);
		const suffix = isM ? (card.suit === "paus" ? " (Zap)" : " (Manilha)") : "";

		if (s !== currentStrength) {
			if (currentGroup.length > 0) {
				table.push(currentGroup.join(", "));
			}
			currentStrength = s;
			currentGroup = [`${label}${suffix}`];
		} else {
			currentGroup.push(`${label}${suffix}`);
		}
	}
	if (currentGroup.length > 0) {
		table.push(currentGroup.join(", "));
	}

	return table;
}

function buildWikiPrompt(obs: Observation, lang: PromptLanguage): string {
	const you = lang === "pt" ? "VOCE" : "YOU";
	const opp = lang === "pt" ? "OPONENTE" : "OPPONENT";
	const oppIdx = obs.playerId === 0 ? 1 : 0;
	const variantName = obs.variant === "PAULISTA" ? "TRUCO PAULISTA" : "TRUCO MINEIRO";

	const strengthTable = buildStrengthTable(obs, lang);
	const tableLines = strengthTable.map((line, i) => `${i + 1}. ${line}`);

	const strategy = [
		"- BLUFFING: High-value when leading (won trick 1) or in response to opponent weakness.",
		"- TIES: Winner of next trick wins the round if current trick is a draw.",
		"- MINEIRO: Manilhas are fixed (4Paus > 7Copas > AEspadas > 7Ouros) regardless of Vira.",
	];

	const historyLines: string[] = [];
	for (let i = 0; i < obs.tricks.length; i++) {
		historyLines.push(`Trick ${i + 1}: ${formatTrick(obs.tricks[i]!, obs.playerId, lang)}`);
	}
	if (obs.currentTrick.firstCard) {
		const who = obs.currentTrick.firstPlayer === obs.playerId ? you : opp;
		historyLines.push(`Trick ${obs.tricks.length + 1}: ${who} played ${cardToString(obs.currentTrick.firstCard)}. YOUR TURN.`);
	} else {
		historyLines.push(`Trick ${obs.tricks.length + 1}: You lead the trick.`);
	}

	return `<CONTEXT>
Variant: ${variantName}
Score: ${you} ${obs.score[obs.playerId]} | ${opp} ${obs.score[oppIdx]}
Current Stake: ${formatEscalation(obs.escalation, obs.playerId, lang, obs.variant)}
Vira: ${cardToString(obs.vira)} (${cardLabel(obs.vira, obs.vira, lang, obs.variant)})
Round Progress: Trick ${obs.tricks.length + 1} of 3
</CONTEXT>

<REFERENCE>
## Card Strength (Strongest to Weakest)
${tableLines.join("\n")}

## Strategic Wiki
${strategy.join("\n")}
</REFERENCE>

<STATE>
## Your Hand
${obs.hand.map((c, i) => `[ID ${i}] ${cardToString(c)} (${cardLabel(c, obs.vira, lang, obs.variant)}) | Power: ${cardStrength(c, obs.vira, obs.variant)}`).join("\n")}

## Round History
${historyLines.join("\n")}
</STATE>

<ACTIONS>
${formatLegalActions(obs, lang)}
</ACTIONS>

<PROTOCOL>
Respond in JSON:
{
  "reasoning": "1. ANALYSIS: (Evaluate hand strength) 2. OPPONENT: (Predict opponent based on plays) 3. DECISION: (Final choice)",
  "action": "PLAY_CARD|TRUCO|ACCEPT|RAISE|FOLD",
  "card_index": 0
}
</PROTOCOL>`;
}

function buildStandardPrompt(obs: Observation, lang: PromptLanguage): string {
	const you = lang === "pt" ? "VOCE" : "YOU";
	const opp = lang === "pt" ? "OPONENTE" : "OPPONENT";
	const oppIdx = obs.playerId === 0 ? 1 : 0;
	
	const sections: string[] = [];

	sections.push(`# TRUCO GAME STATE\nVariant: ${obs.variant}`);

	const summary = [
		`| Score | ${you}: ${obs.score[obs.playerId]} | ${opp}: ${obs.score[oppIdx]} |`,
		`| Stake | ${formatEscalation(obs.escalation, obs.playerId, lang, obs.variant)} |`,
		`| Vira  | ${cardToString(obs.vira)} (${cardLabel(obs.vira, obs.vira, lang, obs.variant)}) |`,
	];
	sections.push(`## SCORE AND STAKE\n${summary.join("\n")}`);

	const handLines = obs.hand.map((c, i) => `- ${i}: ${cardToString(c)} (${cardLabel(c, obs.vira, lang, obs.variant)})`);
	sections.push(`## YOUR HAND\n${handLines.join("\n")}`);

	const historyLines: string[] = [];
	for (const t of obs.tricks) {
		historyLines.push(`- ${formatTrick(t, obs.playerId, lang)}`);
	}
	if (obs.currentTrick.firstCard) {
		const who = obs.currentTrick.firstPlayer === obs.playerId ? you : opp;
		historyLines.push(`- Current trick: ${who} played ${cardToString(obs.currentTrick.firstCard)}`);
	}
	sections.push(`## ROUND HISTORY\n${historyLines.length > 0 ? historyLines.join("\n") : "No cards played yet."}`);

	sections.push(`## LEGAL ACTIONS\n${formatLegalActions(obs, lang)}`);

	sections.push(`## RESPONSE FORMAT
Respond in JSON:
{
  "reasoning": "...",
  "action": "PLAY_CARD|TRUCO|ACCEPT|RAISE|FOLD",
  "card_index": 0
}`);

	return sections.join("\n\n");
}

function buildVerbosePrompt(obs: Observation, lang: PromptLanguage): string {
	const header = lang === "pt" ? "## REGRAS COMPLETAS" : "## COMPLETE RULES";
	const rules = obs.variant === "PAULISTA" ? 
		(lang === "pt" ? "- Truco Paulista: Manilhas mudam a cada rodada (Vira).\n- Ordem: Vira+1. Naipes: Paus>Copas>Espadas>Ouros." : "- Truco Paulista: Variable Manilhas (Vira).\n- Rank: Vira+1. Suits: Clubs>Hearts>Spades>Diamonds.") :
		(lang === "pt" ? "- Truco Mineiro: Manilhas FIXAS (4 Paus, 7 Copas, A Espadas, 7 Ouros).\n- Pontos: 2, 4, 8, 10, 12." : "- Truco Mineiro: FIXED Manilhas (4 Clubs, 7 Hearts, A Spades, 7 Diamonds).\n- Points: 2, 4, 8, 10, 12.");

	return `${header}\n${rules}\n\n${buildWikiPrompt(obs, lang)}`;
}

export function serializePrompt(obs: Observation, options: PromptOptions): string {
	switch (options.variant) {
		case "economy":
			return buildEconomyPrompt(obs, options.language);
		case "minimal":
			return buildMinimalPrompt(obs, options.language);
		case "standard":
			return buildStandardPrompt(obs, options.language);
		case "verbose":
			return buildVerbosePrompt(obs, options.language);
		case "wiki":
			return buildWikiPrompt(obs, options.language);
	}
}
