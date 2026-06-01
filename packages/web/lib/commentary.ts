import type { Action } from "@trucobench/engine";
import type { Locale } from "./i18n";

interface CommentaryContext {
	seatName: string;
	action: Action;
	locale: Locale;
}

type Template = (ctx: CommentaryContext) => string;

const templates: Record<string, Record<Locale, Template[]>> = {
	TRUCO: {
		en: [
			(c) => `${c.seatName} calls TRUCO! Stakes are rising.`,
			(c) => `Bold move — ${c.seatName} calls TRUCO!`,
			(c) => `${c.seatName} wants to raise the stakes. TRUCO!`,
		],
		pt: [
			(c) => `${c.seatName} pede TRUCO! A aposta sobe.`,
			(c) => `Jogada ousada — ${c.seatName} pede TRUCO!`,
			(c) => `${c.seatName} quer aumentar. TRUCO!`,
		],
		es: [
			(c) => `${c.seatName} canta TRUCO! Suben las apuestas.`,
			(c) => `Jugada audaz — ${c.seatName} canta TRUCO!`,
			(c) => `${c.seatName} quiere subir. TRUCO!`,
		],
		zh: [
			(c) => `${c.seatName}\u53ebTRUCO\uff01\u8d4c\u6ce8\u4e0a\u5347\u3002`,
			(c) => `\u5927\u80c6\u64cd\u4f5c\u2014\u2014${c.seatName}\u53ebTRUCO\uff01`,
			(c) => `${c.seatName}\u8981\u52a0\u6ce8\u3002TRUCO\uff01`,
		],
	},
	RAISE: {
		en: [
			(c) => `${c.seatName} counter-raises! This is getting intense.`,
			(c) => `${c.seatName} isn't backing down — RAISE!`,
		],
		pt: [
			(c) => `${c.seatName} aumenta de volta! Isso est\u00e1 ficando intenso.`,
			(c) => `${c.seatName} n\u00e3o recua — AUMENTO!`,
		],
		es: [
			(c) => `\u00a1${c.seatName} redobla! Esto se pone intenso.`,
			(c) => `${c.seatName} no se rinde — \u00a1REDOBLA!`,
		],
		zh: [
			(c) => `${c.seatName}\u53cd\u52a0\uff01\u8d8a\u6765\u8d8a\u7d27\u5f20\u4e86\u3002`,
			(c) => `${c.seatName}\u4e0d\u9000\u8ba9\u2014\u2014\u52a0\u6ce8\uff01`,
		],
	},
	ACCEPT: {
		en: [(c) => `${c.seatName} accepts the challenge.`, (c) => `${c.seatName} says bring it on.`],
		pt: [(c) => `${c.seatName} aceita o desafio.`, (c) => `${c.seatName} topa a parada.`],
		es: [(c) => `${c.seatName} acepta el desaf\u00edo.`, (c) => `${c.seatName} acepta la apuesta.`],
		zh: [(c) => `${c.seatName}\u63a5\u53d7\u6311\u6218\u3002`, (c) => `${c.seatName}\u8bf4\u653e\u9a6c\u8fc7\u6765\u3002`],
	},
	FOLD: {
		en: [
			(c) => `${c.seatName} folds. Not worth the risk.`,
			(c) => `${c.seatName} backs down and folds.`,
			(c) => `${c.seatName} saw through the bluff... or did they?`,
		],
		pt: [
			(c) => `${c.seatName} corre. N\u00e3o vale o risco.`,
			(c) => `${c.seatName} recua e corre.`,
			(c) => `${c.seatName} percebeu o blefe... ou n\u00e3o?`,
		],
		es: [
			(c) => `${c.seatName} se retira. No vale el riesgo.`,
			(c) => `${c.seatName} retrocede y se va.`,
			(c) => `${c.seatName} vio el bluff... \u00bfo no?`,
		],
		zh: [
			(c) => `${c.seatName}\u5f03\u724c\u4e86\u3002\u4e0d\u503c\u5f97\u5192\u9669\u3002`,
			(c) => `${c.seatName}\u9000\u7f29\u4e86\u3002`,
			(c) => `${c.seatName}\u770b\u7a7f\u4e86\u865a\u5f20\u58f0\u52bf\u2026\u8fd8\u662f\u6ca1\u6709\uff1f`,
		],
	},
	PLAY_CARD: {
		en: [
			(c) => `${c.seatName} plays a card.`,
			(c) => `${c.seatName} makes their move.`,
			(c) => `${c.seatName} drops a card on the table.`,
		],
		pt: [
			(c) => `${c.seatName} joga uma carta.`,
			(c) => `${c.seatName} faz sua jogada.`,
			(c) => `${c.seatName} coloca uma carta na mesa.`,
		],
		es: [
			(c) => `${c.seatName} juega una carta.`,
			(c) => `${c.seatName} hace su jugada.`,
			(c) => `${c.seatName} pone una carta en la mesa.`,
		],
		zh: [
			(c) => `${c.seatName}\u51fa\u4e86\u4e00\u5f20\u724c\u3002`,
			(c) => `${c.seatName}\u884c\u52a8\u4e86\u3002`,
			(c) => `${c.seatName}\u628a\u724c\u653e\u5728\u684c\u4e0a\u3002`,
		],
	},
};

/** Generate a commentary line for a game action */
export function getCommentary(seatName: string, action: Action, locale: Locale): string {
	const actionTemplates = templates[action.type]?.[locale] ?? templates[action.type]?.en;
	if (!actionTemplates || actionTemplates.length === 0) {
		return `${seatName} — ${action.type.toLowerCase()}`;
	}
	const idx = Math.floor(Math.random() * actionTemplates.length);
	return actionTemplates[idx]!({ seatName, action, locale });
}
