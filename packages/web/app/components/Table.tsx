"use client";

import type { GameConfig, PlayerConfig, ProviderMode } from "@/lib/game-manager";
import { computeAggregateStats, getGameHistory } from "@/lib/game-history";
import { LOCALES, type Locale, detectLocale, saveLocale, t, toPromptLang } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { GameBoard } from "./GameBoard";
import { LobbyBackground } from "./LobbyBackground";
import { NewspaperBg } from "./NewspaperBg";
import {
	HuggingFaceIcon,
	OpenRouterIcon,
	VercelIcon,
} from "./ProviderIcons";
import { RansomLabel, RansomTitle } from "./RansomTitle";
import { Seat } from "./Seat";
import { ALL_AGENTS, type GatewayModel, SeatPicker, agentToConfig } from "./SeatPicker";
import { addToast } from "./Toast";

/* ── Presets (table templates) ────────────────────────── */

interface TableTemplate {
	labelKey: string;
	descKey: string;
	seats: string[];
	needsKeys: boolean;
}

const TEMPLATES: TableTemplate[] = [
	{
		labelKey: "preset.youVsBot",
		descKey: "preset.youVsBotHint",
		seats: ["human", "heuristic", "", ""],
		needsKeys: false,
	},
	{
		labelKey: "preset.youPlus3Ai",
		descKey: "preset.youPlus3AiHint",
		seats: ["human", "claude-haiku-4.5", "gemini-2.5-flash", "gpt-4o-mini"],
		needsKeys: true,
	},
	{
		labelKey: "preset.aiBattle",
		descKey: "preset.aiBattleHint",
		seats: ["claude-haiku-4.5", "gpt-4o-mini", "gemini-2.5-flash", "deepseek-r1"],
		needsKeys: true,
	},
];

/* ── Timer / prompt options ───────────────────────────── */

const TIMER_OPTIONS = [30, 60, 90, 0];
const PROMPT_OPTIONS: ("economy" | "minimal" | "standard" | "verbose")[] = [
	"economy",
	"minimal",
	"standard",
	"verbose",
];

/* ── Main Table component ─────────────────────────────── */

export function Table() {
	// Locale
	const [locale, setLocaleRaw] = useState<Locale>("en");
	useEffect(() => {
		const detected = detectLocale();
		setLocaleRaw(detected);
	}, []);
	function changeLocale(l: Locale) {
		setLocaleRaw(l);
		saveLocale(l);
	}
	useEffect(() => {
		document.documentElement.lang = locale;
	}, [locale]);

	// Claude Code availability check (cached for session)
	const [claudeAvailable, setClaudeAvailable] = useState(false);
	useEffect(() => {
		const cached = sessionStorage.getItem("trucobench-claude-available");
		if (cached !== null) {
			setClaudeAvailable(cached === "true");
			return;
		}
		fetch("/api/check-claude")
			.then((r) => r.json())
			.then((d) => {
				const avail = Boolean(d.available);
				setClaudeAvailable(avail);
				sessionStorage.setItem("trucobench-claude-available", String(avail));
			})
			.catch(() => setClaudeAvailable(false));
	}, []);

	// First-visit detection
	const [firstVisit, setFirstVisit] = useState(true);
	useEffect(() => {
		const visited = localStorage.getItem("trucobench-visited");
		if (visited) setFirstVisit(false);
	}, []);
	function markVisited() {
		localStorage.setItem("trucobench-visited", "1");
		setFirstVisit(false);
	}

	// Table state
	const [seats, setSeats] = useState<(string | null)[]>([null, null, null, null]);
	const [pickerSeat, setPickerSeat] = useState<number | null>(null);
	const [activeTemplate, setActiveTemplate] = useState<number | null>(null);

	// Settings (on table surface)
	const [turnTimeout, setTurnTimeout] = useState(30);
	const [promptMode, setPromptMode] = useState<"economy" | "minimal" | "standard" | "verbose">(
		"economy",
	);
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [temperature, setTemperature] = useState(0.7);
	const TRUCO_TIMING_OPTIONS = ["after-first-trick", "after-first-card", "anytime"] as const;
	type TrucoTimingOption = (typeof TRUCO_TIMING_OPTIONS)[number];
	const [trucoTiming, setTrucoTiming] = useState<TrucoTimingOption>("after-first-trick");
	function cycleTrucoTiming() {
		setTrucoTiming((prev) => {
			const idx = TRUCO_TIMING_OPTIONS.indexOf(prev);
			return TRUCO_TIMING_OPTIONS[(idx + 1) % TRUCO_TIMING_OPTIONS.length]!;
		});
	}
	const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
	const [providerMode, setProviderModeRaw] = useState<ProviderMode>("vercel-gateway");

	// Hydrate from localStorage after mount (avoids SSR mismatch)
	useEffect(() => {
		try {
			const storedKeys = JSON.parse(localStorage.getItem("trucobench-keys") ?? "{}");
			setApiKeys(storedKeys);
		} catch {}
		const storedMode = localStorage.getItem("trucobench-provider-mode") as ProviderMode | null;
		if (storedMode) setProviderModeRaw(storedMode);
	}, []);

	function setProviderMode(mode: ProviderMode) {
		setProviderModeRaw(mode);
		localStorage.setItem("trucobench-provider-mode", mode);
	}

	function setApiKey(provider: string, key: string) {
		setApiKeys((prev) => {
			const next = { ...prev, [provider]: key };
			localStorage.setItem("trucobench-keys", JSON.stringify(next));
			return next;
		});
	}

	/** Whether the current mode uses a single unified key for all models */
	const isUnifiedMode =
		providerMode === "vercel-gateway" ||
		providerMode === "openrouter" ||
		providerMode === "huggingface";
	const unifiedKeyName =
		providerMode === "openrouter"
			? "openrouter"
			: providerMode === "huggingface"
				? "huggingface"
				: "vercel-gateway";
	const hasUnifiedKey = Boolean(apiKeys[unifiedKeyName]);

	// Gateway models (fetched dynamically when unified key is available)
	const [gatewayModels, setGatewayModels] = useState<GatewayModel[]>([]);
	const [gatewayLoading, setGatewayLoading] = useState(false);
	useEffect(() => {
		if (!isUnifiedMode || !hasUnifiedKey) {
			setGatewayModels([]);
			return;
		}
		// Check sessionStorage cache first
		const cacheKey = `trucobench-gateway-models-${unifiedKeyName}`;
		const cached = sessionStorage.getItem(cacheKey);
		if (cached) {
			try {
				setGatewayModels(JSON.parse(cached));
				return;
			} catch {}
		}
		setGatewayLoading(true);
		fetch("/api/gateway-models", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ apiKey: apiKeys[unifiedKeyName] }),
		})
			.then((r) => r.json())
			.then((data) => {
				const models: GatewayModel[] = data.models ?? [];
				setGatewayModels(models);
				if (models.length > 0) {
					sessionStorage.setItem(cacheKey, JSON.stringify(models));
				}
			})
			.catch(() => setGatewayModels([]))
			.finally(() => setGatewayLoading(false));
	}, [isUnifiedMode, hasUnifiedKey, unifiedKeyName, apiKeys]);

	// Game state
	const [gameId, setGameId] = useState<string | null>(null);
	const [config, setConfig] = useState<GameConfig | null>(null);
	const [starting, setStarting] = useState(false);

	// Derived (memoized to avoid recalculating on every render)
	const filledCount = useMemo(() => seats.filter(Boolean).length, [seats]);
	const humanSeated = useMemo(() => seats.some((s) => s === "human"), [seats]);
	const is2p = useMemo(() => Boolean(seats[0] && seats[1] && !seats[2] && !seats[3]), [seats]);
	const mode = is2p ? "2p" : "4p";
	const isPlaying = gameId !== null && config !== null;
	const noSeats = seats.every((s) => s === null);
	const templatesVisible = noSeats && !isPlaying;

	// Reset activeTemplate when all seats are cleared
	useEffect(() => {
		if (noSeats) setActiveTemplate(null);
	}, [noSeats]);

	// Key validation: which LLM seats are missing keys?
	const missingKeySeats = useMemo(
		() =>
			seats
				.map((s, i) => {
					if (!s) return null;
					const agent = ALL_AGENTS.find((a) => a.value === s);
					const isDynamicGatewayModel = !agent && s.includes("/");
					if (!agent && !isDynamicGatewayModel) return null;
					if (agent && agent.type !== "llm") return null;
					const provider = agent?.provider ?? "local";
					const label = agent?.label ?? s.split("/").pop() ?? s;
					// Unified modes: one key covers all models
					if (isUnifiedMode && hasUnifiedKey) return null;
					if (isUnifiedMode && !hasUnifiedKey)
						return { seat: i, model: label, provider: unifiedKeyName };
					if (isDynamicGatewayModel) return { seat: i, model: label, provider: "gateway" };
					const hasKey = Boolean(apiKeys[provider]);
					const canUseCli = provider === "anthropic" && claudeAvailable;
					if (hasKey || canUseCli) return null;
					return { seat: i, model: label, provider };
				})
				.filter(Boolean) as { seat: number; model: string; provider: string }[],
		[seats, apiKeys, claudeAvailable, isUnifiedMode, hasUnifiedKey, unifiedKeyName],
	);

	const canDeal = filledCount >= 2 && missingKeySeats.length === 0;

	// Seat actions
	function fillSeat(index: number, value: string) {
		setSeats((prev) => {
			const next = [...prev];
			// If picking human, ensure only one human seat
			if (value === "human") {
				for (let i = 0; i < next.length; i++) {
					if (next[i] === "human") next[i] = null;
				}
			}
			next[index] = value;
			return next;
		});
		setPickerSeat(null);
	}

	function removeSeat(index: number) {
		setSeats((prev) => {
			const next = [...prev];
			next[index] = null;
			return next;
		});
	}

	function applyTemplate(tmpl: TableTemplate, index: number) {
		setSeats(tmpl.seats.map((s) => s || null));
		setActiveTemplate(index);
	}

	function switchTemplate(index: number) {
		setSeats([null, null, null, null]);
		const tmpl = TEMPLATES[index];
		if (tmpl) {
			setSeats(tmpl.seats.map((s) => s || null));
			setActiveTemplate(index);
		}
	}

	// Deal (start game)
	async function deal() {
		if (starting) return;

		// Pre-validate: check for missing keys
		if (missingKeySeats.length > 0) {
			const names = missingKeySeats.map((m) => m.model).join(", ");
			addToast("warning", `API keys needed for: ${names}. Tap each seat to add a key.`);
			return;
		}
		if (filledCount < 2) {
			addToast("info", "Add at least 2 players to start.");
			return;
		}

		setStarting(true);

		const players =
			mode === "4p"
				? seats.map((v) => (v ? agentToConfig(v, locale) : agentToConfig("random", locale)))
				: [
						agentToConfig(seats[0] ?? "random", locale),
						agentToConfig(seats[1] ?? "random", locale),
					];

		const cfg: GameConfig = {
			players,
			prompt: promptMode,
			language: toPromptLang(locale),
			temperature,
			providerMode,
			turnTimeoutMs: turnTimeout * 1000,
			apiKeys: Object.fromEntries(Object.entries(apiKeys).filter(([_, v]) => v)),
			trucoTiming,
		};

		try {
			const res = await fetch("/api/game", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(cfg),
			});
			if (!res.ok) {
				const body = await res.text().catch(() => "");
				addToast("error", `Failed to start game: ${body || `error ${res.status}`}`);
				return;
			}
			const { id } = await res.json();
			setConfig(cfg);
			setGameId(id);
			markVisited();
			addToast("success", "Game started!");
		} catch (err) {
			addToast("error", err instanceof Error ? err.message : "Failed to connect to server.");
		} finally {
			setStarting(false);
		}
	}

	function resetTable() {
		setGameId(null);
		setConfig(null);
		setStarting(false);
	}

	async function rematch() {
		if (!config || starting) return;
		setStarting(true);
		try {
			const res = await fetch("/api/game", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(config),
			});
			if (!res.ok) {
				addToast("error", "Failed to start rematch");
				return;
			}
			const { id } = await res.json();
			setGameId(id);
			addToast("success", "Game started!");
		} catch {
			addToast("error", "Failed to connect to server.");
		} finally {
			setStarting(false);
		}
	}

	function changeTable() {
		resetTable();
		setSeats([null, null, null, null]);
	}

	// Cycle helpers
	function cycleTimer() {
		setTurnTimeout((prev) => {
			const idx = TIMER_OPTIONS.indexOf(prev);
			return TIMER_OPTIONS[(idx + 1) % TIMER_OPTIONS.length]!;
		});
	}

	function cyclePrompt() {
		setPromptMode((prev) => {
			const idx = PROMPT_OPTIONS.indexOf(prev);
			return PROMPT_OPTIONS[(idx + 1) % PROMPT_OPTIONS.length]!;
		});
	}

	const PROVIDER_MODES: ProviderMode[] = [
		"direct",
		"vercel-gateway",
		"openrouter",
		"huggingface",
	];
	const PROVIDER_MODE_LABELS: Record<string, string> = {
		direct: "Direct APIs",
		"vercel-gateway": "Vercel",
		openrouter: "OpenRouter",
		huggingface: "Hugging Face",
	};
	const PROVIDER_MODE_ICONS: Record<string, React.ReactNode> = {
		"vercel-gateway": <VercelIcon className="w-3 h-3" />,
		openrouter: <OpenRouterIcon className="w-3 h-3" />,
		huggingface: <HuggingFaceIcon className="w-3 h-3" />,
	};
	function cycleProvider() {
		const idx = PROVIDER_MODES.indexOf(providerMode);
		setProviderMode(PROVIDER_MODES[(idx + 1) % PROVIDER_MODES.length]!);
	}

	// Multiplayer P2P state
	const [p2pRoom, setP2pRoom] = useState<import("@/lib/p2p").P2PRoom | null>(null);
	const [p2pLobby, setP2pLobby] = useState<import("@/lib/p2p").LobbyState | null>(null);
	const [p2pJoinCode, setP2pJoinCode] = useState("");
	const [p2pConnecting, setP2pConnecting] = useState(false);
	const [p2pError, setP2pError] = useState<string | null>(null);
	const [showMultiplayer, setShowMultiplayer] = useState(false);

	async function createP2PRoom() {
		setP2pConnecting(true);
		setP2pError(null);
		try {
			const { P2PRoom } = await import("@/lib/p2p");
			const room = new P2PRoom("host");
			room.onLobby((lobby) => setP2pLobby({ ...lobby }));
			room.onStatus((status) => {
				if (status === "disconnected") {
					addToast("error", "Connection lost");
				}
			});
			await room.createRoom();
			setP2pRoom(room);
			setP2pLobby({ ...room.lobby });
			setShowMultiplayer(true);
		} catch (err) {
			setP2pError(err instanceof Error ? err.message : "Failed to create room");
		} finally {
			setP2pConnecting(false);
		}
	}

	async function joinP2PRoom() {
		if (!p2pJoinCode.trim()) return;
		setP2pConnecting(true);
		setP2pError(null);
		try {
			const { P2PRoom } = await import("@/lib/p2p");
			const room = new P2PRoom("guest", p2pJoinCode.trim().toUpperCase());
			room.onLobby((lobby) => setP2pLobby({ ...lobby }));
			room.onStatus((status) => {
				if (status === "playing") {
					// Game started by host — build config from lobby
					const players = room.lobby.seats.map((s) => s ?? { type: "random" as const, name: "Random" });
					const cfg: GameConfig = {
						players,
						prompt: promptMode,
						language: toPromptLang(locale),
						temperature,
						providerMode: "direct",
						turnTimeoutMs: turnTimeout * 1000,
						apiKeys: {},
					};
					setConfig(cfg);
					setGameId(`p2p-${room.code}`);
					markVisited();
				}
				if (status === "disconnected") {
					addToast("error", "Host disconnected");
				}
			});
			await room.joinRoom();
			setP2pRoom(room);
			setP2pLobby({ ...room.lobby });
			setShowMultiplayer(true);
		} catch (err) {
			setP2pError(err instanceof Error ? err.message : "Failed to join room");
		} finally {
			setP2pConnecting(false);
		}
	}

	async function startP2PGame() {
		if (!p2pRoom || p2pRoom.role !== "host") return;
		const players = p2pRoom.lobby.seats.map((s) => s ?? { type: "random" as const, name: "Random" });
		const cfg: GameConfig = {
			players,
			prompt: promptMode,
			language: toPromptLang(locale),
			temperature,
			providerMode: "direct",
			turnTimeoutMs: turnTimeout * 1000,
			apiKeys: {},
			trucoTiming,
		};
		setConfig(cfg);
		setGameId(`p2p-${p2pRoom.code}`);
		markVisited();
		// Start the game loop on host
		p2pRoom.startGame({
			prompt: promptMode,
			language: toPromptLang(locale),
			temperature,
			providerMode: "direct",
			turnTimeoutMs: turnTimeout * 1000,
			trucoTiming,
			seed: undefined,
		});
	}

	function leaveP2P() {
		p2pRoom?.destroy();
		setP2pRoom(null);
		setP2pLobby(null);
		setShowMultiplayer(false);
		setP2pError(null);
		setP2pJoinCode("");
		resetTable();
	}

	// Gameplay settings overlay
	const [showGameplaySettings, setShowGameplaySettings] = useState(false);
	const [confirmLeave, setConfirmLeave] = useState(false);

	function handleBack() {
		setConfirmLeave(true);
	}

	function doLeave() {
		setConfirmLeave(false);
		changeTable();
	}

	/* ── Render: Playing state ── */
	if (isPlaying) {
		return (
			<div className="h-screen flex flex-col p-2 sm:p-3 gap-1.5 sm:gap-2 relative anim-view-enter" data-ui>
				<LobbyBackground mode="gameplay" />
				{/* Minimal gameplay header */}
				<header className="flex items-center justify-between px-1 relative z-10 min-h-[48px]">
					<button
						type="button"
						onClick={handleBack}
						className="w-9 h-9 min-h-[44px] min-w-[44px] flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
						aria-label={t(locale, "game.backToLobby")}
					>
						<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
							<path d="M19 12H5M12 19l-7-7 7-7" />
						</svg>
					</button>
					<div className="flex-1" />
					<button
						type="button"
						onClick={() => setShowGameplaySettings((p) => !p)}
						className="w-9 h-9 min-h-[44px] min-w-[44px] flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
						aria-label={t(locale, "advanced.toggle")}
					>
						<svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Zm7.43-2.53c.04-.32.07-.64.07-.97s-.03-.66-.07-.97l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.13 7.13 0 0 0-1.67-.97l-.38-2.65A.49.49 0 0 0 14 2h-4a.49.49 0 0 0-.49.42l-.38 2.65c-.61.25-1.17.59-1.67.97l-2.49-1a.5.5 0 0 0-.61.22l-2 3.46a.49.49 0 0 0 .12.64l2.11 1.65c-.04.32-.07.65-.07.97s.03.66.07.97l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.5.38 1.06.72 1.67.97l.38 2.65c.05.24.26.42.49.42h4c.24 0 .44-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.67-.97l2.49 1c.22.08.49 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65Z" />
						</svg>
					</button>
				</header>
				{/* Settings overlay */}
				{showGameplaySettings && (
					<div className="absolute top-14 right-2 z-30 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl p-3 flex flex-col gap-2 min-w-[180px] anim-fade">
						<div className="flex items-center gap-2">
							<SoundToggle />
							<ThemeToggle />
							<LocaleToggle locale={locale} onChange={changeLocale} />
						</div>
						<button
							type="button"
							onClick={() => { setShowGameplaySettings(false); changeTable(); }}
							className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-left px-2 py-1.5 rounded hover:bg-[var(--surface-2)] min-h-[44px]"
						>
							{t(locale, "game.newGame")}
						</button>
					</div>
				)}
				{/* Leave confirmation */}
				{confirmLeave && (
					<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true" aria-labelledby="leave-dialog-title" onClick={() => setConfirmLeave(false)} onKeyDown={(e) => e.key === "Escape" && setConfirmLeave(false)}>
						<div className="torn-paper p-4 flex flex-col gap-3 items-center min-w-[200px]" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
							<p id="leave-dialog-title" className="text-sm font-bold">{t(locale, "game.leaveConfirm")}</p>
							<div className="flex gap-2">
								<button type="button" onClick={doLeave} className="px-4 py-2 rounded bg-[var(--accent)] text-white text-xs font-bold min-h-[44px]">
									{t(locale, "game.backToLobby")}
								</button>
								<button type="button" onClick={() => setConfirmLeave(false)} className="px-4 py-2 rounded bg-[var(--surface-2)] text-[var(--text-muted)] text-xs font-bold min-h-[44px]">
									{t(locale, "game.logClose")}
								</button>
							</div>
						</div>
					</div>
				)}
				<main className="flex-1 min-h-0 relative z-10">
					<GameBoard gameId={gameId} config={config} onNewGame={p2pRoom ? leaveP2P : resetTable} onRematch={p2pRoom ? undefined : rematch} locale={locale} p2pRoom={p2pRoom} />
				</main>
			</div>
		);
	}

	/* ── Render: Multiplayer lobby ── */
	if (showMultiplayer && p2pRoom && p2pLobby && !isPlaying) {
		const p2pFilledCount = p2pLobby.seats.filter(Boolean).length;
		const canStart = p2pRoom.role === "host" && p2pFilledCount >= 2;
		return (
			<div className="min-h-screen flex flex-col items-center justify-center relative anim-view-enter p-4" data-ui>
				<NewspaperBg />
				<div className="relative z-10 w-full max-w-md flex flex-col items-center gap-6">
					<div className="torn-paper px-6 py-3 text-center" style={{ transform: "rotate(-1deg)" }}>
						<RansomTitle text="Multiplayer" className="text-2xl" />
					</div>

					{/* Room code */}
					<div className="torn-paper px-5 py-3 flex flex-col items-center gap-2">
						<span className="text-xs text-[var(--text-dim)]">Room Code</span>
						<span className="text-2xl font-mono font-bold tracking-widest text-[var(--accent)]">{p2pLobby.code}</span>
						<button
							type="button"
							onClick={() => { navigator.clipboard.writeText(p2pLobby.code); addToast("success", "Code copied!"); }}
							className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
						>
							Copy
						</button>
					</div>

					{/* Seats */}
					<div className="grid grid-cols-2 gap-3 w-full">
						{p2pLobby.seats.map((s, i) => {
							const teamColor = i % 2 === 0 ? "var(--team-a)" : "var(--team-b)";
							const posLabels = ["South", "West", "North", "East"];
							const isHost = i === p2pLobby.hostSeat;
							return (
								<div
									key={i}
									className="torn-paper p-3 flex flex-col items-center gap-1.5"
									style={{ borderColor: teamColor }}
								>
									<span className="text-[9px] text-[var(--text-dim)]">{posLabels[i]} {i % 2 === 0 ? "(Team A)" : "(Team B)"}</span>
									{s ? (
										<>
											<span className="text-sm font-semibold" style={{ color: teamColor }}>
												{s.type === "human" ? (isHost ? "Host" : s.name ?? "Player") : s.type === "heuristic" ? "Bot" : "Random"}
											</span>
											{p2pRoom.role === "host" && !isHost && (
												<button
													type="button"
													onClick={() => p2pRoom.removeSeat(i)}
													className="text-[10px] text-[var(--red)] hover:underline"
												>
													Remove
												</button>
											)}
										</>
									) : (
										<div className="flex flex-col items-center gap-1">
											{p2pRoom.role === "host" ? (
												<div className="flex gap-1">
													<button
														type="button"
														onClick={() => p2pRoom.fillSeatWithAI(i, "heuristic")}
														className="text-[10px] px-2 py-1 rounded bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
													>
														+Bot
													</button>
													<button
														type="button"
														onClick={() => p2pRoom.fillSeatWithAI(i, "random")}
														className="text-[10px] px-2 py-1 rounded bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
													>
														+Random
													</button>
												</div>
											) : (
												<button
													type="button"
													onClick={() => p2pRoom.pickSeat(i)}
													className="text-xs px-3 py-1.5 rounded bg-[var(--accent)] text-white font-semibold hover:opacity-90 transition-opacity"
												>
													Sit Here
												</button>
											)}
											<span className="text-[10px] text-[var(--text-dim)]">Waiting...</span>
										</div>
									)}
								</div>
							);
						})}
					</div>

					{/* Connected peers count */}
					<span className="text-xs text-[var(--text-dim)]">
						{p2pFilledCount} / 4 seats filled
					</span>

					{/* Actions */}
					<div className="flex gap-3">
						{canStart && (
							<button
								type="button"
								onClick={startP2PGame}
								className="torn-paper tape px-6 py-2 text-center hover:scale-105 transition-transform cursor-pointer"
								style={{ "--tape-r": "-1deg", "--tape-color": "var(--green)" } as React.CSSProperties}
							>
								<RansomTitle text={t(locale, "game.deal")} className="text-lg pt-1" />
							</button>
						)}
						<button
							type="button"
							onClick={leaveP2P}
							className="px-4 py-2 rounded bg-[var(--surface-2)] text-[var(--text-muted)] text-xs font-bold min-h-[44px] hover:text-[var(--text)] transition-colors"
						>
							Leave
						</button>
					</div>
				</div>
			</div>
		);
	}

	/* ── Render: Lobby (magazine cut-out theme) ── */
	return (
		<div className="min-h-screen flex flex-col items-center relative anim-view-enter" data-ui>
			<NewspaperBg />
			<LobbyBackground />

			{/* Main content — Layout: Logo+text → Table (with deal btn) → Game modes → Settings */}
			<main className="flex-1 flex flex-col items-center justify-center gap-4 sm:gap-6 w-full max-w-2xl px-4 relative z-10 py-2">
			{/* Missing keys warning (below table) */}
			{missingKeySeats.length > 0 && filledCount >= 2 && (
				<div className="torn-paper px-4 py-2 text-center max-w-md" style={{ "--torn-bg": "var(--surface)" } as React.CSSProperties}>
					<p className="text-xs text-[var(--gold)] flex items-center justify-center gap-1.5">
						<svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
						</svg>
						{isUnifiedMode
							? `${providerMode === "openrouter" ? "OpenRouter" : providerMode === "huggingface" ? "Hugging Face" : "Vercel Gateway"} key needed — tap any LLM seat to add`
							: `${missingKeySeats.map((m) => m.model).join(", ")} — tap seat to add API key`}
					</p>
				</div>
			)}
				{/* The table with seats — deal button in center */}
				<div
					className="relative bg-[var(--table)] rounded-[2rem] sm:rounded-[3rem] border-4 sm:border-[6px] border-[var(--table-border)] shadow-2xl aspect-[4/3] w-full max-w-[min(360px,90vw)] sm:max-w-md flex items-center justify-center overflow-visible my-10 sm:my-14"
					style={{
						boxShadow: "4px 6px 20px rgba(50,40,20,0.3), inset 0 2px 8px rgba(255,255,255,0.05)",
					}}
				>
					{/* Felt texture — gradient + grain */}
					<div
						className="absolute inset-0 rounded-[2rem] sm:rounded-[3rem] opacity-15 pointer-events-none"
						style={{
							background: "radial-gradient(ellipse at center, var(--table-light) 0%, transparent 70%)",
						}}
					/>
					<div
						className="absolute inset-0 rounded-[2rem] sm:rounded-[3rem] opacity-[0.08] pointer-events-none mix-blend-overlay"
						style={{
							backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E")`,
							backgroundSize: "180px 180px",
						}}
					/>

					{/* Seats at cardinal positions */}
					{(
						[
							{ idx: 2, cls: "absolute -top-10 sm:-top-14 left-1/2 -translate-x-1/2", delay: "anim-delay-1" },
							{ idx: 1, cls: "absolute -left-8 sm:-left-14 top-1/2 -translate-y-1/2", delay: "anim-delay-2" },
							{ idx: 3, cls: "absolute -right-8 sm:-right-14 top-1/2 -translate-y-1/2", delay: "anim-delay-3" },
							{ idx: 0, cls: "absolute -bottom-10 sm:-bottom-14 left-1/2 -translate-x-1/2", delay: "anim-delay-4" },
						] as const
					).map(({ idx, cls, delay }) => (
						<div key={idx} className={`${cls} anim-pop-in ${delay}`}>
							<Seat
								index={idx}
								player={seats[idx] ? agentToConfig(seats[idx]!, locale) : null}
								state={seats[idx] ? "filled" : "empty"}
								locale={locale}
								onTap={() => setPickerSeat(idx)}
							/>
						</div>
					))}

					{/* Center — logo + deal button */}
					<div className="flex flex-col items-center gap-3 z-10 text-center px-4">
						<div className="torn-paper px-4 py-2 rounded-sm" style={{ transform: "rotate(-2deg)" }}>
							<RansomTitle text="TrucoBench" className="text-xl sm:text-2xl" />
						</div>
						{canDeal && (
							<button
								type="button"
								onClick={deal}
								disabled={starting || missingKeySeats.length > 0}
								data-trigger-wave
								className="torn-paper px-6 sm:px-8 py-2 transition-all hover:scale-105 min-h-[44px] disabled:opacity-50 anim-pop-in"
								style={{ transform: "rotate(1deg)" }}
							>
								<RansomTitle text={starting ? t(locale, "start.starting") : t(locale, "table.deal")} className="text-lg sm:text-xl" />
							</button>
						)}
					</div>
				</div>

				{/* Game mode selection — below the table */}
				{firstVisit && templatesVisible ? (
					<div className="flex flex-col items-center gap-6">
						<button
							type="button"
							onClick={() => applyTemplate(TEMPLATES[0]!, 0)}
							className="torn-paper tape px-5 py-2 text-center hover:scale-105 transition-transform min-h-[44px] cursor-pointer whitespace-nowrap anim-slide-up anim-delay-2"
							style={{ "--tape-r": "-1deg", "--tape-color": "var(--green)" } as React.CSSProperties}
						>
							<RansomTitle text={t(locale, "hero.cta")} className="text-base pt-2" />
							<span className="block text-[9px] text-[var(--text-dim)] mt-0.5 whitespace-nowrap">{t(locale, "hero.ctaHint")}</span>
						</button>
						<button
							type="button"
							onClick={() => setFirstVisit(false)}
							className="torn-paper tape px-5 py-2 text-center hover:scale-105 transition-transform min-h-[44px] cursor-pointer whitespace-nowrap anim-slide-up anim-delay-3"
							style={{ "--tape-r": "0.5deg", "--tape-color": "var(--accent)" } as React.CSSProperties}
						>
							<RansomTitle text={t(locale, "hero.orChoose")} className="text-sm" />
						</button>
					</div>
				) : templatesVisible ? (
					<div className="flex flex-col gap-6 items-center">
						{TEMPLATES.map((tmpl, i) => {
							const rotations = [-1, 0.5, -0.5];
							const tapeColors = ["var(--green)", "var(--accent)", "var(--red)"];
							const delays = ["anim-delay-1", "anim-delay-2", "anim-delay-3"];
							return (
								<button
									type="button"
									key={tmpl.labelKey}
									onClick={() => applyTemplate(tmpl, i)}
									className={`torn-paper tape px-4 py-2 text-center hover:scale-105 transition-transform min-h-[44px] cursor-pointer whitespace-nowrap anim-slide-up ${delays[i] ?? ""}`}
									style={{ "--tape-r": `${rotations[i] ?? 0}deg`, "--tape-color": tapeColors[i] } as React.CSSProperties}
								>
									<RansomTitle text={t(locale, tmpl.labelKey)} className="text-sm sm:text-base pt-2" />
									<span className="block text-[9px] text-[var(--text-dim)] mt-0.5 whitespace-nowrap">
										{t(locale, tmpl.descKey)}
									</span>
								</button>
							);
						})}
							{/* Multiplayer section */}
							<div className="flex flex-col items-center gap-2 mt-2 anim-slide-up anim-delay-4">
								<div className="flex gap-2">
									<button
										type="button"
										onClick={createP2PRoom}
										disabled={p2pConnecting}
										className="torn-paper tape px-4 py-2 text-center hover:scale-105 transition-transform min-h-[44px] cursor-pointer whitespace-nowrap disabled:opacity-50"
										style={{ "--tape-r": "1deg", "--tape-color": "var(--gold)" } as React.CSSProperties}
									>
										<RansomTitle text="Create Room" className="text-sm pt-1" />
										<span className="block text-[9px] text-[var(--text-dim)] mt-0.5">P2P Multiplayer</span>
									</button>
								</div>
								<div className="flex items-center gap-2">
									<input
										type="text"
										value={p2pJoinCode}
										onChange={(e) => setP2pJoinCode(e.target.value.toUpperCase())}
										placeholder="TRUCO-XXXX"
										className="w-32 px-2 py-1.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-sm text-center font-mono tracking-wider placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)]"
									/>
									<button
										type="button"
										onClick={joinP2PRoom}
										disabled={p2pConnecting || !p2pJoinCode.trim()}
										className="px-3 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-bold min-h-[36px] disabled:opacity-50 hover:opacity-90 transition-opacity"
									>
										Join
									</button>
								</div>
								{p2pError && <span className="text-xs text-[var(--red)]">{p2pError}</span>}
							</div>
					</div>
				) : !isPlaying && activeTemplate !== null ? (
					<div className="flex flex-col items-center gap-2 anim-slide-up">
						<div className="torn-paper tape px-4 py-1.5 text-center" style={{ "--tape-r": "-1deg" } as React.CSSProperties}>
							<RansomTitle text={t(locale, TEMPLATES[activeTemplate]!.labelKey)} className="text-sm pt-2" />
						</div>
						<button
							type="button"
							onClick={() => { setActiveTemplate(null); setSeats([null, null, null, null]); }}
							className="text-[11px] text-[var(--text-dim)] hover:text-[var(--text-muted)] transition-colors min-h-[44px] inline-flex items-center"
						>
							{t(locale, "game.changeSetup")}
						</button>
					</div>
				) : null}

				{/* Controls row — sound, theme, language, advanced in one line */}
				<div className="flex items-center justify-center gap-2 flex-wrap anim-fade anim-delay-4">
					<SoundToggle />
					<ThemeToggle />
					<LocaleToggle locale={locale} onChange={changeLocale} />
					<button
						type="button"
						onClick={() => setShowAdvanced((p) => !p)}
						className="w-9 h-9 min-h-[44px] min-w-[44px] flex items-center justify-center rounded bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
						aria-expanded={showAdvanced}
						aria-label={t(locale, "advanced.toggle")}
						title={t(locale, "advanced.toggle")}
					>
						<svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Zm7.43-2.53c.04-.32.07-.64.07-.97s-.03-.66-.07-.97l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.13 7.13 0 0 0-1.67-.97l-.38-2.65A.49.49 0 0 0 14 2h-4a.49.49 0 0 0-.49.42l-.38 2.65c-.61.25-1.17.59-1.67.97l-2.49-1a.5.5 0 0 0-.61.22l-2 3.46a.49.49 0 0 0 .12.64l2.11 1.65c-.04.32-.07.65-.07.97s.03.66.07.97l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.5.38 1.06.72 1.67.97l.38 2.65c.05.24.26.42.49.42h4c.24 0 .44-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.67-.97l2.49 1c.22.08.49 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65Z" />
						</svg>
					</button>
				</div>
				{showAdvanced && (
					<div className="torn-paper p-3 flex flex-wrap items-center justify-center gap-2 max-w-md" role="group" aria-label="Game settings">
						<button
							type="button"
							onClick={cycleProvider}
							className={`px-3 py-1.5 rounded text-xs font-bold transition-colors min-h-[36px] inline-flex items-center gap-1.5 ${
								isUnifiedMode ? "text-[var(--green)] bg-[var(--surface-2)]" : "text-[var(--text)] bg-[var(--surface-2)]"
							}`}
							aria-label={`Provider mode: ${PROVIDER_MODE_LABELS[providerMode] ?? providerMode}`}
							title={t(locale, "provider.tip")}
						>
							{PROVIDER_MODE_ICONS[providerMode]}
							{PROVIDER_MODE_LABELS[providerMode] ?? providerMode}
						</button>
						<button
							type="button"
							onClick={cycleTimer}
							className="px-3 py-1.5 rounded text-xs font-bold text-[var(--text)] bg-[var(--surface-2)] transition-colors min-h-[36px]"
							aria-label={`Turn timeout: ${turnTimeout > 0 ? `${turnTimeout} seconds` : "no limit"}`}
						>
							{turnTimeout > 0 ? `${turnTimeout}s` : t(locale, "advanced.noLimit")}
						</button>
						<button
							type="button"
							onClick={cyclePrompt}
							className="px-3 py-1.5 rounded text-xs font-bold text-[var(--text)] bg-[var(--surface-2)] transition-colors min-h-[36px]"
							aria-label={`Prompt mode: ${promptMode}`}
						>
							{t(locale, `prompt.${promptMode}`)}
						</button>
						<button
							type="button"
							onClick={() =>
								setTemperature((prev) => {
									const next = Math.round((prev + 0.1) * 10) / 10;
									return next > 1 ? 0 : next;
								})
							}
							className="px-3 py-1.5 rounded text-xs font-bold text-[var(--text)] bg-[var(--surface-2)] tabular-nums transition-colors min-h-[36px]"
							aria-label={`Temperature: ${temperature.toFixed(1)}`}
						>
							T:{temperature.toFixed(1)}
						</button>
						<button
							type="button"
							onClick={cycleTrucoTiming}
							className="px-3 py-1.5 rounded text-xs font-bold text-[var(--text)] bg-[var(--surface-2)] transition-colors min-h-[36px]"
							aria-label={`${t(locale, "truco.timing")}: ${t(locale, `truco.${trucoTiming === "after-first-trick" ? "afterTrick" : trucoTiming === "after-first-card" ? "afterCard" : "anytime"}`)}`}
						>
							{t(locale, `truco.${trucoTiming === "after-first-trick" ? "afterTrick" : trucoTiming === "after-first-card" ? "afterCard" : "anytime"}`)}
						</button>
					</div>
				)}

				{/* Info panel — tabs for Help & Stats */}
				<InfoPanel locale={locale} />
			</main>

			{/* Footer */}
			<footer className="w-full text-center py-3 relative z-10">
				<div className="flex items-center justify-center gap-3 text-[10px] text-[var(--text-dim)]" style={{ fontFamily: "Georgia, serif" }}>
					<span>MIT License</span>
					<span aria-hidden="true">&middot;</span>
					<a
						href="https://github.com/ManzoliW/trucobench"
						target="_blank"
						rel="noopener noreferrer"
						className="hover:text-[var(--text-muted)] transition-colors underline underline-offset-2"
					>
						Contribute
					</a>
					<span aria-hidden="true">&middot;</span>
					<span>William Manzoli {new Date().getFullYear()}</span>
				</div>
			</footer>

			{/* Seat picker overlay */}
			{pickerSeat !== null && (
				<SeatPicker
					seatIndex={pickerSeat}
					humanSeated={humanSeated}
					locale={locale}
					apiKeys={apiKeys}
					claudeAvailable={claudeAvailable}
					providerMode={providerMode}
					gatewayModels={gatewayModels}
					currentValue={seats[pickerSeat]}
					onSetApiKey={setApiKey}
					onSetProviderMode={setProviderMode}
					onSelect={(v) => fillSeat(pickerSeat, v)}
					onRemove={seats[pickerSeat] ? () => removeSeat(pickerSeat) : undefined}
					onClose={() => setPickerSeat(null)}
				/>
			)}
		</div>
	);
}

/* ── Theme toggle ────────────────────────────────────── */

function ThemeToggle() {
	const [dark, setDark] = useState(false);

	useEffect(() => {
		const stored = localStorage.getItem("trucobench-theme");
		const isDark = stored === "dark";
		setDark(isDark);
		document.documentElement.classList.toggle("dark", isDark);
	}, []);

	function toggle() {
		const next = !dark;
		setDark(next);
		document.documentElement.classList.toggle("dark", next);
		localStorage.setItem("trucobench-theme", next ? "dark" : "light");
		// Update theme-color meta
		const meta = document.querySelector('meta[name="theme-color"]');
		if (meta) {
			const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
			meta.setAttribute("content", bg || (next ? "#282826" : "#dddac9"));
		}
	}

	return (
		<button
			type="button"
			onClick={toggle}
			className="w-9 h-9 min-h-[44px] min-w-[44px] flex items-center justify-center rounded bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
			aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
			title={dark ? "Light mode" : "Dark mode"}
		>
			{dark ? (
				<svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<path d="M12 3a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1Zm0 15a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Zm9-6a1 1 0 0 1-1 1h-1a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1ZM5 12a1 1 0 0 1-1 1H3a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1Zm12.36-5.36a1 1 0 0 1 0 1.41l-.7.71a1 1 0 1 1-1.42-1.42l.71-.7a1 1 0 0 1 1.41 0Zm-10.6 10.6a1 1 0 0 1 0 1.42l-.71.7a1 1 0 1 1-1.41-1.41l.7-.71a1 1 0 0 1 1.42 0ZM19.07 17.36a1 1 0 0 1-1.42 1.41l-.7-.7a1 1 0 1 1 1.41-1.42l.71.71ZM7.76 6.05a1 1 0 0 1-1.42 1.41l-.7-.7a1 1 0 0 1 1.41-1.42l.71.71ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z" />
				</svg>
			) : (
				<svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<path d="M12.1 22c-5.5 0-10-4.5-10-10 0-4.8 3.4-8.8 8.1-9.8.4-.1.8.1 1 .5s0 .8-.3 1.1C9.6 5 8.8 6.9 8.8 9c0 3.9 3.2 7.1 7.1 7.1 2 0 3.9-.8 5.2-2.2.3-.3.7-.4 1.1-.3.4.2.6.6.5 1-1 4.7-5 8.4-10.6 8.4Z" />
				</svg>
			)}
		</button>
	);
}

/* ── GitHub link ──────────────────────────────────────── */

function GitHubLink() {
	return (
		<a
			href="https://github.com/ManzoliW/trucobench"
			target="_blank"
			rel="noopener noreferrer"
			className="w-9 h-9 min-h-[44px] min-w-[44px] flex items-center justify-center rounded bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
			aria-label="View on GitHub"
			title="View on GitHub"
		>
			<svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				<path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.338c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
			</svg>
		</a>
	);
}

/* ── Sound toggle ─────────────────────────────────────── */

function SoundToggle() {
	const [muted, setMutedState] = useState(true);

	useEffect(() => {
		import("@/lib/sounds").then(({ loadMuteState }) => {
			setMutedState(loadMuteState());
		});
	}, []);

	function toggle() {
		const next = !muted;
		setMutedState(next);
		import("@/lib/sounds").then(({ setMuted }) => setMuted(next));
	}

	return (
		<button
			type="button"
			onClick={toggle}
			className="w-9 h-9 min-h-[44px] min-w-[44px] flex items-center justify-center rounded bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
			aria-label={muted ? "Unmute sounds" : "Mute sounds"}
			title={muted ? "Sound off" : "Sound on"}
		>
			{muted ? (
				<svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<path d="M11 5L6 9H2v6h4l5 4V5zm9.07 1.93a1 1 0 0 0-1.42 1.42A5.96 5.96 0 0 1 20.5 12a5.96 5.96 0 0 1-1.85 3.65 1 1 0 0 0 1.42 1.42A7.96 7.96 0 0 0 22.5 12a7.96 7.96 0 0 0-2.43-4.07zM3 3l18 18" />
					<line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
				</svg>
			) : (
				<svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<path d="M11 5L6 9H2v6h4l5 4V5zm5.54 3.46a1 1 0 0 1 1.42 0 5.96 5.96 0 0 1 0 7.08 1 1 0 0 1-1.42-1.42 3.96 3.96 0 0 0 0-4.24 1 1 0 0 1 0-1.42z" />
				</svg>
			)}
		</button>
	);
}

/* ── Locale toggle ────────────────────────────────────── */

function LocaleToggle({ locale, onChange }: { locale: Locale; onChange: (l: Locale) => void }) {
	return (
		<div className="relative">
			<select
				value={locale}
				onChange={(e) => onChange(e.target.value as Locale)}
				className="w-9 h-9 min-h-[44px] min-w-[44px] rounded bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)] text-[11px] font-semibold cursor-pointer appearance-none text-center border-none focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition-colors"
				aria-label="Language"
			>
				{LOCALES.map((l) => (
					<option key={l.value} value={l.value}>
						{l.native}
					</option>
				))}
			</select>
		</div>
	);
}

/* ── Info panel (Help + Stats in one tabbed card) ───── */

function InfoPanel({ locale }: { locale: Locale }) {
	const [tab, setTab] = useState<"help" | "stats">("help");
	const [open, setOpen] = useState(false);
	const [history, setHistory] = useState<ReturnType<typeof getGameHistory>>([]);
	useEffect(() => {
		setHistory(getGameHistory());
	}, []);

	const stats = useMemo(() => computeAggregateStats(history), [history]);
	const hasStats = stats.gamesPlayed > 0;
	const winRate = stats.wins + stats.losses > 0 ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100) : 0;

	return (
		<div className="w-full max-w-md flex flex-col items-center">
			<button
				type="button"
				onClick={() => setOpen((p) => !p)}
				className="torn-paper inline-block px-3 py-1.5 text-xs font-bold cursor-pointer hover:scale-105 transition-transform"
				style={{ transform: "rotate(0.5deg)", fontFamily: "var(--font-ransom-typewriter), 'Special Elite', monospace" }}
				aria-expanded={open}
			>
				{open ? "\u25B4" : "\u25BE"} {t(locale, "info.title")}
			</button>
			{open && (
				<div className="mt-2 torn-paper p-3 sm:p-4 text-xs w-full anim-fade">
					{/* Tabs */}
					<div className="flex gap-1 mb-3 border-b border-[var(--border)]/50 pb-2">
						<button
							type="button"
							onClick={() => setTab("help")}
							className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${tab === "help" ? "bg-[var(--surface-3)] text-[var(--text)]" : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"}`}
						>
							{t(locale, "help.title")}
						</button>
						{hasStats && (
							<button
								type="button"
								onClick={() => setTab("stats")}
								className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${tab === "stats" ? "bg-[var(--surface-3)] text-[var(--text)]" : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"}`}
							>
								{t(locale, "stats.yourStats")}
							</button>
						)}
					</div>
					{/* Content */}
					{tab === "help" && (
						<div className="text-[var(--text-muted)] space-y-2 leading-relaxed">
							<p>{t(locale, "help.p1")}</p>
							<p><strong>Manilhas</strong> &mdash; {t(locale, "help.p2")}</p>
							<p><strong>Truco</strong> &mdash; {t(locale, "help.p3")}</p>
							<p>{t(locale, "help.p4")}</p>
						</div>
					)}
					{tab === "stats" && hasStats && (
						<div className="space-y-2">
							<div className="flex gap-4">
								<div>
									<span className="text-[var(--text-dim)]">{t(locale, "stats.gamesPlayed")}: </span>
									<strong className="tabular-nums">{stats.gamesPlayed}</strong>
								</div>
								<div>
									<span className="text-[var(--text-dim)]">{t(locale, "stats.winRate")}: </span>
									<strong className="tabular-nums">{winRate}%</strong>
									<span className="text-[var(--text-dim)] text-[10px] ml-1">({stats.wins}W {stats.losses}L)</span>
								</div>
							</div>
							{stats.modelRecords.length > 0 && (
								<div>
									<p className="text-[var(--text-dim)] mb-1">{t(locale, "stats.modelRankings")}:</p>
									<div className="space-y-0.5">
										{stats.modelRecords.slice(0, 5).map((rec, i) => {
											const total = rec.wins + rec.losses;
											const pct = total > 0 ? Math.round((rec.wins / total) * 100) : 0;
											return (
												<div key={rec.name} className="flex items-center gap-2">
													<span className="text-[var(--text-dim)] w-4 text-right">{i + 1}.</span>
													<span className="flex-1 truncate">{rec.name}</span>
													<span className="tabular-nums text-[var(--text-dim)]">
														{rec.wins}W {rec.losses}L ({pct}%)
													</span>
												</div>
											);
										})}
									</div>
								</div>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
