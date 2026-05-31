import type { ChatState, Message } from "@/lib/chatReducer";
import { MessageBubble } from "@/components/MessageBubble";
import { ToolCallCard } from "@/components/ToolCallCard";
import { DummyConnectors } from "@/components/DummyConnectors"; // DEMO-ONLY (remove to reverse)

export function ChatThread({
  state,
  onSelectSource,
}: {
  state: ChatState;
  onSelectSource?: (m: Message, docTitle: string) => void;
}) {
  const lastIdx = state.messages.length - 1;

  return (
    <div className="flex flex-col gap-6">
      {state.messages.map((m, i) => {
        const isLast = i === lastIdx;
        const isUser = m.role === "user";
        return (
          <div key={i} className="msg-in flex flex-col gap-2">
            <div
              className={`flex items-center gap-2 text-[length:var(--text-xs)] font-medium uppercase tracking-[0.16em] text-[color:var(--fg-3)] ${
                isUser ? "justify-end pr-1" : "pl-1"
              }`}
            >
              {isUser ? (
                <span>You</span>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--accent)] shadow-[0_0_6px_var(--accent-glow)]" />
                  <span>Clooless</span>
                </>
              )}
            </div>

            {/* Tool calls render under their own assistant turn, above the prose,
                like a reasoning trace. Attached to the message (not the ephemeral
                activeToolCalls list) so the async voice mirror renders them
                reliably and each answer keeps its own trace. */}
            {m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {m.toolCalls.map((c) => (
                  <ToolCallCard key={c.id} card={c} />
                ))}
                {/* DEMO-ONLY: mock future connectors (last turn only). Remove to reverse. */}
                {isLast && <DummyConnectors />}
              </div>
            )}

            <MessageBubble
              m={m}
              streaming={m.role === "assistant" && isLast}
              onSelectSource={onSelectSource}
            />
          </div>
        );
      })}
    </div>
  );
}
