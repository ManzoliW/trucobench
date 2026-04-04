import type { Locale } from "./i18n";

export interface ChatPhrase {
	id: string;
	category: "provoke" | "bluff" | "celebrate" | "react" | "encourage";
	text: Record<Locale, string>;
}

export const CHAT_PHRASES: ChatPhrase[] = [
	// Provoke — taunting opponents
	{
		id: "p1",
		category: "provoke",
		text: { en: "Scared?", pt: "Tá com medo?", es: "¿Tienes miedo?" },
	},
	{
		id: "p2",
		category: "provoke",
		text: { en: "Better run!", pt: "Corre que é melhor!", es: "¡Mejor corre!" },
	},
	{
		id: "p3",
		category: "provoke",
		text: { en: "You got nothing!", pt: "Não tem carta não!", es: "¡No tienes nada!" },
	},
	{
		id: "p4",
		category: "provoke",
		text: {
			en: "Accept if you dare!",
			pt: "Aceita se for corajoso!",
			es: "¡Acepta si te atreves!",
		},
	},
	{
		id: "p5",
		category: "provoke",
		text: { en: "Is that all?", pt: "Só isso?", es: "¿Eso es todo?" },
	},

	// Bluff — reinforcing a bluff or fake confidence
	{ id: "b1", category: "bluff", text: { en: "Come at me!", pt: "Pode vir!", es: "¡Ven!" } },
	{
		id: "b2",
		category: "bluff",
		text: { en: "I'm loaded!", pt: "Tenho bala na agulha!", es: "¡Estoy cargado!" },
	},
	{
		id: "b3",
		category: "bluff",
		text: {
			en: "Call truco, I dare you!",
			pt: "Pede truco se for homem!",
			es: "¡Pide truco si te atreves!",
		},
	},
	{
		id: "b4",
		category: "bluff",
		text: { en: "Zap in hand!", pt: "Zap na mão!", es: "¡Zap en mano!" },
	},
	{
		id: "b5",
		category: "bluff",
		text: { en: "You have NO idea...", pt: "Você não faz ideia...", es: "No tienes idea..." },
	},

	// Celebrate — after winning a trick
	{ id: "c1", category: "celebrate", text: { en: "Take that!", pt: "Toma!", es: "¡Toma!" } },
	{
		id: "c2",
		category: "celebrate",
		text: { en: "Too easy!", pt: "Fácil demais!", es: "¡Muy fácil!" },
	},
	{
		id: "c3",
		category: "celebrate",
		text: {
			en: "What were you saving that for?",
			pt: "Guardou pra quê?",
			es: "¿Para qué guardaste eso?",
		},
	},
	{
		id: "c4",
		category: "celebrate",
		text: { en: "Game over!", pt: "Acabou o jogo!", es: "¡Se acabó!" },
	},

	// React — surprise, frustration, acknowledgment
	{ id: "r1", category: "react", text: { en: "Whoa!", pt: "Eita!", es: "¡Epa!" } },
	{ id: "r2", category: "react", text: { en: "Oh no...", pt: "Ih, ferrou...", es: "Ay, no..." } },
	{
		id: "r3",
		category: "react",
		text: { en: "Lucky you!", pt: "Sorte sua!", es: "¡Suerte tuya!" },
	},
	{
		id: "r4",
		category: "react",
		text: { en: "That was free!", pt: "Essa foi de graça!", es: "¡Esa fue gratis!" },
	},
	{ id: "r5", category: "react", text: { en: "Respect.", pt: "Respeito.", es: "Respeto." } },

	// Encourage — supporting partner
	{
		id: "e1",
		category: "encourage",
		text: { en: "Let's go partner!", pt: "Vamo parceiro!", es: "¡Vamos compañero!" },
	},
	{ id: "e2", category: "encourage", text: { en: "Nice one!", pt: "Boa!", es: "¡Buena!" } },
	{
		id: "e3",
		category: "encourage",
		text: { en: "We got this!", pt: "É nossa!", es: "¡Es nuestra!" },
	},
	{
		id: "e4",
		category: "encourage",
		text: { en: "Trust me on this!", pt: "Confia em mim!", es: "¡Confía en mí!" },
	},
];

export function getPhrase(id: string, locale: Locale): string {
	const phrase = CHAT_PHRASES.find((p) => p.id === id);
	return phrase?.text[locale] ?? phrase?.text.en ?? id;
}

export function getPhrasesByCategory(
	locale: Locale,
): Record<string, { id: string; text: string }[]> {
	const categories: Record<string, { id: string; text: string }[]> = {};
	for (const p of CHAT_PHRASES) {
		if (!categories[p.category]) categories[p.category] = [];
		categories[p.category]!.push({ id: p.id, text: p.text[locale] ?? p.text.en });
	}
	return categories;
}
