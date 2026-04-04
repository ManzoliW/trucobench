export type Locale = "en" | "pt" | "es";

export function detectLocale(): Locale {
	if (typeof window === "undefined") return "en";
	const stored = localStorage.getItem("trucobench-locale");
	if (stored === "pt" || stored === "es" || stored === "en") return stored;
	const lang = navigator.language.slice(0, 2);
	if (lang === "pt") return "pt";
	if (lang === "es") return "es";
	return "en";
}

export function saveLocale(locale: Locale): void {
	if (typeof window !== "undefined") localStorage.setItem("trucobench-locale", locale);
}

/** Map UI locale to the nearest supported prompt language */
export function toPromptLang(locale: Locale): "en" | "pt" {
	return locale === "pt" ? "pt" : "en";
}

export const LOCALES: { value: Locale; native: string }[] = [
	{ value: "en", native: "EN" },
	{ value: "pt", native: "PT" },
	{ value: "es", native: "ES" },
];

/* ── Provider metadata ──────────────────────────────── */

export const MODEL_PROVIDERS: Record<string, { color: string; abbr: string; name: string }> = {
	anthropic: { color: "var(--provider-anthropic)", abbr: "A", name: "Anthropic" },
	openai: { color: "var(--provider-openai)", abbr: "O", name: "OpenAI" },
	google: { color: "var(--provider-google)", abbr: "G", name: "Google" },
	deepseek: { color: "var(--provider-deepseek)", abbr: "D", name: "DeepSeek" },
	huggingface: { color: "var(--provider-huggingface)", abbr: "H", name: "Hugging Face" },
	local: { color: "var(--provider-local)", abbr: "L", name: "Local" },
};

export function getModelProvider(model: string): string {
	if (model.startsWith("claude") || model.startsWith("anthropic/")) return "anthropic";
	if (model.startsWith("gpt") || model.startsWith("openai/")) return "openai";
	if (model.startsWith("gemini") || model.startsWith("google/")) return "google";
	if (model.startsWith("deepseek") || model.startsWith("deepseek/")) return "deepseek";
	if (model.startsWith("hf:") || model.includes("/")) return "huggingface";
	return "local";
}

/* ── Translations ───────────────────────────────────── */

type Dict = Record<string, string>;

const en: Dict = {
	// App
	"app.subtitle": "Truco Paulista with AI",
	"table.deal": "Deal",
	"seat.tapToFill": "Tap to fill",
	"seat.quickPicks": "Quick picks",
	"seat.inviteFriend": "Invite a friend",
	"seat.comingSoon": "Coming soon",
	// Menu
	"menu.quickStart": "Quick start",
	"menu.customGame": "Custom game",
	"preset.youVsBot": "You vs Bot",
	"preset.youVsBotDesc": "Classic 2-player",
	"preset.youVsBotHint": "No API key needed",
	"preset.youPlus3AiHint": "Needs API keys for LLM models",
	"preset.aiBattleHint": "Needs API keys for all 4 models",
	"preset.youPlus3Ai": "You + 3 AIs",
	"preset.youPlus3AiDesc": "4-player with LLMs",
	"preset.aiBattle": "AI Battle",
	"preset.aiBattleDesc": "Watch 4 LLMs compete",
	// Mode
	"mode.2p": "2 Players",
	"mode.4p": "4 Players",
	// Teams
	"team.label": "Team",
	"team.a": "Team A (S+N)",
	"team.b": "Team B (W+E)",
	"team.info": "Partners sit across.",
	// Seats
	"seat.south": "South (You)",
	"seat.west": "West",
	"seat.north": "North (Partner)",
	"seat.east": "East",
	"seat.player1": "Player 1",
	"seat.player2": "Player 2",
	// Agents
	"agent.you": "You",
	"agent.human": "You",
	"agent.youNote": "Play yourself",
	"agent.humanNote": "Play yourself",
	"agent.random": "Random",
	"agent.randomNote": "Picks randomly",
	"agent.randomLlm": "Random LLM",
	"agent.randomLlmNote": "Picks a random AI model",
	"agent.heuristic": "Heuristic",
	"agent.heuristicNote": "Rule-based AI",
	"agent.localGroup": "Local (no API key)",
	"agent.llmGroup": "LLM Models",
	// Provider
	"provider.label": "API provider",
	"provider.tip": "How AI models connect to their APIs. Only affects LLM model seats.",
	"provider.direct": "Direct APIs",
	"provider.directHint": "One API key per provider in .env",
	"provider.openrouter": "OpenRouter",
	"provider.openrouterHint": "Single key for all models (openrouter.ai/keys)",
	"provider.vercel": "Vercel Gateway",
	"provider.vercelHint": "VERCEL_AI_GATEWAY_URL + API key",
	"provider.aiSdk": "AI SDK",
	"provider.aiSdkHint": "Vercel AI SDK with per-provider keys",
	"provider.claudeCode": "Claude Code",
	"provider.claudeCodeHint": "Local Claude subscription, no API key. Claude models only.",
	// Advanced
	"advanced.label": "Advanced",
	"advanced.prompt": "Prompt",
	"advanced.promptTip":
		"How much detail the AI receives about the game state. Minimal = just facts, Standard = balanced, Verbose = full rules reminder.",
	"advanced.promptLang": "Prompt language",
	"advanced.promptLangTip": "Language of prompts sent to AI models. Independent of UI language.",
	"advanced.temp": "Temp: {v}",
	"advanced.tempTip":
		"Controls randomness. Higher = more creative and unpredictable. Lower = more deterministic and consistent.",
	"advanced.timer": "Your timer",
	"advanced.timerTip":
		"Max time for your turns. AI gets up to 2 minutes to think (slower models need more time).",
	"advanced.noLimit": "No limit",
	"game.timeout": "Time's up!",
	"prompt.economy": "Economy (low tokens)",
	"prompt.minimal": "Minimal",
	"prompt.standard": "Standard",
	"prompt.verbose": "Verbose",
	// Start
	"start.button": "Start game",
	"start.starting": "Starting...",
	// Help
	"help.title": "What is Truco Paulista?",
	"help.p1":
		"A popular Brazilian card game for 2 or 4 players (2 teams of 2). Played with 40 cards, 3 cards per hand, best-of-3 tricks per round.",
	"help.p2":
		'Manilhas are trumps determined by the vira card. Suit ranking: Ouros < Espadas < Copas < Paus (the "Zap", strongest card).',
	"help.p3":
		"Truco: raise the stakes at any time. Opponent must accept, fold, or counter-raise. Stakes go 1 \u2192 3 \u2192 6 \u2192 9 \u2192 12.",
	"help.p4":
		"In 4-player mode, partners sit across (South+North vs West+East). First team to 12 points wins.",
	// Game board
	"game.shuffling": "Shuffling deck...",
	"game.newGame": "New game",
	"game.disconnected": "Connection lost. Reconnecting...",
	"game.round": "Round {n}",
	"game.vira": "Vira",
	"game.maoDeOnze": "M\u00e3o de Onze",
	"game.roundComplete": "Round complete",
	"game.nextRound": "Next round",
	"game.error": "Error",
	"game.checkApi": "Check API keys in .env",
	"game.retry": "Retry",
	"game.setup": "Setup",
	"game.youWin": "You win!",
	"game.youLost": "You lost",
	"game.wins": "{name} wins!",
	"game.playAgain": "Play again",
	"game.changeSetup": "Change setup",
	"game.log": "Game log",
	"game.logClose": "Close",
	"game.waitingFirst": "Waiting for first move...",
	"game.thinkingWho": "{name} thinking...",
	"game.thinking": "Thinking...",
	"game.speed": "Speed:",
	"game.fold": "fold",
	"game.foldConfirm": "Confirm?",
	"game.card": "card #{n}",
	"game.partner": "Partner",
	"game.yourTeam": "Your team",
	"game.yourHand": "Your hand",
	// Signals
	"signal.button": "Signal",
	"signal.sent": "Signal sent",
	"signal.partnerSays": "Partner signals: {what}",
	"signal.intercepted": "Caught signal: {what}",
	"signal.ZAP": "Zap (strongest)",
	"signal.COPAS": "Copas manilha",
	"signal.ESPADAS": "Espadas manilha",
	"signal.OUROS": "Ouros manilha",
	"signal.THREE": "Has 3",
	"signal.TWO": "Has 2",
	"signal.ACE": "Has Ace",
	"signal.NOTHING": "Nothing good",
	// Tricks
	"trick.won": "won",
	"trick.lost": "lost",
	"trick.draw": "draw",
	"trick.pending": "pending",
	// Action tooltips
	"action.trucoTip": "Raise stakes to 3 pts. Opponent must accept, fold, or counter-raise.",
	"action.raiseTip": "Counter-raise to escalate the stakes higher.",
	"action.acceptTip": "Accept the current stakes and continue playing.",
	// Aria
	"score.label": "Score: {a} to {b}",
	"trick.label": "Trick {n}: {status}",
};

const pt: Dict = {
	"app.subtitle": "Truco Paulista com IA",
	"table.deal": "Jogar",
	"seat.tapToFill": "Toque para preencher",
	"seat.quickPicks": "Escolha r\u00e1pida",
	"seat.inviteFriend": "Convidar amigo",
	"seat.comingSoon": "Em breve",
	"menu.quickStart": "In\u00edcio r\u00e1pido",
	"menu.customGame": "Jogo personalizado",
	"preset.youVsBot": "Voc\u00ea vs Bot",
	"preset.youVsBotDesc": "Cl\u00e1ssico 2 jogadores",
	"preset.youVsBotHint": "Sem API key necess\u00e1ria",
	"preset.youPlus3AiHint": "Precisa de API keys para os modelos",
	"preset.aiBattleHint": "Precisa de API keys para os 4 modelos",
	"preset.youPlus3Ai": "Voc\u00ea + 3 IAs",
	"preset.youPlus3AiDesc": "4 jogadores com LLMs",
	"preset.aiBattle": "Batalha de IAs",
	"preset.aiBattleDesc": "Assista 4 LLMs competirem",
	"mode.2p": "2 Jogadores",
	"mode.4p": "4 Jogadores",
	"team.label": "Time",
	"team.a": "Time A (S+N)",
	"team.b": "Time B (O+L)",
	"team.info": "Parceiros sentam opostos.",
	"seat.south": "Sul (Voc\u00ea)",
	"seat.west": "Oeste",
	"seat.north": "Norte (Parceiro)",
	"seat.east": "Leste",
	"seat.player1": "Jogador 1",
	"seat.player2": "Jogador 2",
	"agent.you": "Voc\u00ea",
	"agent.human": "Voc\u00ea",
	"agent.youNote": "Jogue voc\u00ea mesmo",
	"agent.humanNote": "Jogue voc\u00ea mesmo",
	"agent.random": "Aleat\u00f3rio",
	"agent.randomNote": "Escolhe ao acaso",
	"agent.randomLlm": "LLM Aleat\u00f3rio",
	"agent.randomLlmNote": "Escolhe um modelo de IA aleat\u00f3rio",
	"agent.heuristic": "Heur\u00edstico",
	"agent.heuristicNote": "IA baseada em regras",
	"agent.localGroup": "Local (sem API key)",
	"agent.llmGroup": "Modelos LLM",
	"provider.label": "Provedor de API",
	"provider.tip": "Como os modelos de IA se conectam \u00e0s APIs. Afeta apenas assentos com LLM.",
	"provider.direct": "APIs Diretas",
	"provider.directHint": "Uma API key por provedor no .env",
	"provider.openrouter": "OpenRouter",
	"provider.openrouterHint": "Uma key para todos os modelos (openrouter.ai/keys)",
	"provider.vercel": "Vercel Gateway",
	"provider.vercelHint": "VERCEL_AI_GATEWAY_URL + API key",
	"provider.aiSdk": "AI SDK",
	"provider.aiSdkHint": "Vercel AI SDK com keys por provedor",
	"provider.claudeCode": "Claude Code",
	"provider.claudeCodeHint": "Assinatura local do Claude, sem API key. Apenas modelos Claude.",
	"advanced.label": "Avan\u00e7ado",
	"advanced.prompt": "Prompt",
	"advanced.promptTip":
		"Quanta informa\u00e7\u00e3o a IA recebe sobre o jogo. M\u00ednimo = s\u00f3 fatos, Padr\u00e3o = equilibrado, Detalhado = regras completas.",
	"advanced.promptLang": "Idioma do prompt",
	"advanced.promptLangTip":
		"Idioma dos prompts enviados aos modelos. Independente do idioma da interface.",
	"advanced.temp": "Temp: {v}",
	"advanced.tempTip":
		"Controla aleatoriedade. Maior = mais criativo e imprevis\u00edvel. Menor = mais determin\u00edstico.",
	"advanced.timer": "Seu tempo",
	"advanced.timerTip":
		"Tempo m\u00e1ximo para seus turnos. IAs t\u00eam at\u00e9 2 minutos para pensar (modelos lentos precisam de mais tempo).",
	"advanced.noLimit": "Sem limite",
	"game.timeout": "Tempo esgotado!",
	"prompt.economy": "Econ\u00f4mico (menos tokens)",
	"prompt.minimal": "M\u00ednimo",
	"prompt.standard": "Padr\u00e3o",
	"prompt.verbose": "Detalhado",
	"start.button": "Iniciar jogo",
	"start.starting": "Iniciando...",
	"help.title": "O que \u00e9 Truco Paulista?",
	"help.p1":
		"Um jogo de cartas brasileiro popular para 2 ou 4 jogadores (2 times de 2). Jogado com 40 cartas, 3 cartas por m\u00e3o, melhor de 3 rodadas.",
	"help.p2":
		'Manilhas s\u00e3o trunfos determinados pela carta vira. Naipes: Ouros < Espadas < Copas < Paus (o "Zap", carta mais forte).',
	"help.p3":
		"Truco: aumente a aposta a qualquer momento. Oponente pode aceitar, correr ou aumentar. Apostas: 1 \u2192 3 \u2192 6 \u2192 9 \u2192 12.",
	"help.p4":
		"No modo 4 jogadores, parceiros sentam opostos (Sul+Norte vs Oeste+Leste). Primeiro time a 12 pontos vence.",
	"game.shuffling": "Embaralhando...",
	"game.newGame": "Novo jogo",
	"game.disconnected": "Conex\u00e3o perdida. Reconectando...",
	"game.round": "Rodada {n}",
	"game.vira": "Vira",
	"game.maoDeOnze": "M\u00e3o de Onze",
	"game.roundComplete": "Rodada completa",
	"game.nextRound": "Pr\u00f3xima rodada",
	"game.error": "Erro",
	"game.checkApi": "Verifique as API keys no .env",
	"game.retry": "Tentar novamente",
	"game.setup": "Configura\u00e7\u00e3o",
	"game.youWin": "Voc\u00ea venceu!",
	"game.youLost": "Voc\u00ea perdeu",
	"game.wins": "{name} venceu!",
	"game.playAgain": "Jogar novamente",
	"game.changeSetup": "Alterar configura\u00e7\u00e3o",
	"game.log": "Registro",
	"game.logClose": "Fechar",
	"game.waitingFirst": "Aguardando primeira jogada...",
	"game.thinkingWho": "{name} pensando...",
	"game.thinking": "Pensando...",
	"game.speed": "Velocidade:",
	"game.fold": "correr",
	"game.foldConfirm": "Confirmar?",
	"game.card": "carta #{n}",
	"game.partner": "Parceiro",
	"game.yourTeam": "Seu time",
	"game.yourHand": "Sua m\u00e3o",
	"signal.button": "Sinal",
	"signal.sent": "Sinal enviado",
	"signal.partnerSays": "Parceiro sinaliza: {what}",
	"signal.intercepted": "Sinal interceptado: {what}",
	"signal.ZAP": "Zap (mais forte)",
	"signal.COPAS": "Manilha de copas",
	"signal.ESPADAS": "Manilha de espadas",
	"signal.OUROS": "Manilha de ouros",
	"signal.THREE": "Tem 3",
	"signal.TWO": "Tem 2",
	"signal.ACE": "Tem \u00c1s",
	"signal.NOTHING": "Nada bom",
	"trick.won": "ganhou",
	"trick.lost": "perdeu",
	"trick.draw": "empate",
	"trick.pending": "pendente",
	"action.trucoTip": "Aumentar aposta para 3 pts. Oponente deve aceitar, correr ou aumentar.",
	"action.raiseTip": "Contra-aumentar para escalar a aposta.",
	"action.acceptTip": "Aceitar a aposta atual e continuar jogando.",
	"score.label": "Placar: {a} a {b}",
	"trick.label": "Rodada {n}: {status}",
};

const es: Dict = {
	"app.subtitle": "Truco Paulista con IA",
	"table.deal": "Repartir",
	"seat.tapToFill": "Toca para llenar",
	"seat.quickPicks": "Selecci\u00f3n r\u00e1pida",
	"seat.inviteFriend": "Invitar amigo",
	"seat.comingSoon": "Pr\u00f3ximamente",
	"menu.quickStart": "Inicio r\u00e1pido",
	"menu.customGame": "Juego personalizado",
	"preset.youVsBot": "T\u00fa vs Bot",
	"preset.youVsBotDesc": "Cl\u00e1sico 2 jugadores",
	"preset.youVsBotHint": "Sin API key necesaria",
	"preset.youPlus3AiHint": "Necesita API keys para los modelos",
	"preset.aiBattleHint": "Necesita API keys para los 4 modelos",
	"preset.youPlus3Ai": "T\u00fa + 3 IAs",
	"preset.youPlus3AiDesc": "4 jugadores con LLMs",
	"preset.aiBattle": "Batalla de IAs",
	"preset.aiBattleDesc": "Mira 4 LLMs competir",
	"mode.2p": "2 Jugadores",
	"mode.4p": "4 Jugadores",
	"team.label": "Equipo",
	"team.a": "Equipo A (S+N)",
	"team.b": "Equipo B (O+E)",
	"team.info": "Los compa\u00f1eros se sientan enfrente.",
	"seat.south": "Sur (T\u00fa)",
	"seat.west": "Oeste",
	"seat.north": "Norte (Compa\u00f1ero)",
	"seat.east": "Este",
	"seat.player1": "Jugador 1",
	"seat.player2": "Jugador 2",
	"agent.you": "T\u00fa",
	"agent.human": "T\u00fa",
	"agent.youNote": "Juega t\u00fa mismo",
	"agent.humanNote": "Juega t\u00fa mismo",
	"agent.random": "Aleatorio",
	"agent.randomNote": "Elige al azar",
	"agent.randomLlm": "LLM Aleatorio",
	"agent.randomLlmNote": "Elige un modelo de IA al azar",
	"agent.heuristic": "Heur\u00edstico",
	"agent.heuristicNote": "IA basada en reglas",
	"agent.localGroup": "Local (sin API key)",
	"agent.llmGroup": "Modelos LLM",
	"provider.label": "Proveedor de API",
	"provider.tip": "C\u00f3mo los modelos se conectan a sus APIs. Solo afecta asientos con LLM.",
	"provider.direct": "APIs Directas",
	"provider.directHint": "Una API key por proveedor en .env",
	"provider.openrouter": "OpenRouter",
	"provider.openrouterHint": "Una key para todos los modelos (openrouter.ai/keys)",
	"provider.vercel": "Vercel Gateway",
	"provider.vercelHint": "VERCEL_AI_GATEWAY_URL + API key",
	"provider.aiSdk": "AI SDK",
	"provider.aiSdkHint": "Vercel AI SDK con keys por proveedor",
	"provider.claudeCode": "Claude Code",
	"provider.claudeCodeHint": "Suscripci\u00f3n local de Claude, sin API key. Solo modelos Claude.",
	"advanced.label": "Avanzado",
	"advanced.prompt": "Prompt",
	"advanced.promptTip":
		"Cu\u00e1nta informaci\u00f3n recibe la IA sobre el juego. M\u00ednimo = solo hechos, Est\u00e1ndar = equilibrado, Detallado = reglas completas.",
	"advanced.promptLang": "Idioma del prompt",
	"advanced.promptLangTip":
		"Idioma de los prompts enviados a los modelos. Independiente del idioma de la interfaz.",
	"advanced.temp": "Temp: {v}",
	"advanced.tempTip":
		"Controla aleatoriedad. Mayor = m\u00e1s creativo e impredecible. Menor = m\u00e1s determinista.",
	"advanced.timer": "Tu tiempo",
	"advanced.timerTip":
		"Tiempo m\u00e1ximo para tus turnos. Las IAs tienen hasta 2 minutos para pensar (modelos lentos necesitan m\u00e1s tiempo).",
	"advanced.noLimit": "Sin l\u00edmite",
	"game.timeout": "\u00a1Se acab\u00f3 el tiempo!",
	"prompt.economy": "Econ\u00f3mico (menos tokens)",
	"prompt.minimal": "M\u00ednimo",
	"prompt.standard": "Est\u00e1ndar",
	"prompt.verbose": "Detallado",
	"start.button": "Iniciar juego",
	"start.starting": "Iniciando...",
	"help.title": "\u00bfQu\u00e9 es el Truco Paulista?",
	"help.p1":
		"Un juego de cartas brasile\u00f1o popular para 2 o 4 jugadores (2 equipos de 2). Se juega con 40 cartas, 3 por mano, mejor de 3 bazas por ronda.",
	"help.p2":
		'Las manilhas son triunfos determinados por la carta vira. Palos: Ouros < Espadas < Copas < Paus (el "Zap", la carta m\u00e1s fuerte).',
	"help.p3":
		"Truco: sube la apuesta en cualquier momento. El oponente debe aceptar, irse o redoblar. Apuestas: 1 \u2192 3 \u2192 6 \u2192 9 \u2192 12.",
	"help.p4":
		"En modo 4 jugadores, los compa\u00f1eros se sientan enfrente (Sur+Norte vs Oeste+Este). El primer equipo en llegar a 12 puntos gana.",
	"game.shuffling": "Barajando...",
	"game.newGame": "Nuevo juego",
	"game.disconnected": "Conexi\u00f3n perdida. Reconectando...",
	"game.round": "Ronda {n}",
	"game.vira": "Vira",
	"game.maoDeOnze": "Mano de Once",
	"game.roundComplete": "Ronda completa",
	"game.nextRound": "Siguiente ronda",
	"game.error": "Error",
	"game.checkApi": "Verifica las API keys en .env",
	"game.retry": "Reintentar",
	"game.setup": "Configuraci\u00f3n",
	"game.youWin": "\u00a1Ganaste!",
	"game.youLost": "Perdiste",
	"game.wins": "\u00a1{name} gan\u00f3!",
	"game.playAgain": "Jugar de nuevo",
	"game.changeSetup": "Cambiar configuraci\u00f3n",
	"game.log": "Registro",
	"game.logClose": "Cerrar",
	"game.waitingFirst": "Esperando primera jugada...",
	"game.thinkingWho": "{name} pensando...",
	"game.thinking": "Pensando...",
	"game.speed": "Velocidad:",
	"game.fold": "irse",
	"game.foldConfirm": "\u00bfConfirmar?",
	"game.card": "carta #{n}",
	"game.partner": "Compa\u00f1ero",
	"game.yourTeam": "Tu equipo",
	"game.yourHand": "Tu mano",
	"signal.button": "Se\u00f1al",
	"signal.sent": "Se\u00f1al enviada",
	"signal.partnerSays": "Compa\u00f1ero se\u00f1ala: {what}",
	"signal.intercepted": "Se\u00f1al interceptada: {what}",
	"signal.ZAP": "Zap (m\u00e1s fuerte)",
	"signal.COPAS": "Manilha de copas",
	"signal.ESPADAS": "Manilha de espadas",
	"signal.OUROS": "Manilha de ouros",
	"signal.THREE": "Tiene 3",
	"signal.TWO": "Tiene 2",
	"signal.ACE": "Tiene As",
	"signal.NOTHING": "Nada bueno",
	"trick.won": "ganada",
	"trick.lost": "perdida",
	"trick.draw": "empate",
	"trick.pending": "pendiente",
	"action.trucoTip": "Subir a 3 pts. El oponente debe aceptar, irse o redoblar.",
	"action.raiseTip": "Redoblar para escalar la apuesta.",
	"action.acceptTip": "Aceptar la apuesta actual y seguir jugando.",
	"score.label": "Marcador: {a} a {b}",
	"trick.label": "Baza {n}: {status}",
};

const translations: Record<Locale, Dict> = { en, pt, es };

export function t(locale: Locale, key: string, params?: Record<string, string | number>): string {
	const dict = translations[locale] ?? translations.en;
	let text = dict[key] ?? translations.en[key] ?? key;
	if (params) {
		for (const [k, v] of Object.entries(params)) {
			text = text.replaceAll(`{${k}}`, String(v));
		}
	}
	return text;
}
