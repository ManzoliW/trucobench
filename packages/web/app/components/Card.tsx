"use client";

import type { Card as CardType } from "@trucobench/engine";
import { useEffect, useMemo, useState } from "react";

const SUITS: Record<string, { symbol: string; color: string; name: string }> = {
	ouros: { symbol: "\u2666", color: "var(--suit-ouros)", name: "Ouros" },
	espadas: { symbol: "\u2660", color: "var(--suit-espadas)", name: "Espadas" },
	copas: { symbol: "\u2665", color: "var(--suit-copas)", name: "Copas" },
	paus: { symbol: "\u2663", color: "var(--suit-paus)", name: "Paus" },
};

interface CardProps {
	card: CardType;
	isManilha?: boolean;
	onClick?: () => void;
	disabled?: boolean;
	small?: boolean;
	/** When true, card starts face-down then flips to reveal. */
	flipIn?: boolean;
	testId?: string;
}

export function Card({ card, isManilha, onClick, disabled, small, flipIn, testId }: CardProps) {
	const suit = SUITS[card.suit] ?? { symbol: "?", color: "var(--border)", name: card.suit };
	const suitStyle = useMemo(() => ({ color: suit.color }), [suit.color]);
	const interactive = onClick && !disabled;
	const label = `${card.rank} of ${suit.name}${isManilha ? ", Manilha" : ""}`;

	// Flip animation: start face-down, flip after mount
	const [flipped, setFlipped] = useState(!flipIn);
	useEffect(() => {
		if (flipIn) {
			const timer = setTimeout(() => setFlipped(true), 50);
			return () => clearTimeout(timer);
		}
	}, [flipIn]);

	const face = (
		<button
			onClick={onClick}
			disabled={disabled || !onClick}
			aria-label={label}
			title={label}
			data-testid={testId}
			data-card-rank={card.rank}
			data-card-suit={card.suit}
			data-manilha={isManilha ? "true" : undefined}
			className={`
				card-size ${small ? "card-sm" : "card-lg"}
				relative rounded-md flex flex-col items-center justify-center
				select-none transition-transform duration-150
				bg-[var(--card-face)] border border-[var(--card-border)]
				shadow-sm
				${isManilha ? "ring-2 ring-[var(--gold)] ring-offset-1 ring-offset-[var(--bg)]" : ""}
				${interactive ? "hover:-translate-y-1.5 hover:shadow-md cursor-pointer active:translate-y-0" : ""}
				${disabled ? "opacity-40" : ""}
			`}
		>
			<div
				className={`absolute top-0.5 left-1 flex flex-col items-center leading-none ${small ? "text-[11px] sm:text-xs" : "text-[11px] sm:text-xs"}`}
			>
				<span className="font-bold" style={suitStyle}>
					{card.rank}
				</span>
				<span style={suitStyle}>{suit.symbol}</span>
			</div>
			<span
				className={small ? "text-lg sm:text-xl" : "text-2xl sm:text-3xl"}
				style={suitStyle}
			>
				{suit.symbol}
			</span>
			<div
				className={`absolute bottom-0.5 right-1 flex flex-col items-center leading-none rotate-180 ${small ? "text-[11px] sm:text-xs" : "text-[11px] sm:text-xs"}`}
			>
				<span className="font-bold" style={suitStyle}>
					{card.rank}
				</span>
				<span style={suitStyle}>{suit.symbol}</span>
			</div>
			{isManilha && (
				<div
					className={`absolute ${small ? "-top-1 -right-1 w-3.5 h-3.5 text-[8px]" : "-top-1.5 -right-1.5 w-4 h-4 text-[9px]"} bg-[var(--gold)] text-white rounded-full flex items-center justify-center font-bold`}
					aria-label="Manilha"
				>
					M
				</div>
			)}
		</button>
	);

	if (!flipIn) return face;

	return (
		<div className={`card-flip-container ${small ? "card-sm" : "card-lg"}`}>
			<div className={`card-flip-inner ${flipped ? "" : "flipped"}`}>
				<div className="card-flip-front">{face}</div>
				<div className="card-flip-back">
					<CardBack small={small} />
				</div>
			</div>
		</div>
	);
}

export function CardBack({ small }: { small?: boolean }) {
	return (
		<div
			role="img"
			aria-label="Face-down card"
			className={`card-size ${small ? "card-sm" : "card-lg"} rounded-md border border-[var(--border)] bg-[var(--accent)] flex items-center justify-center shadow-sm`}
		>
			<div
				className={`${small ? "w-5 h-7" : "w-7 h-10"} rounded-sm border border-white/20 bg-white/10`}
			/>
		</div>
	);
}
