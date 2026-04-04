"use client";

import { CHAT_PHRASES } from "@/lib/chat-phrases";
import type { GameConfig, GameSnapshot } from "@/lib/game-manager";
import { type Locale, t } from "@/lib/i18n";
import * as Sfx from "@/lib/sounds";
import type {
	Action,
	Card as CardType,
	FourPlayerObservation,
	Observation,
	SeatId,
} from "@trucobench/engine";
import { ActionType, isManilha as checkManilha, teamOf } from "@trucobench/engine";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardBack } from "./Card";
import { ProviderBadge } from "./ProviderBadge";

interface LogEntry {
	seat: number;
	action: Action;
	reasoning?: string;
}
interface Props {
	gameId: string;
	config: GameConfig;
	onNewGame: () => void;
	locale: Locale;
}

const SEAT_ANIM: Record<number, string> = {
	0: "anim-from-south",
	1: "anim-from-west",
	2: "anim-from-north",
	3: "anim-from-east",
};
const SEAT_COLORS = ["var(--seat-0)", "var(--seat-1)", "var(--seat-2)", "var(--seat-3)"];
const SEAT_POS = ["S", "W", "N", "E"];

/** Build locale-aware display names for each seat */
function getLocalizedSeatNames(config: GameConfig, locale: Locale): string[] {
	const raw = config.players.map((p) => {
		if (p.type === "human") return t(locale, "agent.you");
		if (p.type === "random") return t(locale, "agent.random");
		if (p.type === "heuristic") return t(locale, "agent.heuristic");
		if (p.type === "llm") return p.name ?? p.model ?? "AI";
		return "AI";
	});
	const counts = new Map<string, number>();
	for (const n of raw) counts.set(n, (counts.get(n) ?? 0) + 1);
	return raw.map((n, i) => (counts.get(n)! > 1 ? `${n} (${SEAT_POS[i]})` : n));
}

export function GameBoard({ gameId, config, onNewGame, locale }: Props) {
	const [snap, setSnap] = useState<GameSnapshot | null>(null);
	const [log, setLog] = useState<LogEntry[]>([]);
	const [waitHuman, setWaitHuman] = useState(false);
	const [over, setOver] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [roundPaused, setRoundPaused] = useState(false);
	const [scoreAnim, setScoreAnim] = useState(false);
	const [shaking, setShaking] = useState(false);
	const shakeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	const [speed, setSpeed] = useState(1);
	const [foldConfirm, setFoldConfirm] = useState(false);
	const [showLog, setShowLog] = useState(() => config.players.every((p) => p.type !== "human"));
	const [submitting, setSubmitting] = useState(false);
	const [disconnected, setDisconnected] = useState(false);
	const [signalToasts, setSignalToasts] = useState<
		{ id: number; text: string; style: "partner" | "intercepted" | "sent" }[]
	>([]);
	const [showSignalPanel, setShowSignalPanel] = useState(false);
	const [countdown, setCountdown] = useState<number | null>(null);
	const countdownRef = useRef<ReturnType<typeof setInterval>>(undefined);
	const [chatBubbles, setChatBubbles] = useState<
		{ id: number; seat: number; name: string; text: string }[]
	>([]);
	const [showPhrases, setShowPhrases] = useState(false);
	const signalIdRef = useRef(0);
	const logRef = useRef<HTMLDivElement>(null);
	const scoreTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	const seatNames = useMemo(() => getLocalizedSeatNames(config, locale), [config, locale]);

	// SSE connection with reconnection
	useEffect(() => {
		let es: EventSource | null = null;
		let retryCount = 0;
		let closed = false;

		function connect() {
			if (closed) return;
			es = new EventSource(`/api/game/${gameId}/stream`);

			es.onopen = () => {
				retryCount = 0;
				setDisconnected(false);
			};

			es.onmessage = (e) => {
				const msg = JSON.parse(e.data) as { type: string; data?: unknown };
				if (msg.type === "done") {
					es?.close();
					return;
				}
				if (msg.type === "state") {
					setSnap(msg.data as GameSnapshot);
					Sfx.playShuffle();
				}
				if (msg.type === "action") {
					const entry = msg.data as LogEntry;
					setLog((p) => [...p, entry]);
					setFoldConfirm(false);
					setSubmitting(false);
					// Sound based on action type
					if (entry.action.type === ActionType.PLAY_CARD) Sfx.playCardPlace();
					else if (entry.action.type === ActionType.TRUCO) {
						Sfx.playTruco();
						setShaking(true);
						clearTimeout(shakeTimerRef.current);
						shakeTimerRef.current = setTimeout(() => setShaking(false), 450);
					} else if (entry.action.type === ActionType.RAISE) {
						Sfx.playRaise();
						setShaking(true);
						clearTimeout(shakeTimerRef.current);
						shakeTimerRef.current = setTimeout(() => setShaking(false), 450);
					} else if (entry.action.type === ActionType.ACCEPT) Sfx.playAccept();
					else if (entry.action.type === ActionType.FOLD) Sfx.playFold();
				}
				if (msg.type === "waiting_human") {
					setWaitHuman(true);
					setSubmitting(false);
					const hData = msg.data as { seat: number; timeoutMs?: number };
					if (hData.timeoutMs && hData.timeoutMs > 0) {
						setCountdown(Math.ceil(hData.timeoutMs / 1000));
					} else {
						setCountdown(null);
					}
				}
				if (msg.type === "timeout") {
					setCountdown(null);
					setWaitHuman(false);
				}
				if (msg.type === "round_end") {
					const d = msg.data as { scores: [number, number] };
					setSnap((p) => (p ? { ...p, scores: d.scores } : p));
					setScoreAnim(true);
					Sfx.playRoundWin();
					clearTimeout(scoreTimerRef.current);
					scoreTimerRef.current = setTimeout(() => setScoreAnim(false), 500);
				}
				if (msg.type === "round_pause") setRoundPaused(true);
				if (msg.type === "game_end") {
					const d = msg.data as { winner: number; scores: [number, number] };
					setSnap((p) => (p ? { ...p, winner: d.winner, scores: d.scores } : p));
					setOver(true);
					// Play win or loss sound based on human seat
					const humanIdx = config.players.findIndex((p) => p.type === "human");
					if (humanIdx >= 0) {
						const humanTeam = humanIdx % 2;
						if (d.winner === humanTeam) Sfx.playGameWin();
						else Sfx.playGameLoss();
					} else {
						Sfx.playGameWin(); // spectator mode
					}
				}
				if (msg.type === "error") setError((msg.data as { error: string }).error);
				// Signal events — only show to the relevant seat
				const sigData = msg.data as {
					forSeat?: number;
					signal?: { type: string; fromSeat: number };
				};
				const mySeat = config.players.findIndex((p) => p.type === "human");
				if (sigData.forSeat === mySeat) {
					if (msg.type === "signal_received" && sigData.signal) {
						const label = t(locale, `signal.${sigData.signal.type}`);
						addSignalToast(t(locale, "signal.partnerSays", { what: label }), "partner");
						Sfx.playSignal();
					}
					if (msg.type === "signal_intercepted" && sigData.signal) {
						const label = t(locale, `signal.${sigData.signal.type}`);
						addSignalToast(t(locale, "signal.intercepted", { what: label }), "intercepted");
						Sfx.playSignal();
					}
				}
				if (msg.type === "signal_sent" && sigData.forSeat === mySeat) {
					addSignalToast(t(locale, "signal.sent"), "sent");
					setShowSignalPanel(false);
					Sfx.playSignal();
				}
				if (msg.type === "chat") {
					const chatMsg = msg.data as { seat: number; name: string; text: string };
					setChatBubbles((prev) => [
						...prev.slice(-4),
						{ id: Date.now() + Math.random(), ...chatMsg },
					]);
					Sfx.playChatPing();
				}
			};

			es.onerror = () => {
				es?.close();
				if (closed) return;
				setDisconnected(true);
				const delay = Math.min(1000 * 2 ** retryCount, 15000);
				retryCount++;
				setTimeout(connect, delay);
			};
		}

		connect();

		fetch(`/api/game/${gameId}`)
			.then((r) => {
				if (r.ok) return r.json();
				return null;
			})
			.then((d) => {
				if (d) setSnap(d as GameSnapshot);
			})
			.catch(() => {
				/* SSE will provide state */
			});

		return () => {
			closed = true;
			es?.close();
			clearTimeout(scoreTimerRef.current);
		};
	}, [gameId]);

	useEffect(() => {
		logRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [log]);

	// Auto-remove signal toasts after animation completes
	useEffect(() => {
		if (signalToasts.length === 0) return;
		const timer = setTimeout(() => {
			setSignalToasts((prev) => prev.slice(1));
		}, 3600);
		return () => clearTimeout(timer);
	}, [signalToasts]);

	// Countdown timer tick
	useEffect(() => {
		clearInterval(countdownRef.current);
		if (countdown === null || countdown <= 0) return;
		countdownRef.current = setInterval(() => {
			setCountdown((prev) => {
				if (prev === null || prev <= 1) {
					clearInterval(countdownRef.current);
					return null;
				}
				return prev - 1;
			});
		}, 1000);
		return () => clearInterval(countdownRef.current);
	}, [countdown !== null]); // Only restart when countdown starts/stops, not every tick

	// Auto-remove chat bubbles after animation ends (4.6s)
	useEffect(() => {
		if (chatBubbles.length === 0) return;
		const timer = setTimeout(() => {
			setChatBubbles((prev) => prev.slice(1));
		}, 4700);
		return () => clearTimeout(timer);
	}, [chatBubbles]);

	function addSignalToast(text: string, style: "partner" | "intercepted" | "sent") {
		const id = ++signalIdRef.current;
		setSignalToasts((prev) => [...prev.slice(-2), { id, text, style }]);
	}

	const doSendSignal = useCallback(
		async (signalType: string) => {
			const seat = config.players.findIndex((p) => p.type === "human");
			if (seat < 0) return;
			try {
				await fetch(`/api/game/${gameId}/signal`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ seat, type: signalType }),
				});
			} catch {
				/* non-critical */
			}
		},
		[gameId, config],
	);

	const doSendChat = useCallback(
		async (text: string) => {
			const seat = config.players.findIndex((p) => p.type === "human");
			if (seat < 0) return;
			setShowPhrases(false);
			try {
				await fetch(`/api/game/${gameId}/chat`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ seat, text }),
				});
			} catch {
				/* non-critical */
			}
		},
		[gameId, config],
	);

	const submit = useCallback(
		async (action: Action) => {
			if (submitting) return;
			setSubmitting(true);
			setWaitHuman(false);
			setFoldConfirm(false);
			setCountdown(null);
			try {
				const res = await fetch(`/api/game/${gameId}/action`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(action),
				});
				if (!res.ok) {
					// Backend wasn't ready — restore turn state so user can retry
					setWaitHuman(true);
					setSubmitting(false);
				}
			} catch {
				// Network error — restore turn state so user can retry
				setWaitHuman(true);
				setSubmitting(false);
			}
		},
		[gameId, submitting],
	);

	const changeSpeed = useCallback(
		async (s: number) => {
			setSpeed(s);
			try {
				await fetch(`/api/game/${gameId}/speed`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ speed: s }),
				});
			} catch {
				/* non-critical */
			}
		},
		[gameId],
	);

	const continueRound = useCallback(async () => {
		setRoundPaused(false);
		try {
			await fetch(`/api/game/${gameId}/continue`, { method: "POST" });
		} catch {
			setRoundPaused(true);
		}
	}, [gameId]);

	if (!snap)
		return (
			<div
				className="flex items-center justify-center h-full"
				data-ui
				role="status"
				aria-live="polite"
			>
				<p className="text-[var(--text-muted)]">{t(locale, "game.shuffling")}</p>
			</div>
		);

	const is4p = snap.mode === "4p";
	const humanSeat = config.players.findIndex((p) => p.type === "human");
	const myObs = snap.observations?.length
		? ((humanSeat >= 0 ? snap.observations[humanSeat] : snap.observations[0]) ?? null)
		: null;
	const isMyTurn = waitHuman && snap.currentSeat !== null && !submitting;
	const spectating = humanSeat < 0;

	return (
		<div className={`flex flex-col md:grid md:grid-cols-12 gap-2 md:gap-3 h-full ${shaking ? "anim-shake" : ""}`} data-ui>
			<main className="md:col-span-8 flex flex-col gap-2 lg:gap-3 min-h-0 flex-1">
				{/* Disconnected banner */}
				{disconnected && (
					<div
						className="bg-[var(--red)]/15 border border-[var(--red)]/30 rounded-lg px-3 py-1.5 text-center"
						role="alert"
					>
						<span className="text-xs text-[var(--red)]">{t(locale, "game.disconnected")}</span>
					</div>
				)}

				{/* Score bar */}
				<div
					className="flex items-center justify-between bg-[var(--surface)] rounded-lg px-3 sm:px-5 py-2 border border-[var(--border)]"
					role="status"
					aria-live="polite"
				>
					<TeamLabel
						seatNames={seatNames}
						config={config}
						team={0}
						active={
							snap.currentSeat !== null &&
							(is4p ? teamOf(snap.currentSeat as SeatId) === 0 : snap.currentSeat === 0)
						}
						humanSeat={humanSeat}
						locale={locale}
					/>
					<div className="text-center min-w-0">
						<div
							className={`text-xl sm:text-2xl font-bold tabular-nums font-display ${scoreAnim ? "anim-score" : ""}`}
							aria-label={t(locale, "score.label", { a: snap.scores[0], b: snap.scores[1] })}
						>
							{snap.scores[0]} <span className="text-[var(--text-dim)]">&ndash;</span>{" "}
							{snap.scores[1]}
						</div>
						<span className="text-[9px] sm:text-[10px] text-[var(--text-dim)]">
							{t(locale, "game.round", { n: snap.roundNumber })}
						</span>
					</div>
					<TeamLabel
						seatNames={seatNames}
						config={config}
						team={1}
						active={
							snap.currentSeat !== null &&
							(is4p ? teamOf(snap.currentSeat as SeatId) === 1 : snap.currentSeat === 1)
						}
						humanSeat={humanSeat}
						locale={locale}
					/>
				</div>

				{/* Table */}
				<div
					className="flex-1 min-h-[200px] sm:min-h-[280px] bg-[var(--table)] rounded-lg border border-[var(--table-border)] relative flex items-center justify-center overflow-hidden"
					role="region"
					aria-label="Game table"
				>
					{/* Signal toasts */}
					{signalToasts.length > 0 && (
						<div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex flex-col gap-1 items-center pointer-events-none" role="log" aria-live="polite" aria-label="Game signals">
							{signalToasts.map((toast) => (
								<div
									key={toast.id}
									className={`anim-signal px-3 py-1.5 rounded-lg text-xs font-semibold shadow-lg whitespace-nowrap ${
										toast.style === "partner"
											? "bg-[var(--team-a)] text-white"
											: toast.style === "intercepted"
												? "bg-[var(--red)] text-white"
												: "bg-[var(--surface-3)] text-[var(--text-muted)]"
									}`}
								>
									{toast.text}
								</div>
							))}
						</div>
					)}
					{/* Chat bubbles */}
					{chatBubbles.length > 0 && (
						<div className="absolute bottom-12 sm:bottom-14 right-2 sm:right-3 z-20 flex flex-col gap-1.5 items-end pointer-events-none max-w-[min(220px,40vw)]" role="log" aria-live="polite" aria-label="Game chat">
							{chatBubbles.map((bubble) => (
								<div
									key={bubble.id}
									className="anim-chat px-3 py-2 rounded-lg text-xs shadow-lg bg-[var(--surface)] border border-[var(--border)]"
								>
									<span
										className="font-semibold mr-1"
										style={{ color: SEAT_COLORS[bubble.seat % 4] }}
									>
										{bubble.name}:
									</span>
									<span className="text-[var(--text)]">{bubble.text}</span>
								</div>
							))}
						</div>
					)}
					{is4p ? (
						<FourPTable
							snap={snap}
							humanSeat={humanSeat}
							seatNames={seatNames}
							config={config}
							locale={locale}
						/>
					) : (
						<TwoPTable
							snap={snap}
							humanSeat={humanSeat}
							seatNames={seatNames}
							config={config}
							locale={locale}
						/>
					)}

					{myObs && "vira" in myObs && (
						<div className="absolute top-2 left-2 sm:top-3 sm:left-3 flex flex-col items-center gap-0.5 anim-deal">
							<span className="text-[8px] sm:text-[9px] text-[var(--text-muted)]">
								{t(locale, "game.vira")}
							</span>
							<Card card={myObs.vira} small />
						</div>
					)}

					{/* Trick dots */}
					{myObs && "tricks" in myObs && (
						<div
							className="absolute top-2 sm:top-3 left-1/2 -translate-x-1/2 flex gap-1 sm:gap-1.5"
							role="status"
							aria-label="Tricks this round"
						>
							{[0, 1, 2].map((i) => {
								const trickData = (myObs as Observation | FourPlayerObservation).tricks?.[i];
								const myTeam =
									humanSeat >= 0 ? (is4p ? teamOf(humanSeat as SeatId) : humanSeat) : 0;
								let cls = "bg-[var(--table-border)] text-transparent";
								let sym = "\u2013";
								let label = t(locale, "trick.pending");
								if (trickData) {
									const won = is4p
										? (trickData as FourPlayerObservation["tricks"][0]).winningTeam === myTeam
										: trickData.winner === myTeam;
									const draw = is4p
										? (trickData as FourPlayerObservation["tricks"][0]).winningTeam === null
										: trickData.winner === null;
									cls = draw
										? "bg-[var(--gold-dim)] text-white"
										: won
											? "bg-[var(--green-light)] text-white"
											: "bg-[var(--red)] text-white";
									sym = draw ? "\u2013" : won ? "\u2713" : "\u2717";
									label = draw
										? t(locale, "trick.draw")
										: won
											? t(locale, "trick.won")
											: t(locale, "trick.lost");
								}
								return (
									<div
										key={i}
										className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full ${cls} transition-colors duration-300 flex items-center justify-center text-[7px] sm:text-[8px] font-bold leading-none ${trickData ? "anim-score" : ""}`}
										aria-label={t(locale, "trick.label", { n: i + 1, status: label })}
									>
										{sym}
									</div>
								);
							})}
						</div>
					)}

					{myObs && "escalation" in myObs && myObs.escalation.level !== "NORMAL" && (
						<div className="absolute top-2 right-2 sm:top-3 sm:right-3 bg-[var(--surface)]/80 border border-[var(--border)] rounded px-2 py-0.5 anim-escalation-badge">
							<span className="text-[var(--gold)] text-[10px] sm:text-xs font-bold">
								{myObs.escalation.level}
							</span>
						</div>
					)}

					{myObs && "escalation" in myObs && myObs.escalation.pendingRequest && (
						<div
							className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--accent)]/25 border-2 border-[var(--accent)]/50 rounded-xl px-4 sm:px-6 py-2 sm:py-3 z-[5] anim-callout"
							role="alert"
						>
							<span className="text-[var(--accent-light)] font-bold text-lg sm:text-xl">
								{myObs.escalation.pendingRequest}!
							</span>
						</div>
					)}

					{myObs && "maoDeOnze" in myObs && myObs.maoDeOnze && (
						<div
							className="absolute bottom-16 sm:bottom-20 left-1/2 -translate-x-1/2 bg-[var(--gold)]/15 border border-[var(--gold)]/30 rounded-lg px-3 sm:px-4 py-1 sm:py-1.5 anim-callout"
							role="alert"
						>
							<span className="text-[var(--gold)] font-bold text-xs sm:text-sm">
								{t(locale, "game.maoDeOnze")}
							</span>
						</div>
					)}

					{roundPaused && (
						<Overlay>
							<div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-6 sm:px-8 py-4 sm:py-5 text-center anim-fade mx-4">
								<p className="text-sm text-[var(--text-muted)] mb-1">
									{t(locale, "game.roundComplete")}
								</p>
								<p className="text-lg sm:text-xl font-bold tabular-nums mb-3 sm:mb-4 font-display">
									{snap.scores[0]} &ndash; {snap.scores[1]}
								</p>
								<button
									type="button"
									onClick={continueRound}
									className="px-5 sm:px-6 py-2 bg-[var(--accent)] text-white rounded font-semibold text-sm min-h-[44px] hover:bg-[var(--accent-light)] active:scale-[0.98] transition-colors"
								>
									{t(locale, "game.nextRound")}
								</button>
							</div>
						</Overlay>
					)}

					{error && (
						<Overlay>
							<ErrorBox
								message={error}
								onBack={onNewGame}
								onRetry={() => setError(null)}
								locale={locale}
							/>
						</Overlay>
					)}
					{!error && !roundPaused && over && snap.winner !== null && (
						<Overlay>
							<WinBox
								snap={snap}
								humanSeat={humanSeat}
								seatNames={seatNames}
								onNewGame={onNewGame}
								locale={locale}
							/>
						</Overlay>
					)}
				</div>

				{/* Hand + actions */}
				<section
					className="bg-[var(--surface)] rounded-lg border border-[var(--border)] px-3 sm:px-4 py-2 sm:py-3"
					aria-label={t(locale, "game.yourHand")}
				>
					<div className="flex items-center justify-between gap-2 sm:gap-4 flex-wrap">
						<div className="flex gap-1.5 sm:gap-2 min-w-0">
							{myObs &&
								"hand" in myObs &&
								myObs.hand.map((card, i) => (
									<div key={`${card.rank}-${card.suit}`} className={`anim-deal deal-${i}`}>
										<Card
											card={card}
											isManilha={checkManilha(card, myObs.vira)}
											flipIn
											onClick={
												isMyTurn &&
												myObs.legalActions.some(
													(a) => a.type === "PLAY_CARD" && "cardIndex" in a && a.cardIndex === i,
												)
													? () => submit({ type: "PLAY_CARD", cardIndex: i })
													: undefined
											}
											disabled={!isMyTurn || submitting}
										/>
									</div>
								))}
						</div>
						<div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
							{/* Turn countdown */}
							{countdown !== null && countdown > 0 && isMyTurn && (
								<span
									className={`text-sm font-bold tabular-nums min-w-[32px] text-center ${
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
							{isMyTurn && myObs && "legalActions" in myObs ? (
								myObs.legalActions
									.filter((a) => a.type !== "PLAY_CARD")
									.map((a) => {
										if (a.type === ActionType.FOLD) {
											return foldConfirm ? (
												<button
													type="button"
													key="fold-c"
													onClick={() => submit(a)}
													disabled={submitting}
													className="px-3 sm:px-4 py-2 rounded text-sm font-semibold bg-[var(--red)] text-white min-h-[44px] disabled:opacity-50 hover:opacity-90 transition-opacity"
												>
													{t(locale, "game.foldConfirm")}
												</button>
											) : (
												<button
													type="button"
													key="fold"
													onClick={() => setFoldConfirm(true)}
													disabled={submitting}
													className="px-2.5 sm:px-3 py-2 rounded text-xs text-[var(--text-dim)] border border-[var(--border)] min-h-[44px] disabled:opacity-50 hover:text-[var(--text-muted)] hover:border-[var(--border-light)] transition-colors"
												>
													{t(locale, "game.fold")}
												</button>
											);
										}
										return (
											<button
												type="button"
												key={a.type}
												onClick={() => submit(a)}
												disabled={submitting}
												title={actionTooltip(a.type, locale)}
												className={`px-3 sm:px-4 py-2 rounded text-sm font-semibold transition-transform min-h-[44px] disabled:opacity-50 ${btnStyle(a.type)}`}
											>
												{a.type}
											</button>
										);
									})
							) : spectating ? (
								<SpeedControl speed={speed} onChange={changeSpeed} locale={locale} />
							) : humanSeat >= 0 &&
								!over &&
								snap.currentSeat !== null &&
								snap.currentSeat !== humanSeat ? (
								<ThinkingIndicator who={seatNames[snap.currentSeat] ?? "AI"} locale={locale} />
							) : null}
						</div>
					</div>
					{/* Signal panel — 4P mode with human player */}
					{is4p && humanSeat >= 0 && !over && (
						<SignalPanel
							showPanel={showSignalPanel}
							onToggle={() => setShowSignalPanel((p) => !p)}
							onSend={doSendSignal}
							hand={myObs && "hand" in myObs ? myObs.hand : []}
							vira={myObs && "vira" in myObs ? myObs.vira : null}
							locale={locale}
						/>
					)}
					{/* Chat phrases — quick-select trash talk */}
					{humanSeat >= 0 && !over && (
						<ChatPhraseBar
							showPhrases={showPhrases}
							onToggle={() => setShowPhrases((p) => !p)}
							onSend={doSendChat}
							locale={locale}
						/>
					)}
				</section>
			</main>

			{/* Sidebar */}
			<aside
				className={`md:col-span-4 bg-[var(--surface)] rounded-lg border border-[var(--border)] flex flex-col ${showLog ? "flex-1 min-h-[200px]" : "hidden"} md:min-h-0`}
				aria-label={t(locale, "game.log")}
			>
				<div className="px-3 sm:px-4 py-2 border-b border-[var(--border)] flex items-center justify-between">
					<h3 className="text-sm font-semibold">{t(locale, "game.log")}</h3>
					<div className="flex items-center gap-2">
						{spectating && (
							<SpeedControl speed={speed} onChange={changeSpeed} compact locale={locale} />
						)}
						<button
							type="button"
							onClick={() => setShowLog(false)}
							className="text-[11px] text-[var(--text-dim)] min-h-[44px] px-2"
						>
							{t(locale, "game.logClose")}
						</button>
					</div>
				</div>
				<div className="flex-1 overflow-y-auto px-2 sm:px-3 py-2 space-y-1 min-h-0">
					{log.length === 0 && (
						<p className="text-[var(--text-dim)] text-xs text-center py-4 sm:py-6">
							{t(locale, "game.waitingFirst")}
						</p>
					)}
					{log.map((entry, i) => (
						<LogEntryRow
							key={i}
							entry={entry}
							name={seatNames[entry.seat] ?? `Seat ${entry.seat}`}
							config={config}
							locale={locale}
						/>
					))}
					<div ref={logRef} />
				</div>
			</aside>

			{!showLog && (
				<button
					type="button"
					onClick={() => setShowLog(true)}
					className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] bg-[var(--surface)] border border-[var(--border)] rounded-full w-11 h-11 flex items-center justify-center text-xs text-[var(--text-muted)] shadow-lg z-20"
					aria-label={`${t(locale, "game.log")} (${log.length})`}
				>
					{log.length}
				</button>
			)}
		</div>
	);
}

/* ── Table layouts ── */

const TwoPTable = memo(function TwoPTable({
	snap,
	humanSeat,
	seatNames,
	config,
	locale,
}: {
	snap: GameSnapshot;
	humanSeat: number;
	seatNames: string[];
	config: GameConfig;
	locale: Locale;
}) {
	const oppSeat = humanSeat === 0 ? 1 : humanSeat === 1 ? 0 : 1;
	const myObs = snap.observations?.[humanSeat >= 0 ? humanSeat : 0] as Observation | null;
	const isActive = snap.currentSeat === oppSeat;
	const oppPlayer = config.players[oppSeat];
	return (
		<div className="flex flex-col items-center gap-4 sm:gap-6">
			<div
				className={`flex flex-col items-center gap-1 p-1.5 sm:p-2 rounded-lg ${isActive ? "anim-active" : ""}`}
			>
				<div className="flex items-center gap-1">
					{oppPlayer?.type === "llm" && oppPlayer.model && (
						<ProviderBadge model={oppPlayer.model} />
					)}
					<span className="text-[9px] sm:text-[10px] text-[var(--text-muted)] truncate max-w-[120px]">
						{seatNames[oppSeat]}
					</span>
				</div>
				<div className="flex gap-1 sm:gap-1.5">
					{Array.from({ length: myObs?.opponentCardCount ?? 3 }).map((_, i) => (
						<div key={i} className={`anim-deal deal-${i}`}>
							<CardBack small />
						</div>
					))}
				</div>
			</div>
			{myObs?.currentTrick.firstCard && (
				<div
					className={`flex flex-col items-center gap-1 ${SEAT_ANIM[myObs.currentTrick.firstPlayer === (humanSeat >= 0 ? humanSeat : 0) ? 0 : 2] ?? "anim-fade"}`}
				>
					<Card card={myObs.currentTrick.firstCard} />
					<span className="text-[8px] sm:text-[9px] text-[var(--text-dim)] truncate max-w-[100px]">
						{
							seatNames[
								myObs.currentTrick.firstPlayer === (humanSeat >= 0 ? humanSeat : 0)
									? humanSeat >= 0
										? humanSeat
										: 0
									: oppSeat
							]
						}
					</span>
				</div>
			)}
		</div>
	);
});

const FourPTable = memo(function FourPTable({
	snap,
	humanSeat,
	seatNames,
	config,
	locale,
}: {
	snap: GameSnapshot;
	humanSeat: number;
	seatNames: string[];
	config: GameConfig;
	locale: Locale;
}) {
	const obs = snap.observations?.[0] as FourPlayerObservation | null;
	const trick = obs?.currentTrick;
	const humanTeam = humanSeat >= 0 ? teamOf(humanSeat as SeatId) : -1;
	const positions = [
		{ seat: 2, cls: "top-3 sm:top-5 left-1/2 -translate-x-1/2", dir: "row" as const },
		{ seat: 1, cls: "left-2 sm:left-5 top-1/2 -translate-y-1/2", dir: "col" as const },
		{ seat: 3, cls: "right-2 sm:right-5 top-1/2 -translate-y-1/2", dir: "col" as const },
	];
	return (
		<>
			{positions.map(({ seat, cls, dir }) => {
				const isActive = snap.currentSeat === seat;
				const player = config.players[seat];
				const isPartner =
					humanSeat >= 0 && teamOf(seat as SeatId) === humanTeam && seat !== humanSeat;
				return (
					<div
						key={seat}
						className={`absolute ${cls} flex ${dir === "col" ? "flex-col" : ""} items-center gap-0.5 sm:gap-1 p-1 sm:p-2 rounded-lg ${isActive ? "anim-active" : ""}`}
					>
						<div
							className={`flex items-center gap-1 ${isPartner ? "px-1.5 py-0.5 rounded bg-[var(--team-a)]/10 border border-[var(--team-a)]/20" : ""}`}
						>
							{player?.type === "llm" && player.model && <ProviderBadge model={player.model} />}
							<span className="text-[8px] sm:text-[9px] text-[var(--text-muted)] truncate max-w-[80px] sm:max-w-[120px]">
								{seatNames[seat]}
							</span>
							{isPartner && (
								<span className="text-[6px] sm:text-[7px] text-[var(--team-a)] font-semibold ml-0.5" data-label>
									{t(locale, "game.partner")}
								</span>
							)}
						</div>
						<div className={`flex ${dir === "col" ? "flex-col" : ""} gap-0.5 sm:gap-1`}>
							{Array.from({ length: obs?.otherHandCounts[seat] ?? 3 }).map((_, i) => (
								<div key={i} className={`anim-deal deal-${i}`}>
									<CardBack small />
								</div>
							))}
						</div>
						{isActive && (
							<span className="text-[7px] sm:text-[8px] text-[var(--green-light)]">
								{t(locale, "game.thinking").toLowerCase()}
							</span>
						)}
					</div>
				);
			})}
			{trick && trick.cardsPlayed > 0 && (
				<div className="flex gap-1.5 sm:gap-3">
					{([0, 1, 2, 3] as SeatId[]).map((s) => {
						const card = trick.cards[s];
						if (!card) return null;
						return (
							<div
								key={s}
								className={`flex flex-col items-center gap-0.5 ${SEAT_ANIM[s] ?? "anim-fade"}`}
							>
								<Card card={card} small />
								<span className="text-[7px] sm:text-[8px] text-[var(--text-dim)] truncate max-w-[60px]">
									{seatNames[s]}
								</span>
							</div>
						);
					})}
				</div>
			)}
		</>
	);
});

/* ── Components ── */

function TeamLabel({
	seatNames,
	config,
	team,
	active,
	humanSeat,
	locale,
}: {
	seatNames: string[];
	config: GameConfig;
	team: 0 | 1;
	active: boolean;
	humanSeat: number;
	locale: Locale;
}) {
	const seats = config.players.length === 4 ? (team === 0 ? [0, 2] : [1, 3]) : [team];
	const teamColor = team === 0 ? "var(--team-a)" : "var(--team-b)";
	const is4p = config.players.length === 4;
	const humanTeam = humanSeat >= 0 ? (is4p ? teamOf(humanSeat as SeatId) : humanSeat) : -1;
	const isMyTeam = team === humanTeam;

	return (
		<div className="flex items-center gap-1.5 sm:gap-2 min-w-0 max-w-[38%]">
			<span
				className="w-2 h-2 rounded-full shrink-0"
				style={{ background: teamColor, opacity: active ? 1 : 0.4 }}
			/>
			<div className="flex flex-col min-w-0 gap-0.5">
				{isMyTeam && is4p && (
					<span
						className="text-[7px] font-semibold"
						style={{ color: teamColor }}
						data-label
					>
						{t(locale, "game.yourTeam")}
					</span>
				)}
				{seats.map((s) => {
					const player = config.players[s];
					const name = seatNames[s] ?? `Seat ${s}`;
					return (
						<div key={s} className="flex items-center gap-1 min-w-0">
							{player?.type === "llm" && player.model && <ProviderBadge model={player.model} />}
							{player?.type === "heuristic" && <ProviderBadge model="heuristic" />}
							<span
								className={`text-xs sm:text-sm truncate ${active ? "font-semibold" : ""}`}
								style={{ color: active ? teamColor : "var(--text-muted)" }}
							>
								{name}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function Overlay({ children }: { children: React.ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const focusable = el.querySelectorAll<HTMLElement>(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
		);
		if (focusable.length) focusable[0]!.focus();
	}, []);
	return (
		<div
			ref={ref}
			className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg z-10"
			role="dialog"
			aria-modal="true"
			aria-label="Game overlay"
		>
			{children}
		</div>
	);
}

const PHRASE_CATEGORIES: Record<string, { en: string; pt: string; es: string }> = {
	provoke: { en: "Provoke", pt: "Provocar", es: "Provocar" },
	bluff: { en: "Bluff", pt: "Blefar", es: "Farolear" },
	celebrate: { en: "Celebrate", pt: "Comemorar", es: "Celebrar" },
	react: { en: "React", pt: "Reagir", es: "Reaccionar" },
	encourage: { en: "Partner", pt: "Parceiro", es: "Compa\u00f1ero" },
};

function ChatPhraseBar({
	showPhrases,
	onToggle,
	onSend,
	locale,
}: {
	showPhrases: boolean;
	onToggle: () => void;
	onSend: (text: string) => void;
	locale: Locale;
}) {
	return (
		<div className="flex items-start gap-1.5 mt-1 pt-1 border-t border-[var(--border)]/50">
			<button
				type="button"
				onClick={onToggle}
				className={`px-2.5 py-1 rounded text-[10px] shrink-0 transition-colors ${showPhrases ? "bg-[var(--accent)] text-white" : "text-[var(--text-dim)] border border-[var(--border)] hover:text-[var(--text-muted)]"}`}
			>
				Chat {showPhrases ? "\u25B4" : "\u25BE"}
			</button>
			{showPhrases && (
				<div className="flex flex-col gap-1.5 anim-fade overflow-x-auto max-w-full">
					{Object.entries(PHRASE_CATEGORIES).map(([cat, labels]) => {
						const phrases = CHAT_PHRASES.filter((p) => p.category === cat);
						if (phrases.length === 0) return null;
						return (
							<div key={cat} className="flex items-center gap-1">
								<span className="text-[10px] text-[var(--text-dim)] shrink-0 w-14 text-right">
									{labels[locale] ?? labels.en}
								</span>
								<div className="flex gap-0.5 flex-wrap">
									{phrases.map((p) => (
										<button
											type="button"
											key={p.id}
											onClick={() => onSend(p.text[locale] ?? p.text.en)}
											className="px-2 py-0.5 rounded text-[10px] bg-[var(--surface-2)] text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] transition-colors whitespace-nowrap"
										>
											{p.text[locale] ?? p.text.en}
										</button>
									))}
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

const SIGNAL_OPTIONS: { type: string; needsManilha?: string; needsRank?: string }[] = [
	{ type: "ZAP", needsManilha: "paus" },
	{ type: "COPAS", needsManilha: "copas" },
	{ type: "ESPADAS", needsManilha: "espadas" },
	{ type: "OUROS", needsManilha: "ouros" },
	{ type: "THREE", needsRank: "3" },
	{ type: "TWO", needsRank: "2" },
	{ type: "ACE", needsRank: "A" },
	{ type: "NOTHING" },
];

function SignalPanel({
	showPanel,
	onToggle,
	onSend,
	hand,
	vira,
	locale,
}: {
	showPanel: boolean;
	onToggle: () => void;
	onSend: (type: string) => void;
	hand: CardType[];
	vira: CardType | null;
	locale: Locale;
}) {
	// Determine which signals the player can truthfully send
	const available = SIGNAL_OPTIONS.filter((opt) => {
		if (opt.type === "NOTHING") return true; // always available
		if (opt.needsManilha && vira) {
			return hand.some((c) => checkManilha(c, vira) && c.suit === opt.needsManilha);
		}
		if (opt.needsRank) {
			return hand.some((c) => c.rank === opt.needsRank && (!vira || !checkManilha(c, vira)));
		}
		return false;
	});

	return (
		<div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-[var(--border)]/50">
			<button
				type="button"
				onClick={onToggle}
				className={`px-2.5 py-1 rounded text-[10px] transition-colors ${showPanel ? "bg-[var(--gold-dim)] text-white" : "text-[var(--text-dim)] border border-[var(--border)] hover:text-[var(--text-muted)]"}`}
			>
				{t(locale, "signal.button")} {showPanel ? "\u25B4" : "\u25BE"}
			</button>
			{showPanel && (
				<div className="flex gap-1 flex-wrap anim-fade">
					{available.map((opt) => (
						<button
							type="button"
							key={opt.type}
							onClick={() => onSend(opt.type)}
							className="px-2 py-1 rounded text-[10px] bg-[var(--surface-2)] text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] transition-colors"
							title={t(locale, `signal.${opt.type}`)}
						>
							{t(locale, `signal.${opt.type}`)}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

function ThinkingIndicator({ who, locale }: { who: string; locale: Locale }) {
	return (
		<span
			className="text-xs sm:text-sm text-[var(--text-dim)] flex items-center gap-1.5"
			role="status"
			aria-live="polite"
		>
			<span
				className="inline-block w-3 h-3 border-2 border-[var(--text-dim)] border-t-transparent rounded-full animate-spin"
				aria-hidden="true"
			/>
			<span className="hidden sm:inline truncate max-w-[120px]">
				{t(locale, "game.thinkingWho", { name: who })}
			</span>
			<span className="sm:hidden">{t(locale, "game.thinking")}</span>
		</span>
	);
}

function SpeedControl({
	speed,
	onChange,
	compact,
	locale,
}: { speed: number; onChange: (s: number) => void; compact?: boolean; locale: Locale }) {
	return (
		<div
			className={`flex items-center gap-0.5 sm:gap-1 ${compact ? "" : "text-xs text-[var(--text-dim)]"}`}
			role="radiogroup"
			aria-label="Game speed"
		>
			{!compact && <span className="mr-0.5 hidden sm:inline">{t(locale, "game.speed")}</span>}
			{[0.5, 1, 2].map((s) => (
				<button
					type="button"
					key={s}
					onClick={() => onChange(s)}
					role="radio"
					aria-checked={speed === s}
					className={`px-2 py-1.5 rounded text-[11px] min-h-[44px] min-w-[44px] ${speed === s ? "bg-[var(--surface-3)] text-[var(--text)]" : "text-[var(--text-dim)]"}`}
				>
					{s}x
				</button>
			))}
		</div>
	);
}

function ErrorBox({
	message,
	onBack,
	onRetry,
	locale,
}: { message: string; onBack: () => void; onRetry: () => void; locale: Locale }) {
	const isOidc = message.includes("OIDC") || message.includes("oidc");
	const isModelNotFound = message.includes("not found") || message.includes("Not Found");
	const isTimeout = message.includes("timeout") || message.includes("Timeout");
	const isNetwork = message.includes("network") || message.includes("ECONNREFUSED") || message.includes("TLS");

	let hint = t(locale, "game.checkApi");
	if (isOidc) {
		hint = "Vercel Gateway requires OIDC (only works on Vercel deployments or with 'vercel dev'). Switch to OpenRouter for local dev.";
	} else if (isModelNotFound) {
		hint = "The model ID may be wrong for this provider. Try a different model or switch providers.";
	} else if (isTimeout) {
		hint = "The model took too long to respond. Try a faster model or increase the timeout.";
	} else if (isNetwork) {
		hint = "Could not connect to the API. Check your internet connection and API key.";
	}

	return (
		<div
			className="bg-[var(--surface)] border border-[var(--red)]/40 rounded-lg px-4 sm:px-6 py-4 sm:py-5 text-center max-w-sm mx-4 anim-fade"
			role="alert"
		>
			<p className="font-bold text-[var(--red)] mb-2">{t(locale, "game.error")}</p>
			<p className="text-sm text-[var(--text-muted)] leading-relaxed break-words line-clamp-4">
				{message}
			</p>
			<p className="text-xs text-[var(--text-dim)] mt-2">{hint}</p>
			<div className="flex gap-2 justify-center mt-3">
				<button
					type="button"
					onClick={onRetry}
					className="px-4 py-2 text-sm bg-[var(--accent)] text-white rounded min-h-[44px] hover:bg-[var(--accent-light)] transition-colors"
				>
					{t(locale, "game.retry")}
				</button>
				<button
					type="button"
					onClick={onBack}
					className="px-4 py-2 text-sm bg-[var(--surface-2)] border border-[var(--border)] rounded min-h-[44px] hover:border-[var(--border-light)] transition-colors"
				>
					{t(locale, "game.setup")}
				</button>
			</div>
		</div>
	);
}

function WinBox({
	snap,
	humanSeat,
	seatNames,
	onNewGame,
	locale,
}: {
	snap: GameSnapshot;
	humanSeat: number;
	seatNames: string[];
	onNewGame: () => void;
	locale: Locale;
}) {
	const is4p = snap.mode === "4p";
	const myTeam = humanSeat >= 0 ? (is4p ? teamOf(humanSeat as SeatId) : humanSeat) : -1;
	const won = snap.winner === myTeam;
	const teamNames = is4p
		? [`${seatNames[0]} + ${seatNames[2]}`, `${seatNames[1]} + ${seatNames[3]}`]
		: [seatNames[0], seatNames[1]];
	const titleColor = won ? "var(--green-light)" : humanSeat < 0 ? "var(--gold)" : "var(--red)";
	const borderColor = won ? "var(--green)" : humanSeat < 0 ? "var(--gold-dim)" : "var(--red)";

	return (
		<div
			className="bg-[var(--surface)] border-2 rounded-xl px-6 sm:px-8 py-6 sm:py-8 text-center mx-4 anim-callout"
			style={{ borderColor }}
		>
			{/* Trophy / result icon */}
			<div className="text-4xl sm:text-5xl mb-2 anim-score">
				{won ? "\uD83C\uDFC6" : humanSeat < 0 ? "\uD83C\uDFAE" : "\uD83D\uDE14"}
			</div>
			<p className="text-xl sm:text-2xl font-bold mb-1 truncate font-display" style={{ color: titleColor }}>
				{humanSeat < 0
					? t(locale, "game.wins", { name: teamNames[snap.winner!]! })
					: won
						? t(locale, "game.youWin")
						: t(locale, "game.youLost")}
			</p>
			<p className="text-lg text-[var(--text-muted)] tabular-nums mb-1 font-bold">
				{snap.scores[0]} &ndash; {snap.scores[1]}
			</p>
			<p className="text-[11px] text-[var(--text-dim)] mb-5">
				{teamNames[0]} vs {teamNames[1]}
			</p>
			<div className="flex gap-2 justify-center flex-wrap">
				<button
					type="button"
					onClick={onNewGame}
					className="px-5 py-2.5 text-sm bg-[var(--accent)] text-white rounded-lg font-semibold min-h-[44px] hover:bg-[var(--accent-light)] transition-colors"
				>
					{t(locale, "game.playAgain")}
				</button>
				<button
					type="button"
					onClick={onNewGame}
					className="px-5 py-2.5 text-sm bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-[var(--text-muted)] min-h-[44px] hover:border-[var(--border-light)] transition-colors"
				>
					{t(locale, "game.changeSetup")}
				</button>
			</div>
		</div>
	);
}

const LogEntryRow = memo(function LogEntryRow({
	entry,
	name,
	config,
	locale,
}: { entry: LogEntry; name: string; config: GameConfig; locale: Locale }) {
	const color = SEAT_COLORS[entry.seat % 4];
	const player = config.players[entry.seat];
	return (
		<div
			className="px-2 sm:px-2.5 py-1.5 rounded bg-[var(--surface-2)]/60 anim-log min-w-0 border-l-2"
			style={{ borderLeftColor: color }}
		>
			<div className="flex items-center gap-1.5 min-w-0">
				{player?.type === "llm" && player.model && <ProviderBadge model={player.model} />}
				<span className="text-xs font-semibold truncate shrink-0" style={{ color }}>
					{name}
				</span>
				<ActionBadge action={entry.action} locale={locale} />
			</div>
			{entry.reasoning && (
				<p className="hidden sm:block text-[var(--text-dim)] text-[11px] mt-1 leading-relaxed break-words line-clamp-3">
					{entry.reasoning}
				</p>
			)}
		</div>
	);
});

function ActionBadge({ action, locale }: { action: Action; locale: Locale }) {
	const label =
		action.type === ActionType.PLAY_CARD && "cardIndex" in action
			? t(locale, "game.card", { n: action.cardIndex })
			: action.type.toLowerCase();
	const cls =
		action.type === ActionType.TRUCO
			? "text-[var(--accent-light)]"
			: action.type === ActionType.FOLD
				? "text-[var(--red)]"
				: action.type === ActionType.ACCEPT
					? "text-[var(--green-light)]"
					: "text-[var(--text-dim)]";
	return <span className={`text-[10px] shrink-0 ${cls}`}>{label}</span>;
}

function btnStyle(type: string): string {
	switch (type) {
		case "TRUCO":
			return "bg-[var(--accent)] text-white";
		case "RAISE":
			return "bg-[var(--gold-dim)] text-white";
		case "ACCEPT":
			return "bg-[var(--green)] text-white";
		default:
			return "bg-[var(--surface-3)] text-[var(--text-muted)]";
	}
}

function actionTooltip(type: string, locale: Locale): string {
	switch (type) {
		case "TRUCO":
			return t(locale, "action.trucoTip");
		case "RAISE":
			return t(locale, "action.raiseTip");
		case "ACCEPT":
			return t(locale, "action.acceptTip");
		default:
			return "";
	}
}
