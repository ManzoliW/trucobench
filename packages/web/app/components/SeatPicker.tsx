"use client";

import type { PlayerConfig, ProviderMode } from "@/lib/game-manager";
import { type Locale, MODEL_PROVIDERS, t } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { ProviderBadge } from "./ProviderBadge";

interface AgentOption {
	value: string;
	label: string;
	type: PlayerConfig["type"];
	provider?: string;
}

const LOCAL_AGENTS: AgentOption[] = [
	{ value: "human", label: "You", type: "human" },
	{ value: "heuristic", label: "Heuristic", type: "heuristic" },
	{ value: "random", label: "Random", type: "random" },
];

const LLM_AGENTS: AgentOption[] = [
	{ value: "claude-sonnet-4.6", label: "Claude Sonnet 4.6", type: "llm", provider: "anthropic" },
	{ value: "claude-haiku-4.5", label: "Claude Haiku 4.5", type: "llm", provider: "anthropic" },
	{ value: "gpt-4o", label: "GPT-4o", type: "llm", provider: "openai" },
	{ value: "gpt-4o-mini", label: "GPT-4o Mini", type: "llm", provider: "openai" },
	{ value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", type: "llm", provider: "google" },
	{ value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", type: "llm", provider: "google" },
	{ value: "deepseek-r1", label: "DeepSeek R1", type: "llm", provider: "deepseek" },
];

export const ALL_AGENTS = [...LOCAL_AGENTS, ...LLM_AGENTS];

export function agentToConfig(value: string, locale: Locale): PlayerConfig {
	const a = ALL_AGENTS.find((x) => x.value === value);
	if (!a) {
		// Dynamic gateway model — value is the gateway model ID (e.g. "anthropic/claude-opus-4.6")
		if (value.includes("/")) {
			const name = value.split("/").pop()!;
			return { type: "llm", model: value, name };
		}
		return { type: "random" };
	}
	if (a.type === "llm") return { type: "llm", model: a.value, name: a.label };
	return { type: a.type, name: t(locale, `agent.${a.value}`) };
}

const KEY_PLACEHOLDERS: Record<string, string> = {
	openai: "sk-...",
	anthropic: "sk-ant-...",
	google: "AI...",
	deepseek: "sk-...",
};

const UNIFIED_KEY_PLACEHOLDERS: Record<string, string> = {
	openrouter: "sk-or-...",
	"vercel-gateway": "sk-...",
	huggingface: "hf_...",
};

/** Popular HF models known to work well with chat/instruct tasks */
const HF_POPULAR_MODELS: { id: string; label: string }[] = [
	{ id: "meta-llama/Llama-3.3-70B-Instruct", label: "Llama 3.3 70B" },
	{ id: "meta-llama/Llama-3.1-8B-Instruct", label: "Llama 3.1 8B" },
	{ id: "mistralai/Mistral-Small-24B-Instruct-2501", label: "Mistral Small 24B" },
	{ id: "Qwen/Qwen2.5-72B-Instruct", label: "Qwen 2.5 72B" },
	{ id: "Qwen/Qwen2.5-7B-Instruct", label: "Qwen 2.5 7B" },
	{ id: "google/gemma-2-27b-it", label: "Gemma 2 27B" },
	{ id: "microsoft/Phi-4", label: "Phi 4" },
	{ id: "deepseek-ai/DeepSeek-R1-0528", label: "DeepSeek R1" },
];

export interface GatewayModel {
	id: string;
	name: string;
	owned_by: string;
	context_window: number;
}

interface Props {
	seatIndex: number;
	humanSeated: boolean;
	locale: Locale;
	apiKeys: Record<string, string>;
	claudeAvailable: boolean;
	providerMode: ProviderMode;
	gatewayModels: GatewayModel[];
	onSetApiKey: (provider: string, key: string) => void;
	onSetProviderMode: (mode: ProviderMode) => void;
	onSelect: (value: string) => void;
	onClose: () => void;
}

export function SeatPicker({
	seatIndex,
	humanSeated,
	locale,
	apiKeys,
	claudeAvailable,
	providerMode,
	gatewayModels,
	onSetApiKey,
	onSetProviderMode,
	onSelect,
	onClose,
}: Props) {
	const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
	const [keyDraft, setKeyDraft] = useState("");
	const [customModelId, setCustomModelId] = useState("");
	const dialogRef = useRef<HTMLDivElement>(null);

	// Focus trap: keep Tab cycling inside the dialog
	useEffect(() => {
		const el = dialogRef.current;
		if (!el) return;
		const query = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
		const first = el.querySelector<HTMLElement>(query);
		if (first) first.focus();
		function trap(e: KeyboardEvent) {
			if (e.key !== "Tab") return;
			const focusable = el!.querySelectorAll<HTMLElement>(query);
			if (!focusable.length) return;
			const f = focusable[0]!;
			const l = focusable[focusable.length - 1]!;
			if (e.shiftKey && document.activeElement === f) {
				e.preventDefault();
				l.focus();
			} else if (!e.shiftKey && document.activeElement === l) {
				e.preventDefault();
				f.focus();
			}
		}
		el.addEventListener("keydown", trap);
		return () => el.removeEventListener("keydown", trap);
	}, []);

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
	const isHF = providerMode === "huggingface";

	function handleLLMClick(agent: AgentOption) {
		const provider = agent.provider ?? "local";

		// Unified mode: one key covers all models
		if (isUnifiedMode) {
			if (hasUnifiedKey) {
				onSelect(agent.value);
				return;
			}
			// Show unified key input
			if (expandedProvider === "__unified") return;
			setExpandedProvider("__unified");
			setKeyDraft("");
			return;
		}

		const hasKey = Boolean(apiKeys[provider]);
		const canUseCli = provider === "anthropic" && claudeAvailable;

		if (hasKey || canUseCli) {
			onSelect(agent.value);
			return;
		}

		// No key — expand inline input for this provider
		if (expandedProvider === provider) return;
		setExpandedProvider(provider);
		setKeyDraft("");
	}

	function saveUnifiedKeyAndSelect(agent: AgentOption) {
		if (!keyDraft.trim()) return;
		onSetApiKey(unifiedKeyName, keyDraft.trim());
		onSelect(agent.value);
	}

	function saveKeyAndSelect(agent: AgentOption) {
		const provider = agent.provider ?? "local";
		if (!keyDraft.trim()) return;
		onSetApiKey(provider, keyDraft.trim());
		onSelect(agent.value);
	}

	return (
		<div
			className="fixed inset-0 z-40 flex items-center justify-center p-4"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose();
			}}
			role="dialog"
			aria-modal="true"
			aria-labelledby="seat-picker-title"
		>
			<div ref={dialogRef} className="w-72 max-w-[calc(100vw-2rem)] max-h-[80vh] overflow-y-auto bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl anim-fade">
				{/* Quick picks */}
				<div className="p-2 border-b border-[var(--border)]">
					<p id="seat-picker-title" className="text-[11px] text-[var(--text-dim)] px-1 mb-1.5">
						{t(locale, "seat.quickPicks")}
					</p>
					{!humanSeated && (
						<button
							type="button"
							onClick={() => onSelect("human")}
							className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[var(--surface-2)] transition-colors text-left"
						>
							<span className="text-base">{"\u{1F464}"}</span>
							<div>
								<span className="text-xs font-semibold text-[var(--text)]">
									{t(locale, "agent.human")}
								</span>
								<span className="text-[11px] text-[var(--text-dim)] block">
									{t(locale, "agent.humanNote")}
								</span>
							</div>
						</button>
					)}
					<button
						type="button"
						onClick={() => onSelect("heuristic")}
						className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[var(--surface-2)] transition-colors text-left"
					>
						<span className="text-base">{"\u2699"}</span>
						<div>
							<span className="text-xs font-semibold text-[var(--text)]">
								{t(locale, "agent.heuristic")}
							</span>
							<span className="text-[11px] text-[var(--text-dim)] block">
								{t(locale, "agent.heuristicNote")}
							</span>
						</div>
					</button>
					<button
						type="button"
						onClick={() => onSelect("random")}
						className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[var(--surface-2)] transition-colors text-left"
					>
						<span className="text-base">{"\u{1F3B2}"}</span>
						<div>
							<span className="text-xs font-semibold text-[var(--text)]">
								{t(locale, "agent.random")}
							</span>
							<span className="text-[11px] text-[var(--text-dim)] block">
								{t(locale, "agent.randomNote")}
							</span>
						</div>
					</button>
					{/* Random LLM — picks a random model from available gateway/HF models */}
					{isUnifiedMode && hasUnifiedKey && (
						<button
							type="button"
							onClick={() => {
								const pool =
									isHF
										? HF_POPULAR_MODELS.map((m) => m.id)
										: gatewayModels.length > 0
											? gatewayModels.map((m) => m.id)
											: LLM_AGENTS.map((a) => a.value);
								const pick = pool[Math.floor(Math.random() * pool.length)]!;
								onSelect(pick);
							}}
							className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[var(--surface-2)] transition-colors text-left"
						>
							<span className="text-base">{"\u{1F500}"}</span>
							<div>
								<span className="text-xs font-semibold text-[var(--text)]">
									{t(locale, "agent.randomLlm")}
								</span>
								<span className="text-[11px] text-[var(--text-dim)] block">
									{t(locale, "agent.randomLlmNote")}
								</span>
							</div>
						</button>
					)}
				</div>

				{/* LLM models with inline key entry */}
				<div className="p-2">
					<div className="flex items-center justify-between px-1 mb-1.5">
						<p className="text-[11px] text-[var(--text-dim)]">
							{t(locale, "agent.llmGroup")}
						</p>
						{/* Provider mode toggle */}
						<div className="flex gap-0.5 bg-[var(--surface-2)] rounded p-0.5">
							{(
								[
									{ mode: "direct", label: "Keys" },
									{ mode: "vercel-gateway", label: "Vercel" },
									{ mode: "openrouter", label: "OR" },
									{ mode: "huggingface", label: "HF" },
								] as const
							).map(({ mode, label }) => (
								<button
									type="button"
									key={mode}
									onClick={() => {
										onSetProviderMode(mode);
										setExpandedProvider(null);
										setKeyDraft("");
									}}
									className={`px-1.5 py-0.5 rounded text-[9px] font-semibold transition-colors ${
										providerMode === mode
											? "bg-[var(--surface-3)] text-[var(--text)]"
											: "text-[var(--text-dim)] hover:text-[var(--text-muted)]"
									}`}
								>
									{label}
								</button>
							))}
						</div>
					</div>

					{/* Unified key input (shown at top when in unified mode and no key) */}
					{isUnifiedMode && !hasUnifiedKey && (
						<div className="px-2.5 pb-3 pt-1 mb-1 border-b border-[var(--border)] anim-fade">
							<p className="text-[11px] text-[var(--text-dim)] mb-1.5">
								{providerMode === "openrouter"
									? "OpenRouter"
									: providerMode === "huggingface"
										? "Hugging Face"
										: "Vercel Gateway"}{" "}
								API key:
							</p>
							<div className="flex gap-1.5">
								<input
									type="password"
									value={keyDraft}
									onChange={(e) => setKeyDraft(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter" && keyDraft.trim()) {
											onSetApiKey(unifiedKeyName, keyDraft.trim());
											setExpandedProvider(null);
										}
										e.stopPropagation();
									}}
									placeholder={UNIFIED_KEY_PLACEHOLDERS[unifiedKeyName] ?? "key..."}
									aria-label={`${providerMode === "openrouter" ? "OpenRouter" : providerMode === "huggingface" ? "Hugging Face" : "Vercel Gateway"} API key`}
									className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-dim)]/50 focus:outline-none focus:border-[var(--accent)] min-h-[44px]"
									autoFocus
								/>
								<button
									type="button"
									onClick={() => {
										if (!keyDraft.trim()) return;
										onSetApiKey(unifiedKeyName, keyDraft.trim());
										setExpandedProvider(null);
									}}
									disabled={!keyDraft.trim()}
									className="px-3 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-light)] transition-colors disabled:opacity-40 min-h-[44px]"
								>
									Save
								</button>
							</div>
							<p className="text-[9px] text-[var(--text-dim)] mt-1">
								One key for all models. Saved in your browser only.
								{providerMode === "vercel-gateway" && (
									<span className="block mt-0.5">
										Tip: Use <strong>vercel dev</strong> for OIDC auth, or use
										OpenRouter for local dev.
									</span>
								)}
							</p>
						</div>
					)}

					{/* Unified key status banner */}
					{isUnifiedMode && hasUnifiedKey && (
						<div className="flex items-center gap-2 px-2.5 py-1.5 mb-1 rounded-lg bg-[var(--green)]/10 border border-[var(--green)]/20">
								<span className="text-[var(--green-light)] text-sm">{"\u25CF"}</span>
								<span className="text-[10px] text-[var(--green-light)] flex-1">
									{providerMode === "openrouter"
										? "OpenRouter"
										: providerMode === "huggingface"
											? "Hugging Face"
											: "Vercel Gateway"}{" "}
									key saved
								</span>
							<button
								type="button"
								onClick={() => {
									onSetApiKey(unifiedKeyName, "");
									setExpandedProvider("__unified");
									setKeyDraft("");
								}}
								className="text-[10px] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
							>
								change
							</button>
						</div>
					)}

					{/* HF mode: popular models + custom input */}
					{isHF && hasUnifiedKey && (
						<>
							{HF_POPULAR_MODELS.map((hm) => (
								<button
									type="button"
									key={hm.id}
									onClick={() => onSelect(hm.id)}
									className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[var(--surface-2)] transition-colors text-left"
								>
									<ProviderBadge model={hm.id} size="md" />
									<div className="min-w-0 flex-1">
										<span className="text-xs font-semibold text-[var(--text)] truncate block">
											{hm.label}
										</span>
										<span className="text-[11px] text-[var(--text-dim)]">
											{hm.id.split("/")[0]}
										</span>
									</div>
									<span className="text-[var(--green-light)] text-sm" title="Ready">
										{"\u25CF"}
									</span>
								</button>
							))}
							{/* Custom model input */}
							<div className="px-2.5 pt-2 pb-1 border-t border-[var(--border)] mt-1">
								<p className="text-[11px] text-[var(--text-dim)] mb-1.5">
									Custom model (your fine-tune or any HF model):
								</p>
								<div className="flex gap-1.5">
									<input
										type="text"
										value={customModelId}
										onChange={(e) => setCustomModelId(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter" && customModelId.trim()) {
												onSelect(customModelId.trim());
											}
											e.stopPropagation();
										}}
										placeholder="username/my-truco-model"
										aria-label="Custom Hugging Face model ID"
										className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-dim)]/50 focus:outline-none focus:border-[var(--provider-huggingface)] min-h-[44px]"
									/>
									<button
										type="button"
										onClick={() => {
											if (customModelId.trim()) onSelect(customModelId.trim());
										}}
										disabled={!customModelId.trim()}
										className="px-3 py-1.5 rounded bg-[var(--provider-huggingface)] text-white text-xs font-semibold hover:opacity-90 transition-colors disabled:opacity-40 min-h-[44px]"
									>
										Use
									</button>
								</div>
								<p className="text-[9px] text-[var(--text-dim)] mt-1">
									e.g. your-username/truco-llama-finetune
								</p>
							</div>
						</>
					)}

					{/* Gateway models (dynamic) or hardcoded LLM list */}
					{isUnifiedMode && !isHF && hasUnifiedKey && gatewayModels.length > 0
						? gatewayModels.map((gm) => {
								const providerSlug = gm.id.split("/")[0] ?? "local";
								return (
									<button
										type="button"
										key={gm.id}
										onClick={() => onSelect(gm.id)}
										className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[var(--surface-2)] transition-colors text-left"
									>
										<ProviderBadge model={gm.id} size="md" />
										<div className="min-w-0 flex-1">
											<span className="text-xs font-semibold text-[var(--text)] truncate block">
												{gm.name}
											</span>
											<span className="text-[11px] text-[var(--text-dim)]">
												{providerSlug}
											</span>
										</div>
										<span
											className="text-[var(--green-light)] text-sm"
											title="Ready"
										>
											{"\u25CF"}
										</span>
									</button>
								);
							})
						: !isHF &&
							LLM_AGENTS.map((a) => {
								const provider = a.provider ?? "local";
								const providerInfo = MODEL_PROVIDERS[provider];
								const hasKey = isUnifiedMode
									? hasUnifiedKey
									: Boolean(apiKeys[provider]);
								const canUseCli =
									!isUnifiedMode && provider === "anthropic" && claudeAvailable;
								const isExpanded =
									!isUnifiedMode && expandedProvider === provider;

								return (
									<div key={a.value}>
										<button
											type="button"
											onClick={() => handleLLMClick(a)}
											className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[var(--surface-2)] transition-colors text-left"
										>
											<ProviderBadge model={a.value} size="md" />
											<div className="min-w-0 flex-1">
												<span className="text-xs font-semibold text-[var(--text)] truncate block">
													{a.label}
												</span>
												<span className="text-[11px] text-[var(--text-dim)]" data-label>
													{providerInfo?.name ?? provider}
												</span>
											</div>
											{hasKey ? (
												<span
													className="text-[var(--green-light)] text-sm"
													title="API key saved"
												>
													{"\u25CF"}
												</span>
											) : canUseCli ? (
												<span className="text-[var(--green-light)] text-[10px]">
													Claude Code
												</span>
											) : isUnifiedMode ? (
												<span className="text-[var(--text-dim)] text-[10px]">
													needs{" "}
													{providerMode === "openrouter" ? "OR" : "Vercel"}{" "}
													key
												</span>
											) : (
												<span className="text-[var(--text-dim)] text-[10px]">
													needs key
												</span>
											)}
										</button>

										{isExpanded && !hasKey && !canUseCli && (
											<div className="px-2.5 pb-2 pt-1 anim-fade">
												<p className="text-[11px] text-[var(--text-dim)] mb-1.5">
													{providerInfo?.name ?? provider} API key:
												</p>
												<div className="flex gap-1.5">
													<input
														type="password"
														value={keyDraft}
														onChange={(e) => setKeyDraft(e.target.value)}
														onKeyDown={(e) => {
															if (e.key === "Enter")
																saveKeyAndSelect(a);
															e.stopPropagation();
														}}
														placeholder={
															KEY_PLACEHOLDERS[provider] ?? "key..."
														}
														aria-label={`${providerInfo?.name ?? provider} API key`}
														className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-dim)]/50 focus:outline-none focus:border-[var(--accent)] min-h-[44px]"
														autoFocus
													/>
													<button
														type="button"
														onClick={() => saveKeyAndSelect(a)}
														disabled={!keyDraft.trim()}
														className="px-3 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-light)] transition-colors disabled:opacity-40 min-h-[44px]"
													>
														Go
													</button>
												</div>
												<p className="text-[9px] text-[var(--text-dim)] mt-1">
													Saved in your browser only.
												</p>
											</div>
										)}
									</div>
								);
							})}
				</div>

				{/* Future: Invite */}
				<div className="p-2 border-t border-[var(--border)]">
					<div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg opacity-40 cursor-not-allowed">
						<span className="text-base">{"\u{1F517}"}</span>
						<div>
							<span className="text-xs text-[var(--text-dim)]">
								{t(locale, "seat.inviteFriend")}
							</span>
							<span className="text-[11px] text-[var(--text-dim)] block">
								{t(locale, "seat.comingSoon")}
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
