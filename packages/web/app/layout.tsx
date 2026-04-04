import type { Metadata } from "next";
import { EB_Garamond, Hanken_Grotesk, Work_Sans } from "next/font/google";
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

export const metadata: Metadata = {
	title: "TrucoBench",
	description: "Play Truco Paulista against AI — LLM benchmark with multiplayer support",
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
		<html lang="en" className={`${garamond.variable} ${hanken.variable} ${workSans.variable}`}>
			<body className="min-h-screen antialiased">
				{children}
				<ToastContainer />
			</body>
		</html>
	);
}
