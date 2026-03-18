"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  ChatMessage,
  listChatMessages,
  streamChatMessage,
} from "@/lib/api/chat";
import { Bot, Send, User, Loader2 } from "lucide-react";

interface ProjectChatProps {
  projectId: string;
}

export default function ProjectChat({ projectId }: ProjectChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Load chat history on mount
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    (async () => {
      try {
        const data = await listChatMessages(user.id, projectId);
        if (cancelled) return;
        setMessages(data.messages);
        setSessionId(data.sessionId);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load chat");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, projectId]);

  // Auto-scroll on new messages or streaming content
  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  const sendMessage = async () => {
    if (!input.trim() || !user?.id || isStreaming) return;

    const userMessage = input.trim();
    setInput("");
    setError(null);

    // Optimistic user message
    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      sessionId: sessionId || "",
      role: "user",
      content: userMessage,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setIsStreaming(true);
    setStreamingContent("");

    try {
      let currentSessionId = sessionId;
      let fullContent = "";

      for await (const chunk of streamChatMessage({
        userId: user.id,
        projectId,
        message: userMessage,
        sessionId: currentSessionId || undefined,
      })) {
        if (chunk.type === "session" && chunk.sessionId) {
          currentSessionId = chunk.sessionId;
          setSessionId(chunk.sessionId);
        } else if (chunk.type === "text" && chunk.content) {
          fullContent += chunk.content;
          setStreamingContent(fullContent);
        } else if (chunk.type === "error") {
          setError(chunk.error || "Something went wrong");
        } else if (chunk.type === "done") {
          break;
        }
      }

      // Add final assistant message
      if (fullContent) {
        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          sessionId: currentSessionId || "",
          role: "assistant",
          content: fullContent,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center mb-3">
              <Bot className="w-6 h-6 text-indigo-500" />
            </div>
            <h3 className="text-base font-semibold text-gray-800 mb-1.5">
              Marketing Director
            </h3>
            <p className="text-xs text-gray-500 max-w-sm">
              Ask me anything about your brand strategy, or request tasks like
              &quot;Write a blog post about our product launch&quot; and I&apos;ll
              delegate to the right specialist.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming message */}
        {isStreaming && streamingContent && (
          <MessageBubble
            message={{
              id: "streaming",
              sessionId: "",
              role: "assistant",
              content: streamingContent,
            }}
            isStreaming
          />
        )}

        {/* Streaming indicator */}
        {isStreaming && !streamingContent && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-md px-4 py-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                <div
                  className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"
                  style={{ animationDelay: "0.2s" }}
                />
                <div
                  className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"
                  style={{ animationDelay: "0.4s" }}
                />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 bg-white px-4 py-3">
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask your Marketing Director..."
            rows={1}
            disabled={isStreaming}
            className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed max-h-28"
            style={{ minHeight: "36px" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = `${Math.min(target.scrollHeight, 112)}px`;
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
            className="px-3 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {isStreaming ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  isStreaming,
}: {
  message: ChatMessage;
  isStreaming?: boolean;
}) {
  const isUser = message.role === "user";

  return (
    <div className={`flex items-start gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
          isUser ? "bg-gray-200" : "bg-indigo-100"
        }`}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5 text-gray-600" />
        ) : (
          <Bot className="w-3.5 h-3.5 text-indigo-600" />
        )}
      </div>
      <div
        className={`max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-indigo-500 text-white rounded-tr-md"
            : "bg-white border border-gray-200 text-gray-800 rounded-tl-md"
        } ${isStreaming ? "animate-pulse" : ""}`}
      >
        {message.content}
      </div>
      {message.createdAt && !isStreaming && (
        <span className="text-[9px] text-gray-400 self-end mb-0.5">
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      )}
    </div>
  );
}
