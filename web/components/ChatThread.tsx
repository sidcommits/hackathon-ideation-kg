import type { ChatState, Message } from "@/lib/chatReducer";
import { MessageBubble } from "@/components/MessageBubble";
import { ToolCallCard } from "@/components/ToolCallCard";
import { DummyConnectors } from "@/components/DummyConnectors"; // DEMO-ONLY (remove to reverse)

export function ChatThread({
  state,
  onOpenSources,
}: {
  state: ChatState;
  onOpenSources?: (m: Message) => void;
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
                  <span>Company Brain</span>
                </>
              )}
            </div>

            {/* Tool calls render under the active assistant turn,
                above the prose, like a reasoning trace. */}
            {m.role === "assistant" && isLast && state.activeToolCalls.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {state.activeToolCalls.map((c) => (
                  <ToolCallCard key={c.id} card={c} />
                ))}
                {/* DEMO-ONLY: mock future connectors. Remove this line to reverse. */}
                <DummyConnectors />
              </div>
            )}

            <MessageBubble
              m={m}
              streaming={m.role === "assistant" && isLast}
              onOpenSources={onOpenSources}
            />
          </div>
        );
      })}
    </div>
  );
}
