"use client";
import { useCallback, useRef, useState, useEffect } from "react";
import { ChatState, initialState, reduce, appendUser } from "@/lib/chatReducer";
import { parseSSEChunk } from "@/lib/parseEventStream";
import type { ChatEvent } from "@/lib/events";
import type { Reflection, Truth } from "@/lib/learnings";

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
  const [reflection, setReflection] = useState<Reflection | null>(null);
  const [reflecting, setReflecting] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [learnedFlash, setLearnedFlash] = useState<string | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const eventSourceRef = useRef<EventSource | null>(null);

  // The persistent EventSource is created once in a mount effect (empty deps),
  // which Next.js Fast Refresh does NOT re-run — so its onmessage closure would
  // otherwise keep calling a STALE `reduce` (e.g. one without the latest event
  // case) after any hot edit, silently dropping events. Routing every frame
  // through this ref — reassigned on EVERY render with the CURRENT reduce — keeps
  // the long-lived handler dispatching through up-to-date code.
  const applyEventRef = useRef<(ev: ChatEvent) => void>(() => {});
  applyEventRef.current = (ev: ChatEvent) => {
    setState((s) => reduce(s, ev));
    if (ev.type === "tool_call") setIsSpeaking(true);
    else if (ev.type === "message_end") setIsSpeaking(false);
  };

  // Standard text-chat loop
  const send = useCallback(
    async (text: string) => {
      const withUser = appendUser(stateRef.current, text);
      setState(withUser);
      setBusy(true);

      const history = withUser.messages.map((m) => ({
        role: m.role,
        content: m.text,
      }));
      try {
        const resp = await fetch(`${API}/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: history,
            max_sensitivity: clearance,
          }),
        });
        if (!resp.ok || !resp.body)
          throw new Error(`Request failed: HTTP ${resp.status}`);

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
        setState((s) =>
          reduce(s, { type: "token", text: `\n\n⚠️ Error: ${String(e)}` }),
        );
      } finally {
        setBusy(false);
      }
    },
    [clearance],
  );

  // ── Recursive improvement: distill chat → truths (read-only), preview, ingest ──
  const reflect = useCallback(async () => {
    const msgs = stateRef.current.messages
      .filter((m) => m.text.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.text }));
    if (msgs.length === 0) return;
    setReflecting(true);
    try {
      const resp = await fetch(`${API}/reflect`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: msgs, max_sensitivity: clearance }),
      });
      const data = await resp.json();
      if (data.ok !== false) {
        setReflection({
          summary: data.summary ?? "",
          truths: data.truths ?? [],
        });
      }
    } catch (e) {
      console.error("reflect failed:", e);
    } finally {
      setReflecting(false);
    }
  }, [clearance]);

  const ingestLearnings = useCallback(
    async (selected: Truth[]) => {
      if (selected.length === 0) {
        setReflection(null);
        return;
      }
      setIngesting(true);
      try {
        const resp = await fetch(`${API}/learnings/ingest`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            truths: selected,
            max_sensitivity: clearance,
          }),
        });
        const data = await resp.json();
        setLearnedFlash(
          data.ok === false
            ? "Could not save learnings."
            : `Saved ${data.chunks_written} learning(s) to the brain.`,
        );
        setReflection(null);
      } catch {
        setLearnedFlash("Could not save learnings.");
      } finally {
        setIngesting(false);
      }
    },
    [clearance],
  );

  const dismissReflection = useCallback(() => setReflection(null), []);

  // Beyond Presence WebRTC Call Starter (Free Tier Iframe Fallback)
  const startCall = useCallback(async () => {
    setBusy(true);
    try {
      const resp = await fetch(`${API}/api/agent/status`);
      if (!resp.ok)
        throw new Error("Failed to resolve active digital agent ID.");
      const statusData = await resp.json();

      if (!statusData.registered || !statusData.agentId) {
        throw new Error(
          "No active Agent ID available. Please register your public tunnel URL first.",
        );
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

  // End active call. Do NOT close the live-events EventSource here — it's the
  // persistent web-mirror channel (owned by the mount effect, closed on unmount).
  // Closing it mid-turn truncated the last answer (caret stuck, half-rendered
  // bubble) and killed the mirror for the rest of the session.
  const endCall = useCallback(() => {
    setActiveCall(null);
    setIsSpeaking(false);
    void reflect();
  }, [reflect]);

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
        throw new Error(
          data.detail || data.error || "Failed to register agent.",
        );
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
    // async function fetchGraphAndStatus() {
    //   try {
    //     const resp = await fetch(`${API}/api/graph?limit=50`);
    //     if (resp.ok) {
    //       const graphData = await resp.json();
    //       setState((s) => reduce(s, { type: "init_graph", graph: graphData }));
    //     }

    //     const statusResp = await fetch(`${API}/api/agent/status`);
    //     if (statusResp.ok) {
    //       const statusData = await statusResp.json();
    //       setIsAgentRegistered(statusData.registered);
    //     }
    //   } catch (err) {
    //     console.error("Failed to load initial graph or status:", err);
    //   }
    // }
    // void fetchGraphAndStatus();

    // Initialize persistent parallel EventSource stream to capture dynamic GraphRAG deltas
    const es = new EventSource(`${API}/api/calls/hackathon-call-id/events`);
    eventSourceRef.current = es;
    // True once WE close it (unmount / Strict-Mode double-invoke), so the abort it
    // triggers isn't mistaken for a real failure.
    let intentionalClose = false;

    es.onmessage = (event) => {
      try {
        // Dispatch through the ref so this once-created handler always uses the
        // latest reducer (survives Fast Refresh — see applyEventRef above).
        applyEventRef.current(JSON.parse(event.data) as ChatEvent);
      } catch (err) {
        console.error("Failed to parse parallel call event:", err);
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects on transient drops (readyState CONNECTING),
      // and Strict Mode's cleanup aborts the first connection — both are normal.
      // Only a permanently CLOSED stream that we didn't close ourselves matters.
      if (intentionalClose || es.readyState !== EventSource.CLOSED) return;
      console.warn("Company Brain live-events stream closed unexpectedly.");
    };

    return () => {
      intentionalClose = true;
      es.close();
      eventSourceRef.current = null;
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
    reflection,
    reflecting,
    ingesting,
    reflect,
    ingestLearnings,
    dismissReflection,
    learnedFlash,
    clearLearnedFlash: () => setLearnedFlash(null),
  };
}
