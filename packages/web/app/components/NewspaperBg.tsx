"use client";

/**
 * Subtle parchment background for the lobby.
 * Clean aged-paper look without the noisy newspaper text columns.
 */
export function NewspaperBg() {
	return (
		<div className="fixed inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
			{/* Aged paper base — light mode */}
			<div
				className="absolute inset-0 dark:hidden"
				style={{
					background: "linear-gradient(145deg, #e2d9c0 0%, #c9be9a 25%, #d6ccab 50%, #bfb48e 75%, #d0c6a2 100%)",
				}}
			/>
			{/* Dark base — dark mode */}
			<div
				className="absolute inset-0 hidden dark:block"
				style={{
					background: "linear-gradient(145deg, #2e2c28 0%, #1e1d1a 25%, #282622 50%, #1c1b18 75%, #252320 100%)",
				}}
			/>
			{/* Paper grain texture — coarse */}
			<div
				className="absolute inset-0 opacity-[0.14] dark:opacity-[0.18]"
				style={{
					backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
					backgroundSize: "180px 180px",
				}}
			/>
			{/* Fine fiber texture layer */}
			<div
				className="absolute inset-0 opacity-[0.06] dark:opacity-[0.08]"
				style={{
					backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 128 128' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='turbulence' baseFrequency='1.5' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E")`,
					backgroundSize: "128px 128px",
					mixBlendMode: "multiply",
				}}
			/>
			{/* Stain / water mark */}
			<div
				className="absolute dark:hidden"
				style={{
					width: "40vw",
					height: "40vw",
					maxWidth: "500px",
					maxHeight: "500px",
					top: "15%",
					right: "-5%",
					borderRadius: "50%",
					background: "radial-gradient(circle, rgba(160,130,80,0.12) 0%, rgba(140,115,70,0.05) 40%, transparent 70%)",
				}}
			/>
			<div
				className="absolute dark:hidden"
				style={{
					width: "30vw",
					height: "30vw",
					maxWidth: "350px",
					maxHeight: "350px",
					bottom: "10%",
					left: "5%",
					borderRadius: "50%",
					background: "radial-gradient(circle, rgba(130,110,70,0.08) 0%, transparent 60%)",
				}}
			/>
			{/* Vignette — heavier */}
			<div
				className="absolute inset-0"
				style={{
					background: "radial-gradient(ellipse at center, transparent 35%, rgba(80,70,50,0.18) 100%)",
				}}
			/>
		</div>
	);
}
