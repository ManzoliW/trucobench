"use client";

import { useEffect, useRef, useState } from "react";

export type ToastType = "error" | "warning" | "success" | "info";

export interface ToastMessage {
	id: number;
	type: ToastType;
	text: string;
}

let nextId = 0;

/** Global toast state — components call addToast from anywhere */
const listeners: Set<(toast: ToastMessage) => void> = new Set();

export function addToast(type: ToastType, text: string) {
	const toast: ToastMessage = { id: ++nextId, type, text };
	for (const fn of listeners) fn(toast);
}

const TYPE_STYLES: Record<ToastType, string> = {
	error: "bg-[var(--red)] text-white",
	warning: "bg-[var(--gold-dim)] text-white",
	success: "bg-[var(--green)] text-white",
	info: "bg-[var(--surface-2)] text-[var(--text)] border border-[var(--accent)]/40",
};

export function ToastContainer() {
	const [toasts, setToasts] = useState<ToastMessage[]>([]);
	const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

	useEffect(() => {
		function onToast(toast: ToastMessage) {
			setToasts((prev) => [...prev.slice(-2), toast]);
			const timer = setTimeout(() => {
				setToasts((prev) => prev.filter((t) => t.id !== toast.id));
				timers.current.delete(toast.id);
			}, 5000);
			timers.current.set(toast.id, timer);
		}
		listeners.add(onToast);
		return () => {
			listeners.delete(onToast);
			for (const timer of timers.current.values()) clearTimeout(timer);
		};
	}, []);

	function dismiss(id: number) {
		setToasts((prev) => prev.filter((t) => t.id !== id));
		const timer = timers.current.get(id);
		if (timer) {
			clearTimeout(timer);
			timers.current.delete(id);
		}
	}

	if (toasts.length === 0) return null;

	return (
		<div
			className="fixed top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
			data-ui
		>
			{toasts.map((toast) => (
				<div
					key={toast.id}
					className={`${TYPE_STYLES[toast.type]} rounded-lg px-4 py-3 shadow-lg flex items-start gap-2 pointer-events-auto anim-fade`}
					role="alert"
					aria-live={toast.type === "error" ? "assertive" : "polite"}
				>
					<p className="text-sm flex-1">{toast.text}</p>
					<button
						type="button"
						onClick={() => dismiss(toast.id)}
						className="text-white/70 hover:text-white text-lg leading-none shrink-0 -mt-0.5"
						aria-label="Dismiss"
					>
						{"\u00d7"}
					</button>
				</div>
			))}
		</div>
	);
}
