import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Send, Bot, User, Settings2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ChatMessage, ChatSession } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { AgentSettingsPanel } from "@/components/agent-settings-panel";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

export default function Chat() {
  const [location, setLocation] = useLocation();
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isCreatingSession = useRef(false);
  const { toast} = useToast();

  // Get or create session from URL query (runs on mount and location change only)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlSessionId = params.get("session");
    const initialMessage = params.get("message");
    
    if (urlSessionId && urlSessionId !== "undefined") {
      // URL has a valid session ID - use it (only if different from current)
      if (sessionId !== urlSessionId) {
        setSessionId(urlSessionId);
      }
    } else if (!urlSessionId && !sessionId && !isCreatingSession.current) {
      // No session in URL and no session state - create new session
      isCreatingSession.current = true;
      (apiRequest("POST", "/api/sessions", { title: "New Chat" }) as unknown as Promise<ChatSession>)
        .then((newSession: ChatSession) => {
          setSessionId(newSession.id);
          setLocation(`/chat?session=${newSession.id}`);
          queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
          isCreatingSession.current = false;
        })
        .catch((error) => {
          console.error("[Chat] Failed to create session:", error);
          toast({
            title: "Failed to create session",
            description: error.message,
            variant: "destructive",
          });
          isCreatingSession.current = false;
        });
    }
    
    // Set initial message if coming from dashboard (only once)
    if (initialMessage && !input) {
      setInput(decodeURIComponent(initialMessage));
    }
  }, [location, sessionId]); // Re-run when location or sessionId changes

  const { data: session } = useQuery<ChatSession>({
    queryKey: [`/api/sessions/${sessionId}`],
    enabled: !!sessionId,
  });

  const { data: messages, isLoading } = useQuery<ChatMessage[]>({
    queryKey: [`/api/chat?sessionId=${sessionId}`],
    enabled: !!sessionId,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!sessionId) throw new Error("No active session. Please refresh the page.");
      if (!content.trim()) throw new Error("Message cannot be empty.");
      return apiRequest("POST", "/api/chat", {
        role: "user",
        content,
        sessionId,
      });
    },
    onSuccess: async (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/chat?sessionId=${sessionId}`] });
      setInput("");
      
      // If an agent was created, reload session and show success toast
      if (data.agentCreated) {
        queryClient.invalidateQueries({ queryKey: [`/api/sessions/${sessionId}`] });
        queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
        queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
        toast({
          title: "Agent Created Successfully!",
          description: "Your AI agent has been created and is ready to use.",
        });
      }
      
      // Update session title from first message
      if (messages?.length === 0 && session?.title === "New Chat") {
        const firstWords = data.userMessage.content.slice(0, 40);
        const newTitle = firstWords.length < data.userMessage.content.length 
          ? `${firstWords}...` 
          : firstWords;
        
        await apiRequest("PATCH", `/api/sessions/${sessionId}`, { title: newTitle });
        queryClient.invalidateQueries({ queryKey: [`/api/sessions/${sessionId}`] });
        queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      }
      
      // Scroll to bottom after message is sent
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    },
    onError: (error: Error) => {
      console.error("[Chat] Failed to send message:", error);
      toast({
        title: "Failed to send message",
        description: error.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate(input);
  };

  // Auto-scroll when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <p className="text-muted-foreground">Loading session...</p>
        </div>
      </div>
    );
  }

  const hasAgent = !!session?.agentId;

  return (
    <div className={cn(
      "flex gap-6 h-[calc(100vh-8rem)]",
      hasAgent ? "max-w-7xl" : "max-w-4xl",
      "mx-auto"
    )}>
      {/* Main Chat Area */}
      <div className={cn(
        "flex flex-col flex-1 min-w-0",
        hasAgent && "border-r"
      )}>
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold" data-testid="text-chat-title">
                {session?.title || "Chat with SoVoice AI"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {hasAgent 
                  ? "Configure your agent or continue chatting"
                  : "Ask me anything about creating AI voice agents"
                }
              </p>
            </div>
            {hasAgent && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
                className="gap-2"
                data-testid="button-toggle-settings"
              >
                <Settings2 className="h-4 w-4" />
                {showSettings ? "Hide" : "Show"} Settings
              </Button>
            )}
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : messages && messages.length > 0 ? (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
                data-testid={`message-${message.role}-${message.id}`}
              >
                {message.role === "assistant" && (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary">
                    <Bot className="h-5 w-5 text-primary-foreground" />
                  </div>
                )}
                <Card
                  className={`p-4 max-w-[80%] ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:mt-3 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-pre:bg-muted prose-pre:p-3 prose-code:text-sm prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-blockquote:border-l-primary prose-blockquote:bg-muted/50 prose-blockquote:py-1 prose-blockquote:px-3 prose-blockquote:my-2">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight]}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  )}
                  <p className="text-xs opacity-70 mt-2">
                    {new Date(message.createdAt).toLocaleTimeString()}
                  </p>
                </Card>
                {message.role === "user" && (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 mb-6">
              <Bot className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-2xl font-semibold mb-3">Welcome to SoVoice AI</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              I'm your AI assistant for creating voice call agents. Ask me anything about:
            </p>
            <div className="grid gap-3 w-full max-w-md text-left">
              <Card className="p-3 hover-elevate cursor-pointer" onClick={() => setInput("Create a customer support agent")}>
                <p className="text-sm font-medium">Creating AI agents</p>
                <p className="text-xs text-muted-foreground">Configure agents for different use cases</p>
              </Card>
              <Card className="p-3 hover-elevate cursor-pointer" onClick={() => setInput("What voice providers are available?")}>
                <p className="text-sm font-medium">Voice selection</p>
                <p className="text-xs text-muted-foreground">Choose between OpenAI and ElevenLabs</p>
              </Card>
              <Card className="p-3 hover-elevate cursor-pointer" onClick={() => setInput("How do I optimize agent prompts?")}>
                <p className="text-sm font-medium">Best practices</p>
                <p className="text-xs text-muted-foreground">Learn prompt engineering tips</p>
              </Card>
            </div>
          </div>
        )}
        
        {/* Loading indicator when sending */}
        {sendMessageMutation.isPending && (
          <div className="flex gap-3 justify-start">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary">
              <Bot className="h-5 w-5 text-primary-foreground animate-pulse" />
            </div>
            <Card className="p-4 bg-card">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                  <span className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                  <span className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                </div>
                <span className="text-xs text-muted-foreground">AI is thinking...</span>
              </div>
            </Card>
          </div>
        )}
        
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-6 border-t border-border">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything about creating AI voice agents..."
              className="flex-1"
              disabled={sendMessageMutation.isPending}
              data-testid="input-chat-message"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !sendMessageMutation.isPending) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <Button
              type="submit"
              disabled={!input.trim() || sendMessageMutation.isPending}
              data-testid="button-send-message"
              className="gap-2"
            >
              <Send className="h-4 w-4" />
              {sendMessageMutation.isPending ? "Sending..." : "Send"}
            </Button>
          </form>
        </div>
      </div>

      {/* Agent Settings Panel */}
      {hasAgent && showSettings && session?.agentId && (
        <div className="w-96 overflow-y-auto py-6 pr-6">
          <AgentSettingsPanel agentId={session.agentId} />
        </div>
      )}
    </div>
  );
}
