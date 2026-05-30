import ReactMarkdown from "react-markdown";
import type { Message } from "@/lib/chatReducer";
import { CitationChip } from "@/components/CitationChip";

export function MessageBubble({
  m,
  streaming = false,
}: {
  m: Message;
  streaming?: boolean;
}) {
  const isUser = m.role === "user";
  const isEmpty = m.text.length === 0;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={
          isUser
            ? "max-w-[82%] rounded-2xl rounded-br-md border border-[color:var(--accent-dim)]/40 bg-[color:var(--accent-dim)]/15 px-4 py-2.5 text-[15px] leading-relaxed text-[color:var(--fg)]"
            : "glass max-w-[88%] rounded-2xl rounded-tl-md px-4 py-3 text-[15px] leading-relaxed text-[color:var(--fg)]"
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{m.text}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none prose-p:my-2 prose-li:my-0.5 prose-headings:text-[color:var(--fg)] prose-headings:font-semibold">
            {isEmpty && !streaming ? (
              <span className="text-[color:var(--fg-3)]">…</span>
            ) : (
              <>
                <span className="contents">
                  <ReactMarkdown>{m.text}</ReactMarkdown>
                </span>
                {streaming && <span className="stream-caret" aria-hidden />}
              </>
            )}
          </div>
        )}

        {m.citations && m.citations.length > 0 && (
          <div className="mt-3 flex flex-col gap-2 border-t border-[color:var(--line)] pt-3">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[color:var(--fg-3)]">
              Sources
            </span>
            <div className="flex flex-wrap gap-1.5">
              {m.citations.map((c, i) => (
                <CitationChip key={i} c={c} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
