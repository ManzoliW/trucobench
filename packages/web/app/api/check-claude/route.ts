let cached: boolean | null = null;

export async function GET() {
	if (cached !== null) return Response.json({ available: cached });

	try {
		const { execSync } = await import("node:child_process");
		execSync("claude --version", { timeout: 5000, stdio: "pipe" });
		cached = true;
	} catch {
		cached = false;
	}

	return Response.json({ available: cached });
}
