"use client";
import { useState } from "react";
import { useChat } from "@/lib/useChat";
import { ChatThread } from "@/components/ChatThread";
import { GraphCanvas } from "@/components/GraphCanvas";

export default function Home() {
  const { state, busy, send } = useChat();
  const [input, setInput] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    void send(q);
  };

  return (
    <main className="grid h-screen grid-cols-1 bg-[#0A0B0D] text-zinc-100 lg:grid-cols-[1fr_480px]">
      <section className="flex flex-col overflow-hidden">
        <header className="border-b border-zinc-800 px-6 py-4 text-sm font-semibold tracking-wide">
          SIX · Company Brain
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <ChatThread state={state} />
        </div>
        <form onSubmit={submit} className="border-t border-zinc-800 p-4">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the company brain…"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-sky-500"
          />
        </form>
      </section>
      <aside className="hidden border-l border-zinc-800 lg:block">
        <GraphCanvas graph={state.graph} />
      </aside>
    </main>
  );
}
