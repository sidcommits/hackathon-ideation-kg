import ReactMarkdown from "react-markdown";
import type { Message } from "@/lib/chatReducer";
import { CitationChip } from "@/components/CitationChip";

export function MessageBubble({ m }: { m: Message }) {
  const isUser = m.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 ${
          isUser ? "bg-sky-600 text-white" : "bg-zinc-800/70 text-zinc-100"
        }`}
      >
        <div className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown>{m.text || "…"}</ReactMarkdown>
        </div>
        {m.citations && m.citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {m.citations.map((c, i) => (
              <CitationChip key={i} c={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
