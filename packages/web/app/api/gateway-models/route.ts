import { NextResponse } from "next/server";

const GATEWAY_URL = process.env.VERCEL_AI_GATEWAY_URL ?? "https://ai-gateway.vercel.sh/v1";

/** Proxy the gateway /v1/models endpoint so the browser avoids CORS issues. */
export async function POST(request: Request) {
	try {
		const { apiKey } = (await request.json()) as { apiKey?: string };
		const key = apiKey ?? process.env.VERCEL_AI_GATEWAY_API_KEY;
		if (!key) {
			return NextResponse.json({ error: "No API key provided" }, { status: 400 });
		}

		const res = await fetch(`${GATEWAY_URL}/models`, {
			headers: { Authorization: `Bearer ${key}` },
		});

		if (!res.ok) {
			const body = await res.text().catch(() => "");
			return NextResponse.json(
				{ error: `Gateway returned ${res.status}: ${body}` },
				{ status: res.status },
			);
		}

		const data = await res.json();

		// Filter to language models only and return a slim list
		const models = (data.data ?? [])
			.filter((m: Record<string, unknown>) => m.type === "language" || !m.type)
			.map((m: Record<string, unknown>) => ({
				id: m.id as string,
				name: (m.name as string) ?? m.id,
				owned_by: (m.owned_by as string) ?? "",
				context_window: (m.context_window as number) ?? 0,
			}));

		return NextResponse.json({ models });
	} catch (err) {
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : "Failed to fetch models" },
			{ status: 500 },
		);
	}
}
