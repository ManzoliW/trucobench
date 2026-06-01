import { decodeResultFromShare } from "@/lib/game-history";
import { formatDuration } from "@/lib/game-stats";
import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const encoded = searchParams.get("r");
	const result = decodeResultFromShare(encoded);

	if (!result) {
		return new ImageResponse(
			<div
				style={{
					width: "100%",
					height: "100%",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					background: "linear-gradient(135deg, #dddac9 0%, #c9be9c 50%, #d1c6a4 100%)",
					fontFamily: "Georgia, serif",
				}}
			>
				<div style={{ fontSize: 72, fontWeight: "bold", color: "#282826" }}>TrucoBench</div>
				<div style={{ fontSize: 28, color: "#5a5750", marginTop: 12 }}>Truco Paulista com IA</div>
			</div>,
			{ width: 1200, height: 630 },
		);
	}

	const scoreText = `${result.scores[0]} — ${result.scores[1]}`;
	const teamNames =
		result.mode === "4p"
			? [
					`${result.players[0]?.name} + ${result.players[2]?.name}`,
					`${result.players[1]?.name} + ${result.players[3]?.name}`,
				]
			: [result.players[0]?.name ?? "Player 1", result.players[1]?.name ?? "Player 2"];
	const winnerName = teamNames[result.winner] ?? "Winner";

	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				background: "linear-gradient(135deg, #dddac9 0%, #c9be9c 50%, #d1c6a4 100%)",
				fontFamily: "Georgia, serif",
				padding: "40px 60px",
			}}
		>
			{/* Title */}
			<div
				style={{
					fontSize: 48,
					fontWeight: "bold",
					color: "#282826",
					marginBottom: 8,
					letterSpacing: "-0.02em",
				}}
			>
				TrucoBench
			</div>
			<div style={{ fontSize: 20, color: "#5a5750", marginBottom: 40 }}>Truco Paulista com IA</div>

			{/* Score card */}
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					background: "#ece9da",
					borderRadius: 24,
					padding: "36px 60px",
					boxShadow: "4px 6px 20px rgba(80, 70, 50, 0.2)",
					border: "2px solid #c4bfae",
				}}
			>
				<div style={{ fontSize: 22, color: "#4f6b3c", fontWeight: "bold", marginBottom: 8 }}>
					{winnerName} wins!
				</div>
				<div
					style={{
						fontSize: 80,
						fontWeight: "bold",
						color: "#282826",
						letterSpacing: "0.02em",
						lineHeight: 1,
						marginBottom: 8,
					}}
				>
					{scoreText}
				</div>
				<div style={{ fontSize: 16, color: "#7a756a", marginBottom: 20 }}>
					{teamNames[0]} vs {teamNames[1]}
				</div>

				{/* Stats row */}
				<div
					style={{
						display: "flex",
						gap: 32,
						fontSize: 16,
						color: "#5a5750",
					}}
				>
					<div style={{ display: "flex", gap: 4 }}>
						<span style={{ color: "#7a756a" }}>Rounds:</span>
						<span style={{ fontWeight: "bold" }}>{result.stats.rounds}</span>
					</div>
					<div style={{ display: "flex", gap: 4 }}>
						<span style={{ color: "#7a756a" }}>Trucos:</span>
						<span style={{ fontWeight: "bold" }}>{result.stats.trucosCalled}</span>
					</div>
					<div style={{ display: "flex", gap: 4 }}>
						<span style={{ color: "#7a756a" }}>Time:</span>
						<span style={{ fontWeight: "bold" }}>{formatDuration(result.stats.duration)}</span>
					</div>
				</div>
			</div>

			{/* Footer */}
			<div style={{ fontSize: 18, color: "#7a756a", marginTop: 32 }}>Play at trucobench.com</div>
		</div>,
		{ width: 1200, height: 630 },
	);
}
