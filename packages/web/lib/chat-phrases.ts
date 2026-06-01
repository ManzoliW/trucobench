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
		text: { en: "Scared?", pt: "Tá com medo?", es: "¿Tienes miedo?", zh: "\u5bb3\u6015\u4e86\uff1f" },
	},
	{
		id: "p2",
		category: "provoke",
		text: { en: "Better run!", pt: "Corre que é melhor!", es: "¡Mejor corre!", zh: "\u5feb\u8dd1\uff01" },
	},
	{
		id: "p3",
		category: "provoke",
		text: { en: "You got nothing!", pt: "Não tem carta não!", es: "¡No tienes nada!", zh: "\u4f60\u4ec0\u4e48\u90fd\u6ca1\u6709\uff01" },
	},
	{
		id: "p4",
		category: "provoke",
		text: {
			en: "Accept if you dare!",
			pt: "Aceita se for corajoso!",
			es: "¡Acepta si te atreves!",
			zh: "\u6709\u79cd\u5c31\u63a5\uff01",
		},
	},
	{
		id: "p5",
		category: "provoke",
		text: { en: "Is that all?", pt: "Só isso?", es: "¿Eso es todo?", zh: "\u5c31\u8fd9\u6837\uff1f" },
	},

	// Bluff — reinforcing a bluff or fake confidence
	{ id: "b1", category: "bluff", text: { en: "Come at me!", pt: "Pode vir!", es: "¡Ven!", zh: "\u653e\u9a6c\u8fc7\u6765\uff01" } },
	{
		id: "b2",
		category: "bluff",
		text: { en: "I'm loaded!", pt: "Tenho bala na agulha!", es: "¡Estoy cargado!", zh: "\u6211\u624b\u724c\u5f88\u5f3a\uff01" },
	},
	{
		id: "b3",
		category: "bluff",
		text: {
			en: "Call truco, I dare you!",
			pt: "Pede truco se for homem!",
			es: "¡Pide truco si te atreves!",
			zh: "\u6709\u79cd\u53ebTruco\uff01",
		},
	},
	{
		id: "b4",
		category: "bluff",
		text: { en: "Zap in hand!", pt: "Zap na mão!", es: "¡Zap en mano!", zh: "Zap\u5728\u624b\uff01" },
	},
	{
		id: "b5",
		category: "bluff",
		text: { en: "You have NO idea...", pt: "Você não faz ideia...", es: "No tienes idea...", zh: "\u4f60\u4e0d\u77e5\u9053\u2026" },
	},

	// Celebrate — after winning a trick
	{ id: "c1", category: "celebrate", text: { en: "Take that!", pt: "Toma!", es: "¡Toma!", zh: "\u63a5\u62db\uff01" } },
	{
		id: "c2",
		category: "celebrate",
		text: { en: "Too easy!", pt: "Fácil demais!", es: "¡Muy fácil!", zh: "\u592a\u7b80\u5355\uff01" },
	},
	{
		id: "c3",
		category: "celebrate",
		text: {
			en: "What were you saving that for?",
			pt: "Guardou pra quê?",
			es: "¿Para qué guardaste eso?",
			zh: "\u7559\u7740\u5e72\u561b\uff1f",
		},
	},
	{
		id: "c4",
		category: "celebrate",
		text: { en: "Game over!", pt: "Acabou o jogo!", es: "¡Se acabó!", zh: "\u7ed3\u675f\u4e86\uff01" },
	},

	// React — surprise, frustration, acknowledgment
	{ id: "r1", category: "react", text: { en: "Whoa!", pt: "Eita!", es: "¡Epa!", zh: "\u54c7\uff01" } },
	{ id: "r2", category: "react", text: { en: "Oh no...", pt: "Ih, ferrou...", es: "Ay, no...", zh: "\u7cdf\u7cd5\u2026" } },
	{
		id: "r3",
		category: "react",
		text: { en: "Lucky you!", pt: "Sorte sua!", es: "¡Suerte tuya!", zh: "\u4f60\u8fd0\u6c14\u771f\u597d\uff01" },
	},
	{
		id: "r4",
		category: "react",
		text: { en: "That was free!", pt: "Essa foi de graça!", es: "¡Esa fue gratis!", zh: "\u767d\u9001\u7684\uff01" },
	},
	{ id: "r5", category: "react", text: { en: "Respect.", pt: "Respeito.", es: "Respeto.", zh: "\u670d\u3002" } },

	// Encourage — supporting partner
	{
		id: "e1",
		category: "encourage",
		text: { en: "Let's go partner!", pt: "Vamo parceiro!", es: "¡Vamos compañero!", zh: "\u52a0\u6cb9\u642d\u6863\uff01" },
	},
	{ id: "e2", category: "encourage", text: { en: "Nice one!", pt: "Boa!", es: "¡Buena!", zh: "\u6f02\u4eae\uff01" } },
	{
		id: "e3",
		category: "encourage",
		text: { en: "We got this!", pt: "É nossa!", es: "¡Es nuestra!", zh: "\u7a33\u4e86\uff01" },
	},
	{
		id: "e4",
		category: "encourage",
		text: { en: "Trust me on this!", pt: "Confia em mim!", es: "¡Confía en mí!", zh: "\u76f8\u4fe1\u6211\uff01" },
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
