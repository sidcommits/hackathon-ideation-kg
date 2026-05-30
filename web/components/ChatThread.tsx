import type { ChatState } from "@/lib/chatReducer";
import { MessageBubble } from "@/components/MessageBubble";
import { ToolCallCard } from "@/components/ToolCallCard";

export function ChatThread({ state }: { state: ChatState }) {
  return (
    <div className="flex flex-col gap-3">
      {state.messages.map((m, i) => (
        <div key={i}>
          <MessageBubble m={m} />
          {m.role === "assistant" &&
            i === state.messages.length - 1 &&
            state.activeToolCalls.map((c) => <ToolCallCard key={c.id} card={c} />)}
        </div>
      ))}
    </div>
  );
}
