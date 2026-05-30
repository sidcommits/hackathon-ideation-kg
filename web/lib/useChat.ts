"use client";
import { useCallback, useRef, useState, useEffect } from "react";
import { ChatState, initialState, reduce, appendUser } from "@/lib/chatReducer";
import { parseSSEChunk } from "@/lib/parseEventStream";
import type { ChatEvent } from "@/lib/events";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface CallDetails {
  callId: string;
  livekitUrl: string;
  livekitToken: string;
}

export function useChat() {
  const [state, setState] = useState<ChatState>(initialState());
  const [busy, setBusy] = useState(false);
  const [clearance, setClearance] = useState<string>("C2 Internal");
  const [activeCall, setActiveCall] = useState<CallDetails | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAgentRegistered, setIsAgentRegistered] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;
  const eventSourceRef = useRef<EventSource | null>(null);

  // Standard text-chat loop
  const send = useCallback(async (text: string) => {
    const withUser = appendUser(stateRef.current, text);
    setState(withUser);
    setBusy(true);

    const history = withUser.messages.map((m) => ({ role: m.role, content: m.text }));
    try {
      const resp = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history, max_sensitivity: clearance }),
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
  }, [clearance]);

  // Beyond Presence WebRTC Call Starter (Free Tier Iframe Fallback)
  const startCall = useCallback(async () => {
    setBusy(true);
    try {
      const resp = await fetch(`${API}/api/agent/status`);
      if (!resp.ok) throw new Error("Failed to resolve active digital agent ID.");
      const statusData = await resp.json();
      
      if (!statusData.registered || !statusData.agentId) {
        throw new Error("No active Agent ID available. Please register your public tunnel URL first.");
      }

      // Sync clearance state with the active session
      await fetch(`${API}/api/calls/clearance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clearance }),
      });

      const callDetails: CallDetails = {
        callId: "hackathon-call-id",
        livekitUrl: `https://bey.chat/${statusData.agentId}`,
        livekitToken: "",
      };

      setActiveCall(callDetails);
    } catch (e) {
      alert(`Conversation initiation failed: ${String(e)}`);
      setActiveCall(null);
    } finally {
      setBusy(false);
    }
  }, [clearance]);

  // End active call
  const endCall = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setActiveCall(null);
    setIsSpeaking(false);
  }, []);

  // Beyond Presence Agent Setup / Registration
  const registerAgent = useCallback(async (publicUrl: string) => {
    setBusy(true);
    try {
      const resp = await fetch(`${API}/api/register-agent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicUrl }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.detail || data.error || "Failed to register agent.");
      }
      setIsAgentRegistered(true);
      alert("Beyond Presence Agent successfully created and registered!");
      return data;
    } catch (e) {
      alert(`Agent registration failed: ${String(e)}`);
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  const changeClearance = useCallback(async (level: string) => {
    setClearance(level);
    try {
      await fetch(`${API}/api/calls/clearance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clearance: level }),
      });
    } catch (err) {
      console.error("Failed to sync clearance to backend:", err);
    }
  }, []);

  // Fetch initial knowledge graph, connect persistent SSE events, and cleanup on mount
  useEffect(() => {
    async function fetchGraphAndStatus() {
      try {
        const resp = await fetch(`${API}/api/graph?limit=50`);
        if (resp.ok) {
          const graphData = await resp.json();
          setState((s) => reduce(s, { type: "init_graph", graph: graphData }));
        }

        const statusResp = await fetch(`${API}/api/agent/status`);
        if (statusResp.ok) {
          const statusData = await statusResp.json();
          setIsAgentRegistered(statusData.registered);
        }
      } catch (err) {
        console.error("Failed to load initial graph or status:", err);
      }
    }
    void fetchGraphAndStatus();

    // Initialize persistent parallel EventSource stream to capture dynamic GraphRAG deltas
    const es = new EventSource(`${API}/api/calls/hackathon-call-id/events`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const ev: ChatEvent = JSON.parse(event.data);
        setState((s) => reduce(s, ev));

        if (ev.type === "tool_call") {
          setIsSpeaking(true);
        } else if (ev.type === "message_end") {
          setIsSpeaking(false);
        }
      } catch (err) {
        console.error("Failed to parse parallel call event:", err);
      }
    };

    es.onerror = () => {
      console.error("Parallel call events SSE tunnel encountered an error.");
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return {
    state,
    busy,
    send,
    clearance,
    setClearance: changeClearance,
    activeCall,
    startCall,
    endCall,
    isSpeaking,
    registerAgent,
    isAgentRegistered,
  };
}
