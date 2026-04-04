"use client";

import { useEffect, useRef } from "react";

/* ── Config ── */

type ColorDef = { type: "solid"; value: string } | { type: "gradient"; stops: [string, string] };

const GAP = 44;
const WAVE_SPEED = 1100;
const WAVE_WIDTH = 200;

/* Mode-specific configs */
const MODE_CONFIG = {
	lobby: {
		radiusVmin: 28,
		speedIn: 0.45,
		speedOut: 0.55,
		restScale: 0.08,
		minHover: 1,
		maxHover: 2.8,
		enableWaves: true,
	},
	gameplay: {
		radiusVmin: 20,
		speedIn: 0.3,
		speedOut: 0.4,
		restScale: 0.04,
		minHover: 0.6,
		maxHover: 1.5,
		enableWaves: false,
	},
} as const;

/* Medieval palette — light mode (muted earth tones) */
const PALETTE_LIGHT: ColorDef[] = [
	{ type: "solid", value: "#5a3a1f" }, // Raw Umber
	{ type: "solid", value: "#8a3333" }, // Vermilion
	{ type: "solid", value: "#9f4b2b" }, // Minium
	{ type: "solid", value: "#c07c3a" }, // Saffron
	{ type: "solid", value: "#4f6b3c" }, // Malachite
	{ type: "solid", value: "#3f6f61" }, // Verdigris
	{ type: "solid", value: "#495c75" }, // Lapis Lazuli
	{ type: "solid", value: "#5c4e89" }, // Indigo
	{ type: "solid", value: "#a38a3f" }, // Staff Gold
	{ type: "solid", value: "#8f5e32" }, // Bronze
	{ type: "gradient", stops: ["#5a3a1f", "#8a3333"] }, // umber→vermilion
	{ type: "gradient", stops: ["#4f6b3c", "#3f6f61"] }, // malachite→verdigris
	{ type: "gradient", stops: ["#9f4b2b", "#c07c3a"] }, // minium→saffron
	{ type: "gradient", stops: ["#495c75", "#5c4e89"] }, // lapis→indigo
	{ type: "gradient", stops: ["#a38a3f", "#8f5e32"] }, // gold→bronze
];

/* Medieval palette — dark mode (brighter alternates) */
const PALETTE_DARK: ColorDef[] = [
	{ type: "solid", value: "#6b4423" }, // Raw Umber bright
	{ type: "solid", value: "#9e3838" }, // Vermilion bright
	{ type: "solid", value: "#b64e30" }, // Minium bright
	{ type: "solid", value: "#d8913c" }, // Saffron bright
	{ type: "solid", value: "#5b7b43" }, // Malachite bright
	{ type: "solid", value: "#468071" }, // Verdigris bright
	{ type: "solid", value: "#526e8e" }, // Lapis bright
	{ type: "solid", value: "#66589f" }, // Indigo bright
	{ type: "solid", value: "#b89d4a" }, // Gold bright
	{ type: "solid", value: "#a6713d" }, // Bronze bright
	{ type: "gradient", stops: ["#6b4423", "#9e3838"] },
	{ type: "gradient", stops: ["#5b7b43", "#468071"] },
	{ type: "gradient", stops: ["#b64e30", "#d8913c"] },
	{ type: "gradient", stops: ["#526e8e", "#66589f"] },
	{ type: "gradient", stops: ["#b89d4a", "#a6713d"] },
];

/* Card-suit inspired shapes */
const SHAPE_TYPES = ["diamond", "club", "heart", "spade", "circle", "star"] as const;
type ShapeType = (typeof SHAPE_TYPES)[number];

interface Shape {
	x: number;
	y: number;
	type: ShapeType;
	color: ColorDef;
	angle: number;
	size: number;
	scale: number;
	maxScale: number;
	hovered: boolean;
	starPoints: number;
	starInner: number;
}

interface Wave {
	x: number;
	y: number;
	startTime: number;
}

function rnd(min: number, max: number) {
	return Math.random() * (max - min) + min;
}
function pick<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)]!;
}
function smoothstep(t: number) {
	const c = Math.max(0, Math.min(1, t));
	return c * c * (3 - 2 * c);
}
function durationToFactor(seconds: number) {
	if (seconds <= 0) return 1;
	return 1 - 0.05 ** (1 / (60 * seconds));
}

/* ── Shape draw fns ── */

function drawDiamond(ctx: CanvasRenderingContext2D, s: number) {
	ctx.beginPath();
	ctx.moveTo(0, -s);
	ctx.lineTo(s * 0.6, 0);
	ctx.lineTo(0, s);
	ctx.lineTo(-s * 0.6, 0);
	ctx.closePath();
	ctx.fill();
}

function drawHeart(ctx: CanvasRenderingContext2D, s: number) {
	const r = s * 0.5;
	ctx.beginPath();
	ctx.moveTo(0, s * 0.35);
	ctx.bezierCurveTo(-s, -s * 0.3, -s * 0.3, -s, 0, -s * 0.4);
	ctx.bezierCurveTo(s * 0.3, -s, s, -s * 0.3, 0, s * 0.35);
	ctx.closePath();
	ctx.fill();
}

function drawSpade(ctx: CanvasRenderingContext2D, s: number) {
	ctx.beginPath();
	ctx.moveTo(0, -s);
	ctx.bezierCurveTo(-s * 0.8, -s * 0.2, -s, s * 0.5, 0, s * 0.2);
	ctx.bezierCurveTo(s, s * 0.5, s * 0.8, -s * 0.2, 0, -s);
	ctx.closePath();
	ctx.fill();
	// stem
	ctx.fillRect(-s * 0.1, s * 0.1, s * 0.2, s * 0.5);
}

function drawClub(ctx: CanvasRenderingContext2D, s: number) {
	const r = s * 0.32;
	ctx.beginPath();
	ctx.arc(0, -r * 0.9, r, 0, Math.PI * 2);
	ctx.fill();
	ctx.beginPath();
	ctx.arc(-r * 0.85, r * 0.35, r, 0, Math.PI * 2);
	ctx.fill();
	ctx.beginPath();
	ctx.arc(r * 0.85, r * 0.35, r, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillRect(-s * 0.08, r * 0.2, s * 0.16, s * 0.5);
}

function drawCircle(ctx: CanvasRenderingContext2D, s: number) {
	ctx.beginPath();
	ctx.arc(0, 0, s * 0.65, 0, Math.PI * 2);
	ctx.fill();
}

function drawStar(ctx: CanvasRenderingContext2D, s: number, points: number, innerRatio: number) {
	ctx.beginPath();
	for (let i = 0; i < points * 2; i++) {
		const angle = (i * Math.PI) / points - Math.PI / 2;
		const r = i % 2 === 0 ? s : s * innerRatio;
		const x = Math.cos(angle) * r;
		const y = Math.sin(angle) * r;
		i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
	}
	ctx.closePath();
	ctx.fill();
}

function drawShape(ctx: CanvasRenderingContext2D, shape: Shape) {
	switch (shape.type) {
		case "diamond":
			return drawDiamond(ctx, shape.size);
		case "heart":
			return drawHeart(ctx, shape.size);
		case "spade":
			return drawSpade(ctx, shape.size);
		case "club":
			return drawClub(ctx, shape.size);
		case "circle":
			return drawCircle(ctx, shape.size);
		case "star":
			return drawStar(ctx, shape.size, shape.starPoints, shape.starInner);
	}
}

function resolveFill(ctx: CanvasRenderingContext2D, colorDef: ColorDef, size: number) {
	if (colorDef.type === "solid") return colorDef.value;
	const grad = ctx.createRadialGradient(0, -size * 0.3, 0, 0, size * 0.3, size * 1.5);
	grad.addColorStop(0, colorDef.stops[0]!);
	grad.addColorStop(1, colorDef.stops[1]!);
	return grad;
}

function buildGrid(W: number, H: number, palette: ColorDef[]): Shape[] {
	const cols = Math.floor(W / GAP);
	const rows = Math.floor(H / GAP);
	const offsetX = (W - (cols - 1) * GAP) / 2;
	const offsetY = (H - (rows - 1) * GAP) / 2;
	const shapes: Shape[] = [];

	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			shapes.push({
				x: offsetX + col * GAP,
				y: offsetY + row * GAP,
				type: pick([...SHAPE_TYPES]),
				color: pick([...palette]),
				angle: rnd(0, Math.PI * 2),
				size: GAP * 0.38,
				scale: 0,
				maxScale: 0,
				hovered: false,
				starPoints: Math.floor(rnd(4, 10)),
				starInner: rnd(0.1, 0.5),
			});
		}
	}
	return shapes;
}

export function LobbyBackground({ mode = "lobby" }: { mode?: "lobby" | "gameplay" }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const stateRef = useRef<{
		shapes: Shape[];
		waves: Wave[];
		pointer: { x: number; y: number } | null;
		activity: number;
		maskRects: DOMRect[];
		frameCount: number;
		maskOverride: boolean;
		W: number;
		H: number;
	} | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const cfg = MODE_CONFIG[mode];

		function init() {
			const W = window.innerWidth;
			const H = window.innerHeight;
			const dpr = window.devicePixelRatio || 1;
			canvas!.width = W * dpr;
			canvas!.height = H * dpr;
			canvas!.style.width = `${W}px`;
			canvas!.style.height = `${H}px`;
			ctx!.setTransform(1, 0, 0, 1, 0, 0);
			ctx!.scale(dpr, dpr);

			const isDark = document.documentElement.classList.contains("dark");
			const palette = isDark ? PALETTE_DARK : PALETTE_LIGHT;

			stateRef.current = {
				shapes: buildGrid(W, H, palette),
				waves: [],
				pointer: null,
				activity: 0,
				maskRects: [],
				frameCount: 0,
				maskOverride: false,
				W,
				H,
			};
		}

		function triggerWave(x?: number, y?: number) {
			const s = stateRef.current;
			if (!s) return;
			const wx = x ?? s.W / 2;
			const wy = y ?? s.H / 2;
			s.waves.push({ x: wx, y: wy, startTime: performance.now() });
			s.maskOverride = true;
			const delay = Math.sqrt(s.W * s.W + s.H * s.H) / WAVE_SPEED;
			setTimeout(() => {
				if (stateRef.current) stateRef.current.maskOverride = false;
			}, delay * 1000);
		}

		function tick() {
			const s = stateRef.current;
			if (!s || !ctx) {
				rafId = requestAnimationFrame(tick);
				return;
			}

			const { shapes, W, H } = s;
			const radius = Math.min(W, H) * (cfg.radiusVmin / 100);
			const now = performance.now();

			ctx.clearRect(0, 0, W, H);

			s.activity *= 0.93;

			s.frameCount++;
			if (s.frameCount % 10 === 0) {
				s.maskRects = Array.from(document.querySelectorAll("[data-shape-mask]")).map((el) =>
					el.getBoundingClientRect(),
				);
			}

			const maxDist = Math.sqrt(W * W + H * H);
			s.waves = s.waves.filter(
				(w) => ((now - w.startTime) / 1000) * WAVE_SPEED < maxDist + WAVE_WIDTH,
			);

			const pad = GAP / 2;
			const factorIn = durationToFactor(cfg.speedIn);
			const factorOut = durationToFactor(cfg.speedOut);

			for (let i = 0; i < shapes.length; i++) {
				const shape = shapes[i]!;

				const masked =
					!s.maskOverride &&
					s.maskRects.some(
						(r) =>
							shape.x >= r.left - pad &&
							shape.x <= r.right + pad &&
							shape.y >= r.top - pad &&
							shape.y <= r.bottom + pad,
					);

				if (masked) {
					shape.scale += (0 - shape.scale) * factorOut;
					if (shape.scale < 0.005) shape.scale = 0;
					continue;
				}

				let pointerInfluence = 0;
				if (s.pointer && s.activity > 0.001) {
					const dx = shape.x - s.pointer.x;
					const dy = shape.y - s.pointer.y;
					const dist = Math.sqrt(dx * dx + dy * dy);
					pointerInfluence = smoothstep(1 - dist / radius) * s.activity;

					if (pointerInfluence > 0.05 && !shape.hovered) {
						shape.hovered = true;
						shape.maxScale = rnd(cfg.minHover, cfg.maxHover);
						shape.angle = rnd(0, Math.PI * 2);
						if (shape.type === "star") {
							shape.starPoints = Math.floor(rnd(4, 10));
							shape.starInner = rnd(0.1, 0.5);
						}
					} else if (pointerInfluence <= 0.05) {
						shape.hovered = false;
					}
				} else {
					shape.hovered = false;
				}

				let waveInfluence = 0;
				for (let j = 0; j < s.waves.length; j++) {
					const wave = s.waves[j]!;
					const waveRadius = ((now - wave.startTime) / 1000) * WAVE_SPEED;
					const wdx = shape.x - wave.x;
					const wdy = shape.y - wave.y;
					const wdist = Math.sqrt(wdx * wdx + wdy * wdy);
					const t = 1 - Math.abs(wdist - waveRadius) / WAVE_WIDTH;
					if (t > 0) waveInfluence = Math.max(waveInfluence, Math.sin(Math.PI * t));
				}

				const rs = cfg.restScale;
				const pointerTarget = rs + pointerInfluence * (shape.maxScale - rs);
				const waveTarget = rs + waveInfluence * (shape.maxScale - rs);
				const target = Math.max(pointerTarget, waveTarget);

				const factor = target > shape.scale ? factorIn : factorOut;
				shape.scale += (target - shape.scale) * factor;

				if (shape.scale < rs * 0.15) continue;

				// Per-shape opacity: 0.1 far away, 0.3 near pointer/wave
				const proximity = Math.max(pointerInfluence, waveInfluence);
				const shapeAlpha = 0.1 + proximity * 0.2;

				ctx.save();
				ctx.globalAlpha = shapeAlpha;
				ctx.translate(shape.x, shape.y);
				ctx.rotate(shape.angle);
				ctx.scale(shape.scale, shape.scale);
				ctx.fillStyle = resolveFill(ctx, shape.color, shape.size);
				drawShape(ctx, shape);
				ctx.restore();
			}

			rafId = requestAnimationFrame(tick);
		}

		function onMove(e: PointerEvent) {
			if (stateRef.current) {
				stateRef.current.pointer = { x: e.clientX, y: e.clientY };
				stateRef.current.activity = 1;
			}
		}

		function onClick(e: MouseEvent) {
			if (!cfg.enableWaves) return;
			const target = e.target as HTMLElement;
			// Only trigger wave on background clicks or elements that opt in
			if (target.closest("[data-trigger-wave]")) {
				triggerWave(e.clientX, e.clientY);
				return;
			}
			// Skip if clicking any interactive element
			if (target.closest("button, a, input, select, textarea, [role='button'], [role='dialog']"))
				return;
			triggerWave(e.clientX, e.clientY);
		}

		init();
		let rafId = requestAnimationFrame(tick);
		if (cfg.enableWaves) triggerWave();

		window.addEventListener("resize", init);
		window.addEventListener("pointermove", onMove);
		window.addEventListener("click", onClick);

		return () => {
			cancelAnimationFrame(rafId);
			window.removeEventListener("resize", init);
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("click", onClick);
		};
	}, [mode]);

	return (
		<canvas
			ref={canvasRef}
			className="fixed inset-0 pointer-events-none"
			style={{ zIndex: 0 }}
			tabIndex={-1}
			aria-hidden="true"
		/>
	);
}
