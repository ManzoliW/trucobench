import { getGame, sendChat } from "@/lib/game-manager";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const session = getGame(id);
	if (!session) {
		return Response.json({ error: "Game not found" }, { status: 404 });
	}

	const body = (await request.json()) as { seat: number; text: string };
	if (typeof body.seat !== "number" || typeof body.text !== "string" || !body.text.trim()) {
		return Response.json({ error: "Missing seat or text" }, { status: 400 });
	}

	sendChat(session, body.seat, body.text.trim().slice(0, 200));
	return Response.json({ ok: true });
}
