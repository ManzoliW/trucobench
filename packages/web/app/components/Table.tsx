"use client";

import type { GameConfig, PlayerConfig, ProviderMode } from "@/lib/game-manager";
import { LOCALES, type Locale, detectLocale, saveLocale, t, toPromptLang } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { GameBoard } from "./GameBoard";
import { Seat } from "./Seat";
import { LobbyBackground } from "./LobbyBackground";
import {
	HuggingFaceIcon,
	OpenRouterIcon,
	VercelIcon,
} from "./ProviderIcons";
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
		seats: ["human", "claude-sonnet-4.6", "gemini-2.5-flash", "gpt-4o"],
		needsKeys: true,
	},
	{
		labelKey: "preset.aiBattle",
		descKey: "preset.aiBattleHint",
		seats: ["claude-sonnet-4.6", "gpt-4o", "gemini-2.5-pro", "deepseek-r1"],
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

	// Table state
	const [seats, setSeats] = useState<(string | null)[]>([null, null, null, null]);
	const [pickerSeat, setPickerSeat] = useState<number | null>(null);

	// Settings (on table surface)
	const [turnTimeout, setTurnTimeout] = useState(60);
	const [promptMode, setPromptMode] = useState<"economy" | "minimal" | "standard" | "verbose">(
		"standard",
	);
	const [temperature, setTemperature] = useState(0.7);
	const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
	const [providerMode, setProviderModeRaw] = useState<ProviderMode>("direct");

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
	const templatesVisible = seats.every((s) => s === null) && !isPlaying;

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

	function applyTemplate(tmpl: TableTemplate) {
		setSeats(tmpl.seats.map((s) => s || null));
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

	/* ── Render: Playing state ── */
	if (isPlaying) {
		return (
			<div className="h-screen flex flex-col p-2 sm:p-3 gap-1.5 sm:gap-2 relative" data-ui>
				<LobbyBackground mode="gameplay" />
				<header className="flex items-center justify-between px-1 relative z-10">
					<h1 className="text-sm sm:text-base font-bold font-display">
						TrucoBench
					</h1>
					<div className="flex items-center gap-2">
						<GitHubLink />
						<SoundToggle />
						<ThemeToggle />
						<LocaleToggle locale={locale} onChange={changeLocale} />
						<button
							type="button"
							onClick={changeTable}
							className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
						>
							{t(locale, "game.newGame")}
						</button>
					</div>
				</header>
				<main className="flex-1 min-h-0 relative z-10">
					<GameBoard gameId={gameId} config={config} onNewGame={resetTable} locale={locale} />
				</main>
			</div>
		);
	}

	/* ── Helper: render a seat row (used in mobile layout) ── */
	function renderSeatRow(idx: number, label: string, fullWidth = true) {
		const player = seats[idx] ? agentToConfig(seats[idx]!, locale) : null;
		return (
			<div
				key={idx}
				onClick={() => setPickerSeat(idx)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						setPickerSeat(idx);
					}
				}}
				role="button"
				tabIndex={0}
				className={`${fullWidth ? "w-full" : "flex-1"} flex items-center gap-3 px-3 py-3 rounded-xl border-2 transition-colors min-h-[56px] cursor-pointer ${
					player
						? "border-[var(--border)] bg-[var(--surface)]"
						: "border-dashed border-[var(--border)] hover:border-[var(--text-dim)]"
				}`}
				style={
					player ? { borderColor: idx % 2 === 0 ? "var(--team-a)" : "var(--team-b)" } : undefined
				}
			>
				{player ? (
					<Seat
						index={idx}
						player={player}
						state="filled"
						locale={locale}
						onTap={() => setPickerSeat(idx)}
						onRemove={() => removeSeat(idx)}
					/>
				) : (
					<>
						<span className="text-lg text-[var(--text-dim)]">+</span>
						<div className="text-left">
							<span className="text-xs text-[var(--text-muted)] block">{label}</span>
							<span className="text-[11px] text-[var(--text-dim)]">
								{t(locale, "seat.tapToFill")}
							</span>
						</div>
					</>
				)}
			</div>
		);
	}

	/* ── Settings pills (shared between mobile & desktop) ── */
	const settingsPills = (
		<div data-shape-mask className="flex flex-wrap items-center justify-center gap-1.5" role="group" aria-label="Game settings">
			<button
				type="button"
				onClick={cycleProvider}
				className={`px-2.5 py-1.5 rounded-lg text-[11px] transition-colors min-h-[44px] inline-flex items-center gap-1.5 ${
					isUnifiedMode
						? "bg-[var(--green)]/20 text-[var(--green-light)] hover:bg-[var(--green)]/30"
						: "bg-[var(--surface)]/50 text-[var(--text-muted)] hover:bg-[var(--surface)]/70 hover:text-[var(--text)]"
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
				className="px-2.5 py-1.5 rounded-lg bg-[var(--surface)]/80 text-[11px] text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)] transition-colors min-h-[44px]"
				aria-label={`Turn timeout: ${turnTimeout > 0 ? `${turnTimeout} seconds` : "no limit"}`}
				title={t(locale, "advanced.timerTip")}
			>
				{turnTimeout > 0 ? `\u23f1 ${turnTimeout}s` : `\u23f1 ${t(locale, "advanced.noLimit")}`}
			</button>
			<button
				type="button"
				onClick={cyclePrompt}
				className="px-2.5 py-1.5 rounded-lg bg-[var(--surface)]/80 text-[11px] text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)] transition-colors min-h-[44px]"
				aria-label={`Prompt mode: ${promptMode}`}
				title={t(locale, "advanced.promptTip")}
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
				className="px-2.5 py-1.5 rounded-lg bg-[var(--surface)]/80 text-[11px] text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)] transition-colors min-h-[44px] tabular-nums"
				aria-label={`Temperature: ${temperature.toFixed(1)}`}
				title={t(locale, "advanced.tempTip")}
			>
				T:{temperature.toFixed(1)}
			</button>
		</div>
	);

	/* ── Templates row (shared) ── */
	const templatesRow = templatesVisible && (
		<div className="flex flex-col sm:flex-row flex-wrap gap-2 justify-center w-full">
			{TEMPLATES.map((tmpl) => (
				<button
					type="button"
					key={tmpl.labelKey}
					onClick={() => applyTemplate(tmpl)}
					className="flex-1 min-w-0 px-4 py-3 rounded-lg bg-[var(--surface)]/60 border border-[var(--table-border)] hover:bg-[var(--surface)]/80 transition-colors min-h-[44px] text-left"
				>
					<span className="text-xs font-semibold text-[var(--text-muted)] block">
						{t(locale, tmpl.labelKey)}
					</span>
					<span className="text-[10px] text-[var(--text-dim)]">{t(locale, tmpl.descKey)}</span>
				</button>
			))}
		</div>
	);

	/* ── Deal button (shared) ── */
	const dealSection = !templatesVisible && filledCount >= 2 && (
		<div className="flex flex-col items-center gap-1.5 w-full sm:w-auto">
			{/* Missing keys warning */}
			{missingKeySeats.length > 0 && (
				<p className="text-xs text-center bg-[var(--surface)]/80 text-[var(--gold)] border border-[var(--gold)]/30 rounded-lg px-3 py-1.5">
					{isUnifiedMode
						? `${providerMode === "openrouter" ? "OpenRouter" : providerMode === "huggingface" ? "Hugging Face" : "Vercel Gateway"} key needed — tap any LLM seat to add`
						: `${missingKeySeats.map((m) => m.model).join(", ")} — tap seat to add API key`}
				</p>
			)}
			<button
				type="button"
				onClick={deal}
				disabled={starting || missingKeySeats.length > 0}
				data-trigger-wave
				className={`w-full sm:w-auto px-8 py-3 rounded-xl font-bold text-sm transition-colors shadow-lg min-h-[44px] ${
					missingKeySeats.length > 0
						? "bg-[var(--surface-3)] text-[var(--text-dim)] cursor-not-allowed"
						: "bg-[var(--accent)] text-white hover:bg-[var(--accent-light)] disabled:opacity-50"
				}`}
			>
				{starting ? t(locale, "start.starting") : t(locale, "table.deal")}
			</button>
		</div>
	);

	/* ── Render: Table (empty/seated states) ── */
	return (
		<div
			className="h-screen flex flex-col p-4 sm:p-6 sm:items-center sm:justify-center relative"
			data-ui
		>
			<LobbyBackground />
			{/* Header — mobile: top bar with branding + locale */}
			<div className="flex items-center justify-between mb-4 sm:absolute sm:top-6 sm:right-6 sm:mb-0 relative z-10">
				<h1 className="text-xl font-bold text-[var(--text)]/80 sm:hidden font-display">
					TrucoBench
				</h1>
				<div className="flex items-center gap-2">
					<GitHubLink />
					<SoundToggle />
					<ThemeToggle />
					<LocaleToggle locale={locale} onChange={changeLocale} />
				</div>
			</div>

			{/* ── MOBILE layout (<640px): table + controls below ── */}
			<div className="flex-1 flex flex-col gap-4 overflow-y-auto sm:hidden relative z-10">
				{/* Templates (above the table) */}
				{templatesRow}

				{/* The table — seats at cardinal positions, straddling edges like desktop */}
				<div data-shape-mask className="relative bg-[var(--table)] rounded-2xl border-2 border-[var(--table-border)] shadow-xl aspect-[4/3] max-w-[min(280px,85vw)] w-full mx-auto flex items-center justify-center overflow-visible my-14">
					<div
						className="absolute inset-0 rounded-2xl opacity-10 pointer-events-none"
						style={{
							background:
								"radial-gradient(ellipse at center, var(--table-light) 0%, transparent 70%)",
						}}
					/>
					{/* Seats at edges — matching desktop positions */}
					<div className="absolute -top-12 left-1/2 -translate-x-1/2 scale-[0.8]">
						<Seat
							index={2}
							player={seats[2] ? agentToConfig(seats[2]!, locale) : null}
							state={seats[2] ? "filled" : "empty"}
							locale={locale}
							onTap={() => setPickerSeat(2)}
							onRemove={seats[2] ? () => removeSeat(2) : undefined}
						/>
					</div>
					<div className="absolute -left-10 top-1/2 -translate-y-1/2 scale-[0.8]">
						<Seat
							index={1}
							player={seats[1] ? agentToConfig(seats[1]!, locale) : null}
							state={seats[1] ? "filled" : "empty"}
							locale={locale}
							onTap={() => setPickerSeat(1)}
							onRemove={seats[1] ? () => removeSeat(1) : undefined}
						/>
					</div>
					<div className="absolute -right-10 top-1/2 -translate-y-1/2 scale-[0.8]">
						<Seat
							index={3}
							player={seats[3] ? agentToConfig(seats[3]!, locale) : null}
							state={seats[3] ? "filled" : "empty"}
							locale={locale}
							onTap={() => setPickerSeat(3)}
							onRemove={seats[3] ? () => removeSeat(3) : undefined}
						/>
					</div>
					<div className="absolute -bottom-12 left-1/2 -translate-x-1/2 scale-[0.8]">
						<Seat
							index={0}
							player={seats[0] ? agentToConfig(seats[0]!, locale) : null}
							state={seats[0] ? "filled" : "empty"}
							locale={locale}
							onTap={() => setPickerSeat(0)}
							onRemove={seats[0] ? () => removeSeat(0) : undefined}
						/>
					</div>
				</div>

				{/* Settings + Keys + Deal (below the table) */}
				{settingsPills}
				{dealSection}
			</div>

			{/* ── DESKTOP layout (>=640px): spatial table ── */}
			<div className="hidden sm:flex sm:flex-col sm:items-center sm:gap-6 w-full max-w-2xl relative z-10">
				<div data-shape-mask className="relative w-full aspect-[3/2] bg-[var(--table)] rounded-3xl border-4 border-[var(--table-border)] shadow-2xl flex items-center justify-center overflow-visible my-16">
					{/* Felt texture */}
					<div
						className="absolute inset-0 rounded-3xl opacity-10 pointer-events-none"
						style={{
							background:
								"radial-gradient(ellipse at center, var(--table-light) 0%, transparent 70%)",
						}}
					/>

					{/* Seats at cardinal positions */}
					{(
						[
							{ idx: 2, cls: "absolute -top-16 left-1/2 -translate-x-1/2" },
							{ idx: 1, cls: "absolute -left-14 top-1/2 -translate-y-1/2" },
							{ idx: 3, cls: "absolute -right-14 top-1/2 -translate-y-1/2" },
							{ idx: 0, cls: "absolute -bottom-16 left-1/2 -translate-x-1/2" },
						] as const
					).map(({ idx, cls }) => (
						<div key={idx} className={cls}>
							<Seat
								index={idx}
								player={seats[idx] ? agentToConfig(seats[idx]!, locale) : null}
								state={seats[idx] ? "filled" : "empty"}
								locale={locale}
								onTap={() => setPickerSeat(idx)}
								onRemove={seats[idx] ? () => removeSeat(idx) : undefined}
							/>
						</div>
					))}

					{/* Center content */}
					<div className="flex flex-col items-center gap-3 z-10 text-center px-4">
						<h1 className="text-3xl font-bold text-white/90 font-display drop-shadow-sm">
							TrucoBench
						</h1>
						<p className="text-xs text-white/60">{t(locale, "app.subtitle")}</p>
						{templatesRow}
						{settingsPills}
						{dealSection}
					</div>
				</div>

				{/* API Keys (outside table so inputs aren't z-index trapped) */}

				{/* Help */}
				<details className="w-full max-w-xl">
					<summary className="text-xs text-[var(--text-dim)] cursor-pointer hover:text-[var(--text-muted)]">
						{t(locale, "help.title")}
					</summary>
					<div className="mt-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 text-xs text-[var(--text-muted)] space-y-2 leading-relaxed">
						<p>{t(locale, "help.p1")}</p>
						<p>
							<strong>Manilhas</strong> &mdash; {t(locale, "help.p2")}
						</p>
						<p>
							<strong>Truco</strong> &mdash; {t(locale, "help.p3")}
						</p>
						<p>{t(locale, "help.p4")}</p>
					</div>
				</details>
			</div>

			{/* Help — mobile only (below the list) */}
			<details className="mt-4 sm:hidden">
				<summary className="text-xs text-[var(--text-dim)] cursor-pointer hover:text-[var(--text-muted)]">
					{t(locale, "help.title")}
				</summary>
				<div className="mt-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 text-xs text-[var(--text-muted)] space-y-2 leading-relaxed">
					<p>{t(locale, "help.p1")}</p>
					<p>
						<strong>Manilhas</strong> &mdash; {t(locale, "help.p2")}
					</p>
					<p>
						<strong>Truco</strong> &mdash; {t(locale, "help.p3")}
					</p>
					<p>{t(locale, "help.p4")}</p>
				</div>
			</details>

			{/* Footer */}
			<footer className="text-center py-3 relative z-10 mt-auto">
				<div className="flex items-center justify-center gap-3 text-[10px] text-[var(--text-dim)]">
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
					onSetApiKey={setApiKey}
					onSetProviderMode={setProviderMode}
					onSelect={(v) => fillSeat(pickerSeat, v)}
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
		if (meta) meta.setAttribute("content", next ? "#282826" : "#dddac9");
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
		<div
			className="flex gap-0.5 bg-[var(--surface-2)] rounded p-0.5"
			role="group"
			aria-label="Language"
		>
			{LOCALES.map((l) => (
				<button
					type="button"
					key={l.value}
					onClick={() => onChange(l.value)}
					aria-pressed={locale === l.value}
					className={`px-2.5 py-1.5 rounded text-[11px] font-semibold min-w-[36px] min-h-[44px] transition-colors ${
						locale === l.value
							? "bg-[var(--surface-3)] text-[var(--text)]"
							: "text-[var(--text-dim)] hover:text-[var(--text-muted)]"
					}`}
				>
					{l.native}
				</button>
			))}
		</div>
	);
}
