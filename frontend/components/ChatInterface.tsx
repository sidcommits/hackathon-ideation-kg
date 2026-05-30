"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import dynamic from "next/dynamic";
import ToolCard from "./ToolCard";
import { AiMessage } from "./AiContent";
import SearchOverlay from "./SearchOverlay";
import { IcoSearch, IcoMic, IcoSend } from "./Icons";
import { useVoiceRecording } from "@/hooks/useVoiceRecording";

const BrainCanvas = dynamic(() => import("./BrainCanvas"), { ssr: false });

type AgentPhase = "idle" | "thinking" | "graph";

export default function ChatInterface() {
  const [agentPhase, setAgentPhase] = useState<AgentPhase>("idle");
  const [searchOpen, setSearchOpen] = useState(false);
  const msgsRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
    append,
    setInput,
  } = useChat({
    api: "/api/chat",
    onResponse: () => setAgentPhase("thinking"),
    onFinish: () => setAgentPhase("graph"),
    onError: () => setAgentPhase("idle"),
  });

  const { isRecording, toggle: toggleMic } = useVoiceRecording({
    onChunk: (text) => setInput((prev) => (prev ? `${prev} ${text}` : text)),
  });

  useEffect(() => {
    if (msgsRef.current)
      msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSearchSubmit = (query: string) => {
    setAgentPhase("thinking");
    append({ role: "user", content: query });
  };

  const onSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    setAgentPhase("thinking");
    handleSubmit(e);
  };

  const statusLabel =
    agentPhase === "thinking"
      ? "Processing..."
      : agentPhase === "graph"
        ? "Ready"
        : "Standby";

  return (
    <>
      <div className="blob blob-tl" />
      <div className="blob blob-tr" />
      <div className="blob blob-bl" />
      <div className="blob blob-br" />

      <div className="app">
        {/* Topbar */}
        <div className="topbar">
          <div className="topbar-logo">
            mastish<span>Q</span>
          </div>
          <button
            className="search-trigger"
            onClick={() => setSearchOpen(true)}
          >
            <IcoSearch />
            <span>Search or start a new conversation...</span>
            <span className="kbd">⌘K</span>
          </button>
          <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
            <button
              className={`icon-btn ${isRecording ? "mic-recording" : ""}`}
              title={isRecording ? "Stop recording" : "Start voice input"}
              onClick={toggleMic}
            >
              <IcoMic size={16} />
            </button>
          </div>
        </div>

        <div className="main-layout">
          {/* Left panel */}
          <div className="left-panel">
            <div className="avatar-section">
              <div className="avatar-img-wrap">
                <div className="avatar-img-ring avatar-img-ring-2" />
                <div className="avatar-img-ring avatar-img-ring-1" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/avatar-placeholder.svg"
                  alt="AI Avatar"
                  className={`avatar-img ${agentPhase === "thinking" ? "thinking" : ""}`}
                />
              </div>
              <div className="avatar-status">{statusLabel}</div>
            </div>
            <div className="viz-section">
              <div className="viz-label">
                {agentPhase === "graph" ? "Knowledge Graph" : "Neural Activity"}
              </div>
              <BrainCanvas phase={agentPhase} />
            </div>
          </div>

          {/* Right panel */}
          <div className="right-panel">
            <div className="messages-wrap" ref={msgsRef}>
              {messages.length === 0 && (
                <div className="empty-state">
                  <div className="empty-state-icon" />
                  <span style={{ fontSize: 13 }}>Ask me anything</span>
                </div>
              )}

              {messages.map((msg) => {
                if (msg.role === "user") {
                  return (
                    <div key={msg.id} className="msg-user">
                      {msg.content as string}
                    </div>
                  );
                }

                if (msg.role === "assistant") {
                  return (
                    <div key={msg.id} className="msg-assistant-group">
                      {msg.parts?.map((part, i) => {
                        if (part.type === "text") {
                          return part.text ? (
                            <AiMessage key={i} content={part.text} />
                          ) : null;
                        }
                        if (part.type === "tool-invocation") {
                          const inv = part.toolInvocation;
                          const isDone = inv.state === "result";
                          return (
                            <ToolCard
                              key={inv.toolCallId}
                              toolName={inv.toolName}
                              args={inv.args}
                              status={isDone ? "done" : "running"}
                              result={
                                isDone
                                  ? (inv as { result: unknown }).result
                                  : undefined
                              }
                            />
                          );
                        }
                        return null;
                      })}
                    </div>
                  );
                }

                return null;
              })}

              {isLoading &&
                (() => {
                  const last = messages[messages.length - 1];
                  const hasText =
                    last?.role === "assistant" &&
                    last.parts?.some(
                      (p) => p.type === "text" && p.text.length > 0,
                    );
                  return !hasText ? (
                    <div className="msg-thinking">
                      <div className="dots">
                        <span />
                        <span />
                        <span />
                      </div>
                      Thinking...
                    </div>
                  ) : null;
                })()}
            </div>

            {/* Input */}
            <div className="chat-input-area">
              <form onSubmit={onSend}>
                <div
                  className={`input-row${isRecording ? " is-recording" : ""}`}
                >
                  {/* Recording badge */}
                  {isRecording && (
                    <div className="rec-badge">
                      <span className="rec-dot" />
                      REC
                    </div>
                  )}

                  <input
                    className="chat-input"
                    placeholder={isRecording ? "Listening…" : "Ask anything…"}
                    value={input}
                    onChange={handleInputChange}
                    disabled={isLoading}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        onSend(e as unknown as React.FormEvent);
                      }
                    }}
                  />

                  {/* Mic button — primary recording trigger */}
                  <button
                    type="button"
                    className={`mic-input-btn${isRecording ? " mic-recording" : ""}`}
                    onClick={toggleMic}
                    title={isRecording ? "Stop recording" : "Start voice input"}
                  >
                    <IcoMic size={15} />
                  </button>

                  {isLoading ? (
                    <button
                      type="button"
                      className="send-btn stop-btn"
                      onClick={() => {
                        stop();
                        setAgentPhase("idle");
                      }}
                      title="Stop generation"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="currentColor"
                      >
                        <rect x="2" y="2" width="10" height="10" rx="1.5" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="send-btn"
                      disabled={!input.trim()}
                    >
                      <IcoSend />
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>

        {searchOpen && (
          <SearchOverlay
            onClose={() => setSearchOpen(false)}
            onSubmit={handleSearchSubmit}
          />
        )}
      </div>
    </>
  );
}
