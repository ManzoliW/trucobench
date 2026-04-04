import {
	type Card,
	ESCALATION_POINTS,
	type EscalationState,
	type Observation,
	Suits,
	type TrickResult,
	cardStrength,
	cardToString,
	getManilhaRank,
	isManilha,
} from "@trucobench/engine";

export type PromptVariant = "economy" | "minimal" | "standard" | "verbose";
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

function cardLabel(card: Card, vira: Card, lang: PromptLanguage): string {
	const base = `${card.rank} of ${suitName(card.suit, lang)}`;
	if (isManilha(card, vira)) {
		const manilhaLabel = card.suit === "paus" ? "Zap" : "manilha";
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

function formatEscalation(esc: EscalationState, playerId: number, lang: PromptLanguage): string {
	const points = ESCALATION_POINTS[esc.level];
	if (esc.level === "NORMAL" && esc.pendingRequest === null) {
		return lang === "pt" ? `Aposta atual: ${points} ponto` : `Current stake: ${points} point`;
	}

	const levelLabel = esc.level;
	const lines: string[] = [];

	if (esc.pendingRequest) {
		const pendingPoints = ESCALATION_POINTS[esc.pendingRequest];
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
			const label = cardLabel(card, obs.vira, lang);
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

/**
 * Economy prompt — absolute minimum tokens. ~60-80 tokens per turn.
 * No manilha listing, no strategy, no chat, no signals.
 * Just: hand, vira, score, tricks, escalation, actions, format.
 */
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
	const handStr = obs.hand.map((c) => cardLabel(c, obs.vira, lang)).join(", ");
	const viraStr = `${obs.vira.rank} ${obs.vira.suit}`;
	const trickStr = obs.tricks
		.map((t, i) => `T${i + 1}: ${formatTrick(t, obs.playerId, lang)}`)
		.join("; ");
	const pending = obs.currentTrick.firstCard
		? `Opp played: ${cardToString(obs.currentTrick.firstCard)}`
		: "";

	// Compact signal info for minimal prompt
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
		formatEscalation(obs.escalation, obs.playerId, lang),
		`Actions:\n${formatLegalActions(obs, lang)}`,
	];

	return lines.filter(Boolean).join("\n");
}

function buildStandardPrompt(obs: Observation, lang: PromptLanguage): string {
	const you = lang === "pt" ? "Voce" : "You";
	const opp = lang === "pt" ? "Oponente" : "Opponent";
	const oppIdx = obs.playerId === 0 ? 1 : 0;

	const sections: string[] = [];

	// Header
	sections.push(
		lang === "pt" ? "Voce esta jogando Truco Paulista." : "You are playing Truco Paulista.",
	);

	// Hand
	const handLines = obs.hand.map((c, i) => `- ${i}: ${cardLabel(c, obs.vira, lang)}`);
	sections.push(
		lang === "pt" ? `## Sua mao\n${handLines.join("\n")}` : `## Your hand\n${handLines.join("\n")}`,
	);

	// Vira
	sections.push(`## Vira\n${cardLabel(obs.vira, obs.vira, lang)}`);

	// Manilhas
	const manilhaRank = getManilhaRank(obs.vira);
	const manilhaSuits = [...Suits].reverse(); // paus first (strongest)
	const manilhaLines = manilhaSuits.map(
		(s, i) =>
			`${i + 1}. ${manilhaRank} of ${suitName(s, lang)}${i === 0 ? " (Zap)" : ""}${i === 3 ? (lang === "pt" ? " (mais fraca)" : " (weakest)") : ""}`,
	);
	sections.push(
		lang === "pt"
			? `## Manilhas (mais forte para mais fraca)\n${manilhaLines.join("\n")}`
			: `## Manilhas (strongest to weakest)\n${manilhaLines.join("\n")}`,
	);

	// Score
	sections.push(
		lang === "pt"
			? `## Placar\n${you}: ${obs.score[obs.playerId]} | ${opp}: ${obs.score[oppIdx]}`
			: `## Score\n${you}: ${obs.score[obs.playerId]} | ${opp}: ${obs.score[oppIdx]}`,
	);

	// Mão de onze / ferro
	if (obs.maoDeOnze) {
		sections.push(
			lang === "pt"
				? "## Mao de Onze\nVoce tem 11 pontos. Decida se quer jogar (ACCEPT) ou fugir (FOLD). Se jogar, a rodada vale 3 pontos."
				: "## Mao de Onze\nYou have 11 points. Decide whether to play (ACCEPT) or fold (FOLD). If you play, the round is worth 3 points.",
		);
	}
	if (obs.maoDeferro) {
		sections.push(
			lang === "pt"
				? "## Mao de Ferro\nAmbos os times tem 11 pontos. A rodada vale 3 pontos. Sem truco."
				: "## Mao de Ferro\nBoth teams have 11 points. Round is worth 3 points. No escalation allowed.",
		);
	}

	// Current round
	const trickNum = obs.tricks.length + 1;
	const roundLines: string[] = [];
	for (let i = 0; i < obs.tricks.length; i++) {
		roundLines.push(`- Trick ${i + 1}: ${formatTrick(obs.tricks[i]!, obs.playerId, lang)}`);
	}
	if (obs.currentTrick.firstCard) {
		const who =
			obs.currentTrick.firstPlayer === obs.playerId
				? lang === "pt"
					? you
					: you
				: lang === "pt"
					? opp
					: opp;
		roundLines.push(
			`- Trick ${trickNum}: ${who} plays ${cardToString(obs.currentTrick.firstCard)}. Your turn.`,
		);
	}
	if (roundLines.length > 0) {
		sections.push(
			lang === "pt"
				? `## Rodada atual (trick ${trickNum} de 3)\n${roundLines.join("\n")}`
				: `## Current round (trick ${trickNum} of 3)\n${roundLines.join("\n")}`,
		);
	}

	// Escalation
	sections.push(`## Escalation\n${formatEscalation(obs.escalation, obs.playerId, lang)}`);

	// Signals (4P mode only — partner communication)
	const signalSection = formatSignals(obs, lang);
	if (signalSection) sections.push(signalSection);

	// Legal actions
	sections.push(
		lang === "pt"
			? `## Acoes legais\n${formatLegalActions(obs, lang)}`
			: `## Legal actions\n${formatLegalActions(obs, lang)}`,
	);

	// Strategy guidance
	sections.push(
		lang === "pt"
			? [
					"## Estrategia",
					"- Truco com mao fraca (blefe) e uma jogada valida — pode roubar pontos se o oponente fugir.",
					"- Quando o oponente pedir truco, avalie: ele realmente tem mao forte ou esta blefando?",
					"- Se voce venceu a 1a rodada, o oponente nao sabe sua forca real — bom momento para blefar.",
					"- Se o oponente esta perdendo no placar, e mais provavel que ele esteja blefando.",
					"- Fugir nao e fraqueza — preserva pontos. Mas fugir sempre convida mais blefes.",
				].join("\n")
			: [
					"## Strategy",
					"- Calling truco on a weak hand (bluffing) is a valid play — it can steal points if the opponent folds.",
					"- When your opponent calls truco, evaluate: do they really have a strong hand, or are they bluffing?",
					"- If you won the 1st trick, the opponent doesn't know your true strength — good time to bluff.",
					"- If the opponent is losing on score, they are more likely to be bluffing.",
					"- Folding is not weakness — it preserves points. But always folding invites more bluffs.",
				].join("\n"),
	);

	// Chat history (if any messages exist in observation)
	if (obs.chatHistory && obs.chatHistory.length > 0) {
		const chatLines = obs.chatHistory.map((m) => `- ${m.name}: "${m.text}"`);
		sections.push(
			lang === "pt"
				? `## Chat da mesa\n${chatLines.join("\n")}\n(Use o campo "chat" para provocar, blefar verbalmente ou apoiar seu parceiro.)`
				: `## Table chat\n${chatLines.join("\n")}\n(Use the "chat" field to trash talk, verbally bluff, or support your partner.)`,
		);
	}

	// Response format
	sections.push(
		[
			lang === "pt" ? "Responda em JSON:" : "Respond in JSON:",
			"{",
			`  "reasoning": "${lang === "pt" ? "seu raciocinio aqui" : "your chain-of-thought here"}",`,
			`  "action": "PLAY_CARD|TRUCO|ACCEPT|RAISE|FOLD",`,
			`  "card_index": 0,`,
			`  "chat": "${lang === "pt" ? "opcional: provocacao ou zoeira para a mesa" : "optional: trash talk or banter for the table"}"`,
			"}",
		].join("\n"),
	);

	return sections.join("\n\n");
}

function buildVerbosePrompt(obs: Observation, lang: PromptLanguage): string {
	const rules =
		lang === "pt"
			? [
					"## Regras do Truco Paulista",
					"- Baralho de 40 cartas (sem 8, 9, 10). Naipes: ouros, espadas, copas, paus.",
					"- Forca das cartas: 4 < 5 < 6 < 7 < Q < J < K < A < 2 < 3.",
					"- A carta virada (vira) determina as manilhas: as 4 cartas do proximo rank sao as mais fortes.",
					"- Ordem dos naipes nas manilhas: ouros < espadas < copas < paus (paus = Zap, mais forte).",
					"- Melhor de 3 rodadas. Empate na 1a: quem vencer a 2a leva. Empate na 3a: quem venceu a 1a leva.",
					"- Escalacao: TRUCO(3pts) -> SEIS(6pts) -> NOVE(9pts) -> DOZE(12pts).",
					"- Ao pedir truco, oponente pode ACEITAR, AUMENTAR ou FUGIR.",
					"- Jogo vai ate 12 pontos.",
					"",
				].join("\n")
			: [
					"## Truco Paulista Rules",
					"- 40-card deck (no 8, 9, 10). Suits: ouros, espadas, copas, paus.",
					"- Card strength: 4 < 5 < 6 < 7 < Q < J < K < A < 2 < 3.",
					"- The flipped card (vira) determines manilhas: the 4 cards of the next rank are the strongest.",
					"- Manilha suit order: ouros < espadas < copas < paus (paus = Zap, strongest).",
					"- Best of 3 tricks. Trick 1 draw: trick 2 winner takes round. Trick 3 draw: trick 1 winner takes round.",
					"- Escalation: TRUCO(3pts) -> SEIS(6pts) -> NOVE(9pts) -> DOZE(12pts).",
					"- On escalation call, opponent can ACCEPT, RAISE, or FOLD.",
					"- Game ends at 12 points.",
					"",
				].join("\n");

	const strategy =
		lang === "pt"
			? [
					"## Dicas de estrategia avancada",
					"",
					"### Blefe",
					"- Blefar (pedir truco com mao fraca) e fundamental no Truco. Nao jogue apenas com cartas fortes.",
					"- Melhor momento para blefar: voce venceu a 1a rodada e tem cartas medianas — o oponente teme sua mao.",
					"- Blefar quando esta perdendo no placar e inteligente: voce precisa de pontos e fugir so atrasa a derrota.",
					"- NAO blefe quando as apostas ja estao altas (seis/nove) — o custo de ser pego e muito alto.",
					"- Pedir truco ANTES de jogar sua carta forte cria mais pressao do que depois.",
					"",
					"### Deteccao de blefe",
					"- Quando o oponente pedir truco, pergunte: ele esta perdendo no placar? Se sim, mais chance de blefe.",
					"- Se o oponente jogou uma carta fraca na 1a rodada e depois pediu truco, provavelmente esta blefando.",
					"- Se o oponente venceu a 1a rodada com uma carta muito forte e pediu truco, provavelmente tem mao boa de verdade.",
					"- Se voce tem pelo menos 1 manilha, raramente fuja — sua mao tem chance real.",
					"- Fugir nao e fraqueza, mas fugir sempre convida mais blefes. Varie suas respostas.",
					"",
					"### Gerenciamento de placar",
					"- Guarde manilhas para rodadas decisivas.",
					"- Quando esta ganhando, jogue conservador — proteja a lideranca.",
					"- Quando esta perdendo, blefe mais e aceite mais trucos — voce precisa de pontos.",
					"- Perto de 11 pontos, considere se vale arriscar uma mao de onze.",
					"",
				].join("\n")
			: [
					"## Advanced strategy hints",
					"",
					"### Bluffing",
					"- Bluffing (calling truco with a weak hand) is fundamental to Truco. Don't just play strong cards.",
					"- Best time to bluff: you won the 1st trick with mediocre cards — the opponent fears your hand.",
					"- Bluffing when behind on score is smart: you need points, and folding only delays defeat.",
					"- Do NOT bluff when stakes are already high (seis/nove) — the cost of being caught is too high.",
					"- Calling truco BEFORE playing your strong card creates more pressure than after.",
					"",
					"### Bluff detection",
					"- When your opponent calls truco, ask: are they losing on score? If yes, more likely bluffing.",
					"- If the opponent played a weak card in trick 1 then called truco, they are probably bluffing.",
					"- If the opponent won trick 1 with a very strong card and called truco, they likely have a genuinely good hand.",
					"- If you hold at least 1 manilha, rarely fold — your hand has real potential.",
					"- Folding is not weakness, but always folding invites more bluffs. Vary your responses.",
					"",
					"### Score management",
					"- Save manilhas for decisive tricks.",
					"- When ahead, play conservatively — protect your lead.",
					"- When behind, bluff more and accept more truco calls — you need points.",
					"- Near 11 points, consider whether risking a mao de onze is worth it.",
					"",
				].join("\n");

	return `${rules}\n${strategy}\n${buildStandardPrompt(obs, lang)}`;
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
	}
}
