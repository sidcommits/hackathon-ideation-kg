"use client";
import { useCallback, useRef, useState } from "react";
import { ChatState, initialState, reduce, appendUser } from "@/lib/chatReducer";
import { parseSSEChunk } from "@/lib/parseEventStream";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function useChat() {
  const [state, setState] = useState<ChatState>(initialState());
  const [busy, setBusy] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const send = useCallback(async (text: string) => {
    const withUser = appendUser(stateRef.current, text);
    setState(withUser);
    setBusy(true);

    const history = withUser.messages.map((m) => ({ role: m.role, content: m.text }));
    try {
      const resp = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!resp.ok || !resp.body) throw new Error(`Request failed: HTTP ${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseSSEChunk(buffer);
        buffer = rest;
        for (const ev of events) {
          setState((s) => reduce(s, ev));
        }
      }
    } catch (e) {
      setState((s) => reduce(s, { type: "token", text: `\n\n⚠️ Error: ${String(e)}` }));
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, send };
}
