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

  it("parses multiple complete frames in one chunk and leaves no remainder", () => {
    const { events, rest } = parseSSEChunk(
      'data: {"type":"token","text":"a"}\n\ndata: {"type":"message_end","stop_reason":"end_turn"}\n\n',
    );
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: "token", text: "a" });
    expect(events[1]).toMatchObject({ type: "message_end" });
    expect(rest).toBe("");
  });

  it("reassembles a frame split across two reads via the remainder", () => {
    const first = parseSSEChunk('data: {"type":"token","text":"a"}\n\nda');
    expect(first.events).toHaveLength(1);
    const second = parseSSEChunk(first.rest + 'ta: {"type":"token","text":"b"}\n\n');
    expect(second.events).toHaveLength(1);
    expect(second.events[0]).toMatchObject({ type: "token", text: "b" });
  });
});
