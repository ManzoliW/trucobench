import type { Metadata } from "next";
import { EB_Garamond, Hanken_Grotesk, Playfair_Display, Special_Elite, Work_Sans } from "next/font/google";
import "./globals.css";
import { ToastContainer } from "./components/Toast";

const garamond = EB_Garamond({
	subsets: ["latin"],
	weight: ["400", "600"],
	style: ["normal", "italic"],
	variable: "--font-display",
	display: "swap",
});

const hanken = Hanken_Grotesk({
	subsets: ["latin"],
	weight: ["300", "500"],
	style: ["normal", "italic"],
	variable: "--font-label",
	display: "swap",
});

const workSans = Work_Sans({
	subsets: ["latin"],
	weight: ["400", "600"],
	style: ["normal", "italic"],
	variable: "--font-ui",
	display: "swap",
});

const playfair = Playfair_Display({
	subsets: ["latin"],
	weight: ["700", "900"],
	variable: "--font-ransom-serif",
	display: "swap",
});

const specialElite = Special_Elite({
	subsets: ["latin"],
	weight: ["400"],
	variable: "--font-ransom-typewriter",
	display: "swap",
});

export const metadata: Metadata = {
	title: "TrucoBench",
	description: "Play Truco Paulista against AI — LLM benchmark with multiplayer support",
	icons: {
		icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🃏</text></svg>",
	},
	other: { "theme-color": "#dddac9" },
	openGraph: {
		title: "TrucoBench",
		description:
			"Play Truco Paulista against AI — LLM benchmark for strategic reasoning, bluffing, and escalation",
		type: "website",
	},
	twitter: {
		card: "summary",
		title: "TrucoBench",
		description:
			"Play Truco Paulista against AI — LLM benchmark for strategic reasoning, bluffing, and escalation",
	},
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className={`${garamond.variable} ${hanken.variable} ${workSans.variable} ${playfair.variable} ${specialElite.variable}`}>
			<body className="min-h-screen antialiased">
				{children}
				<ToastContainer />
			</body>
		</html>
	);
}
