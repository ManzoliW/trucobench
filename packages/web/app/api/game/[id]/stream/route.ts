import { getGame } from "@/lib/game-manager";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const session = getGame(id);
	if (!session) {
		return new Response("Game not found", { status: 404 });
	}

	const encoder = new TextEncoder();
	let lastEventIndex = 0;
	let closed = false;

	const stream = new ReadableStream({
		start(controller) {
			const interval = setInterval(() => {
				if (closed) {
					clearInterval(interval);
					return;
				}

				try {
					while (lastEventIndex < session.events.length) {
						const event = session.events[lastEventIndex]!;
						const data = `data: ${JSON.stringify(event)}\n\n`;
						controller.enqueue(encoder.encode(data));
						lastEventIndex++;
					}

					if (!session.running && lastEventIndex >= session.events.length) {
						clearInterval(interval);
						closed = true;
						controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
						controller.close();
					}
				} catch {
					// Controller was closed externally (client disconnected)
					clearInterval(interval);
					closed = true;
				}
			}, 50);
		},
		cancel() {
			closed = true;
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}
