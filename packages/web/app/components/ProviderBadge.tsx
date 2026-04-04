"use client";

import { MODEL_PROVIDERS, getModelProvider } from "@/lib/i18n";
import { PROVIDER_ICONS } from "./ProviderIcons";

interface Props {
	/** Model ID (e.g. "claude-sonnet-4.6") or player type (e.g. "heuristic") */
	model: string;
	size?: "sm" | "md";
}

export function ProviderBadge({ model, size = "sm" }: Props) {
	const providerId = getModelProvider(model);
	const info = MODEL_PROVIDERS[providerId] ?? MODEL_PROVIDERS.local!;
	const IconComponent = PROVIDER_ICONS[providerId];
	const sz = size === "sm" ? "w-5 h-5" : "w-6 h-6";
	const iconSz = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";

	return (
		<span
			className={`${sz} rounded-full font-bold inline-flex items-center justify-center shrink-0 leading-none`}
			style={{ background: info.color, color: "white" }}
			title={info.name}
			aria-label={info.name}
		>
			{IconComponent ? (
				<IconComponent className={iconSz} />
			) : (
				<span className={size === "sm" ? "text-[9px]" : "text-[10px]"}>{info.abbr}</span>
			)}
		</span>
	);
}
