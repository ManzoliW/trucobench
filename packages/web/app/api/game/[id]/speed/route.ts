import { getGame, setGameSpeed } from "@/lib/game-manager";
import { NextResponse } from "next/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const session = getGame(id);
	if (!session) return NextResponse.json({ error: "Game not found" }, { status: 404 });

	const { speed } = (await request.json()) as { speed: number };
	setGameSpeed(session, speed);
	return NextResponse.json({ ok: true, speed: session.speedMultiplier });
}
