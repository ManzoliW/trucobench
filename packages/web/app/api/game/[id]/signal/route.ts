import { getGame, sendSignal } from "@/lib/game-manager";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const session = getGame(id);
	if (!session) {
		return Response.json({ error: "Game not found" }, { status: 404 });
	}

	const body = (await request.json()) as { seat: number; type: string };
	if (typeof body.seat !== "number" || typeof body.type !== "string") {
		return Response.json({ error: "Missing seat or type" }, { status: 400 });
	}

	const ok = sendSignal(session, body.seat, body.type);
	if (!ok) {
		return Response.json({ error: "Cannot send signal now" }, { status: 400 });
	}

	return Response.json({ ok: true });
}
