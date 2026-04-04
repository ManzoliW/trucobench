import { continueGame, getGame } from "@/lib/game-manager";
import { NextResponse } from "next/server";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const session = getGame(id);
	if (!session) return NextResponse.json({ error: "Game not found" }, { status: 404 });

	const ok = continueGame(session);
	return NextResponse.json({ ok });
}
