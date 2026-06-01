"use client";

/**
 * Magazine cut-out ransom-note style title.
 * Each letter gets a random color, font, and slight rotation.
 */

const LETTER_COLORS = [
	"#8a3333", // vermilion
	"#4f6b3c", // malachite
	"#2855a0", // lapis lazuli
	"#5c4e89", // indigo
	"#9f4b2b", // minium
	"#3f6f61", // verdigris
	"#8f5e32", // bronze
	"#6b5040", // dark umber
	"#a38a3f", // staff gold
	"#b55e29", // realgar
];

const LETTER_BG = [
	"#f5f0e8", // aged white
	"#e8d5b7", // tan
	"#ece9da", // parchment
	"#f0e8d4", // warm cream
	"#e6dcc8", // vellum
	"#f2ead8", // ivory
	"#ebe2d0", // papyrus
	"#e4ddd0", // stone
	"#f5ecd8", // pale wheat
	"#ece5d0", // old paper
];

const FONTS = [
	"var(--font-ransom-serif), 'Playfair Display', serif",
	"var(--font-ransom-typewriter), 'Special Elite', monospace",
	"var(--font-display), 'EB Garamond', Georgia, serif",
	"Impact, 'Arial Black', sans-serif",
	"var(--font-ui), 'Work Sans', sans-serif",
];

// Deterministic pseudo-random per letter index
function seededValue(index: number, seed: number, arr: string[]): string {
	return arr[((index * 7 + seed * 13) % arr.length)]!;
}

function seededRotation(index: number): number {
	const rotations = [-4, 2, -1, 3, -2, 1, -3, 2, -1, 4];
	return rotations[index % rotations.length]!;
}

interface Props {
	text: string;
	className?: string;
	/** Use white text with translucent tinted backgrounds — for use on colored buttons */
	inverted?: boolean;
}

const INVERTED_BG = [
	"rgba(255,255,255,0.25)",
	"rgba(255,255,255,0.15)",
	"rgba(0,0,0,0.15)",
	"rgba(255,255,255,0.20)",
	"rgba(0,0,0,0.10)",
	"rgba(255,255,255,0.10)",
	"rgba(0,0,0,0.20)",
	"rgba(255,255,255,0.18)",
];

export function RansomTitle({ text, className = "" }: Props) {
	return (
		<span className={`inline-flex flex-wrap items-center justify-center ${className}`} aria-label={text}>
			{text.split("").map((char, i) => {
				if (char === " ") return <span key={i} className="w-2 sm:w-3" />;
				return (
					<span
						key={i}
						className="ransom-letter"
						style={{
							"--r": `${seededRotation(i)}deg`,
							color: seededValue(i, 3, LETTER_COLORS),
							backgroundColor: seededValue(i, 7, LETTER_BG),
							fontFamily: seededValue(i, 5, FONTS),
							fontWeight: i % 3 === 0 ? 600 : 400,
							fontSize: i % 4 === 0 ? "1.1em" : i % 3 === 0 ? "0.9em" : "1em",
						} as React.CSSProperties}
						aria-hidden="true"
					>
						{char}
					</span>
				);
			})}
		</span>
	);
}

/**
 * Smaller ransom-note style for subtitles and labels.
 * Less rotation, more uniform sizing.
 */
export function RansomLabel({ text, className = "", inverted }: Props) {
	return (
		<span className={`inline-flex flex-wrap items-center gap-px ${className}`} aria-label={text}>
			{text.split("").map((char, i) => {
				if (char === " ") return <span key={i} className="w-1.5" />;
				return (
					<span
						key={i}
						className="inline-block px-[2px] rounded-[1px]"
						style={{
							transform: `rotate(${seededRotation(i) * 0.5}deg)`,
							color: inverted ? "#fff" : seededValue(i, 2, LETTER_COLORS),
							backgroundColor: inverted ? seededValue(i, 11, INVERTED_BG) : seededValue(i, 11, LETTER_BG),
							fontFamily: seededValue(i, 3, FONTS),
							fontWeight: inverted ? 700 : 500,
							fontSize: "inherit",
							lineHeight: 1.2,
							boxShadow: inverted ? "0 1px 3px rgba(0,0,0,0.2)" : "0 1px 2px rgba(0,0,0,0.1)",
						}}
						aria-hidden="true"
					>
						{char}
					</span>
				);
			})}
		</span>
	);
}
