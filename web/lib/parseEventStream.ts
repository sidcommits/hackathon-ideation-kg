import type { ChatEvent } from "@/lib/events";

/** Split a buffer on SSE frame boundaries ("\n\n"); parse each `data:` line.
 *  Returns parsed events and the unterminated remainder to re-buffer. */
export function parseSSEChunk(buffer: string): { events: ChatEvent[]; rest: string } {
  const events: ChatEvent[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const frame of parts) {
    const line = frame.split("\n").find((l) => l.startsWith("data: "));
    if (!line) continue;
    try {
      events.push(JSON.parse(line.slice("data: ".length)) as ChatEvent);
    } catch {
      // ignore malformed frame
    }
  }
  return { events, rest };
}
