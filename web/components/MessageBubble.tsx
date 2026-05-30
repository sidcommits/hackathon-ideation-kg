import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message, Citation } from "@/lib/chatReducer";
import { CitationChip } from "@/components/CitationChip";
import provenance from "@/lib/provenance.json";

// Hosted-file deep link for a cited document (dummy platform URL), if known.
const fileUrl = (docTitle: string): string | undefined =>
  (provenance as Record<string, { url?: string }>)[docTitle]?.url;

/* Honest grounding state — derived mechanically from citation data, never a
   fake confidence %. GROUNDED: corroborated across sources. PARTIAL: thin /
   single-source. UNGROUNDED: nothing met the bar (the one in-answer red alarm). */
type Grounding = { state: "GROUNDED" | "PARTIAL" | "UNGROUNDED"; docs: number; passages: number };
function grounding(citations?: Citation[]): Grounding {
  const passages = citations?.length ?? 0;
  const docs = new Set((citations ?? []).map((c) => c.doc_title)).size;
  const state = passages === 0 ? "UNGROUNDED" : docs >= 2 || passages >= 3 ? "GROUNDED" : "PARTIAL";
  return { state, docs, passages };
}

function GroundingBar({ g }: { g: Grounding }) {
  const lit = g.state === "GROUNDED" ? 3 : g.state === "PARTIAL" ? 2 : 1;
  const isAlarm = g.state === "UNGROUNDED";
  const labelColor = isAlarm
    ? "text-[color:var(--accent)]"
    : g.state === "GROUNDED"
      ? "text-[color:var(--brass)]"
      : "text-[color:var(--fg-2)]";
  const tick = (on: boolean, alarm: boolean) =>
    `h-2.5 w-0.5 rounded-full ${
      on
        ? alarm
          ? "bg-[color:var(--accent)]"
          : "bg-[color:var(--brass)]"
        : "bg-[color:var(--line-2)]"
    }`;
  const detail =
    g.passages === 0
      ? "no qualifying source"
      : `${g.passages} passage${g.passages > 1 ? "s" : ""} · ${g.docs} document${g.docs > 1 ? "s" : ""}`;
  return (
    <div
      className="mb-3 flex items-center gap-2.5"
      title={
        isAlarm
          ? "No passage met the retrieval bar — treat as reasoning, not citation."
          : `Grounding derived from ${detail}.`
      }
    >
      <span className="flex items-end gap-[3px]" aria-hidden>
        <span className={tick(lit >= 1, isAlarm)} />
        <span className={tick(lit >= 2, isAlarm)} />
        <span className={tick(lit >= 3, isAlarm)} />
      </span>
      <span className={`font-mono text-[length:var(--text-2xs)] font-medium uppercase tracking-[0.18em] ${labelColor}`}>
        {g.state}
      </span>
      <span className="font-mono text-[length:var(--text-2xs)] uppercase tracking-[0.12em] text-[color:var(--fg-3)]">
        {detail}
      </span>
    </div>
  );
}

export function MessageBubble({
  m,
  streaming = false,
  onSelectSource,
}: {
  m: Message;
  streaming?: boolean;
  onSelectSource?: (m: Message, docTitle: string) => void;
}) {
  const isUser = m.role === "user";
  const isEmpty = m.text.length === 0;

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm border border-[color:var(--accent-dim)]/35 bg-[color:var(--accent-dim)]/12 px-4 py-2.5 text-[length:var(--text-md)] leading-relaxed text-[color:var(--fg)]">
          <p className="whitespace-pre-wrap">{m.text}</p>
        </div>
      </div>
    );
  }

  const g = grounding(m.citations);
  const hasCitations = !!m.citations && m.citations.length > 0;

  // Assistant turn — a typeset document, not a chat bubble. A red marginalia
  // rule (left) marks it as the authored, citable SIX record.
  return (
    <div className="flex justify-start">
      <article className="max-w-[92%] border-l-2 border-[color:var(--accent-dim)]/70 pl-4 sm:pl-5">
        {(hasCitations || (!isEmpty && !streaming)) && <GroundingBar g={g} />}

        <div className="prose prose-sm max-w-none prose-p:my-2.5 prose-li:my-0.5">
          {isEmpty && !streaming ? (
            <span className="text-[color:var(--fg-3)]">…</span>
          ) : (
            <>
              <span className="contents">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
              </span>
              {streaming && <span className="stream-caret" aria-hidden />}
            </>
          )}
        </div>

        {hasCitations && (
          <div className="mt-4 border-t border-[color:var(--line)] pt-3">
            <span className="kicker block text-[length:var(--text-2xs)]">Provenance</span>
            <div className="mt-2 flex flex-col gap-1">
              {m.citations!.map((c, i) => (
                <CitationChip
                  key={i}
                  c={c}
                  index={i + 1}
                  onSelect={onSelectSource ? () => onSelectSource(m, c.doc_title) : undefined}
                  href={fileUrl(c.doc_title)}
                />
              ))}
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
