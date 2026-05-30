import { describe, it, expect } from "vitest";
import { parseSSEChunk } from "@/lib/parseEventStream";

describe("parseSSEChunk", () => {
  it("extracts complete data frames and keeps the remainder buffered", () => {
    const { events, rest } = parseSSEChunk(
      'data: {"type":"token","text":"hi"}\n\ndata: {"type":"message_end"',
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "token", text: "hi" });
    expect(rest).toBe('data: {"type":"message_end"');
  });

  it("returns no events when no frame is complete", () => {
    const { events, rest } = parseSSEChunk('data: {"type":"tok');
    expect(events).toHaveLength(0);
    expect(rest).toBe('data: {"type":"tok');
  });
});
