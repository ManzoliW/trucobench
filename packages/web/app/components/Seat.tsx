"use client";

import type { PlayerConfig } from "@/lib/game-manager";
import { type Locale, MODEL_PROVIDERS, getModelProvider, t } from "@/lib/i18n";
import { ProviderBadge } from "./ProviderBadge";

export type SeatState = "empty" | "filled" | "active" | "thinking";

interface Props {
	index: number; // 0=south, 1=west, 2=north, 3=east
	player: PlayerConfig | null;
	state: SeatState;
	countdown?: number | null;
	locale: Locale;
	onTap: () => void;
	onRemove?: () => void;
}

const SEAT_LABELS = ["S", "W", "N", "E"];
const SEAT_NAMES: Record<string, string> = {
	"0": "seat.south",
	"1": "seat.west",
	"2": "seat.north",
	"3": "seat.east",
};

/** Get a display-friendly icon for the player type */
function getPlayerIcon(player: PlayerConfig): string {
	if (player.type === "human") return "\u{1F464}";
	if (player.type === "heuristic") return "\u2699";
	if (player.type === "random") return "\u{1F3B2}";
	return "";
}

function getPlayerDisplayName(player: PlayerConfig, locale: Locale): string {
	if (player.type === "human") return t(locale, "agent.human");
	if (player.type === "random") return t(locale, "agent.random");
	if (player.type === "heuristic") return t(locale, "agent.heuristic");
	return player.name ?? player.model ?? "AI";
}

export function Seat({ index, player, state, countdown, locale, onTap, onRemove }: Props) {
	const teamColor = index % 2 === 0 ? "var(--team-a)" : "var(--team-b)";
	const isHuman = player?.type === "human";

	if (state === "empty" || !player) {
		return (
			<button
				type="button"
				onClick={onTap}
				className="flex flex-col items-center justify-center gap-1 w-20 h-24 sm:w-24 sm:h-28 rounded-xl border-2 border-dashed border-[var(--table-border)] hover:border-[var(--text-dim)] transition-colors cursor-pointer group"
				aria-label={`${t(locale, SEAT_NAMES[index] ?? "seat.south")} — ${t(locale, "seat.tapToFill")}`}
			>
				<span className="text-2xl text-[var(--table-border)] group-hover:text-[var(--text-dim)] transition-colors">
					+
				</span>
				<span className="text-[10px] text-[var(--text-dim)]" data-label>{SEAT_LABELS[index]}</span>
			</button>
		);
	}

	const name = getPlayerDisplayName(player, locale);
	const isLLM = player.type === "llm" && player.model;
	const isBot = player.type === "heuristic" || player.type === "random";

	// Use a wrapper div so remove <button> isn't nested inside another <button>
	return (
		<div className="relative">
			{/* Remove button (pre-game only) — outside the main tap area to avoid nesting */}
			{onRemove && state === "filled" && (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onRemove();
					}}
					className="absolute -top-3 -right-3 w-11 h-11 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text-dim)] text-sm flex items-center justify-center hover:bg-[var(--red)] hover:text-white hover:border-[var(--red)] transition-colors z-10"
					aria-label="Remove player"
				>
					{"\u00d7"}
				</button>
			)}
			<button
				type="button"
				className={`relative flex flex-col items-center justify-center gap-1 w-20 h-24 sm:w-24 sm:h-28 rounded-xl transition-all cursor-pointer border-0 ${
					state === "active"
						? "ring-2 ring-offset-2 ring-offset-[var(--table)]"
						: state === "thinking"
							? "opacity-80"
							: "hover:opacity-80"
				}`}
				style={{
					background: `color-mix(in srgb, ${teamColor} 15%, transparent)`,
					...(state === "active" ? ({ "--tw-ring-color": teamColor } as React.CSSProperties) : {}),
				}}
				onClick={onTap}
			>
				{/* Avatar */}
				<div
					className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border-2 overflow-hidden"
					style={{
						borderColor: teamColor,
						background: `color-mix(in srgb, ${teamColor} 25%, var(--surface))`,
					}}
				>
					{isLLM && <ProviderBadge model={player.model!} size="md" />}
					{isBot && (
						<span
							className="text-lg"
							role="img"
							aria-label={player.type === "heuristic" ? "Heuristic bot" : "Random bot"}
						>
							{getPlayerIcon(player)}
						</span>
					)}
					{isHuman && (
						<span className="text-lg" role="img" aria-label="Human player">
							{getPlayerIcon(player)}
						</span>
					)}
				</div>

				{/* Name */}
				<span
					className="text-[11px] font-semibold truncate max-w-[calc(100%-0.5rem)] text-center"
					style={{ color: teamColor }}
				>
					{name}
				</span>

				{/* Status */}
				{state === "thinking" && (
					<span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-[var(--text-dim)] flex items-center gap-1">
						<span
							className="inline-block w-2.5 h-2.5 border-2 border-[var(--text-dim)] border-t-transparent rounded-full animate-spin"
							aria-hidden="true"
						/>
					</span>
				)}
				{state === "active" && countdown != null && countdown > 0 && (
					<span
						className={`absolute -bottom-1 left-1/2 -translate-x-1/2 text-xs font-bold tabular-nums ${
							countdown <= 10
								? "text-[var(--red)]"
								: countdown <= 20
									? "text-[var(--gold)]"
									: "text-[var(--text-muted)]"
						}`}
						role="timer"
						aria-live="assertive"
						aria-label={`${countdown} seconds remaining`}
					>
						{countdown}s
					</span>
				)}
			</button>
		</div>
	);
}
