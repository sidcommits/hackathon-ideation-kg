import type { ChatEvent } from "@/lib/events";

/** Split a buffer on SSE frame boundaries; parse each `data:` line.
 *  Tolerates both LF ("\n\n") and CRLF ("\r\n\r\n") frame separators — sse-starlette
 *  (our backend) emits CRLF, so we normalize before splitting. Returns parsed events
 *  and the unterminated remainder to re-buffer. */
export function parseSSEChunk(buffer: string): { events: ChatEvent[]; rest: string } {
  const events: ChatEvent[] = [];
  const parts = buffer.replace(/\r\n/g, "\n").split("\n\n");
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
