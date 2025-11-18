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

export default function Chat() {
  const [, setLocation] = useLocation();
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Get or create session from URL query
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlSessionId = params.get("session");
    const initialMessage = params.get("message");
    
    if (urlSessionId) {
      setSessionId(urlSessionId);
    } else {
      // Create new session if no session ID in URL
      (apiRequest("POST", "/api/sessions", { title: "New Chat" }) as unknown as Promise<ChatSession>)
        .then((newSession: ChatSession) => {
          setSessionId(newSession.id);
          setLocation(`/chat?session=${newSession.id}`);
          queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
        })
        .catch((error) => {
          toast({
            title: "Failed to create session",
            description: error.message,
            variant: "destructive",
          });
        });
    }
    
    // Set initial message if coming from dashboard
    if (initialMessage) {
      setInput(decodeURIComponent(initialMessage));
    }
  }, []);

  const { data: session } = useQuery<ChatSession>({
    queryKey: ["/api/sessions", sessionId],
    queryFn: async () => {
      if (!sessionId) throw new Error("No session ID");
      const response = await fetch(`/api/sessions/${sessionId}`);
      if (!response.ok) throw new Error("Failed to fetch session");
      return response.json();
    },
    enabled: !!sessionId,
  });

  const { data: messages, isLoading } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat", sessionId],
    queryFn: async () => {
      if (!sessionId) return [];
      const response = await fetch(`/api/chat?sessionId=${sessionId}`);
      if (!response.ok) throw new Error("Failed to fetch messages");
      return response.json();
    },
    enabled: !!sessionId,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!sessionId) throw new Error("No session ID");
      return apiRequest("POST", "/api/chat", {
        role: "user",
        content,
        sessionId,
      });
    },
    onSuccess: async (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat", sessionId] });
      setInput("");
      
      // Update session title from first message
      if (messages?.length === 0 && session?.title === "New Chat") {
        const firstWords = data.userMessage.content.slice(0, 40);
        const newTitle = firstWords.length < data.userMessage.content.length 
          ? `${firstWords}...` 
          : firstWords;
        
        await apiRequest("PATCH", `/api/sessions/${sessionId}`, { title: newTitle });
        queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId] });
        queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      }
      
      // Scroll to bottom after message is sent
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send message",
        description: error.message,
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
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
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
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-medium mb-2">Start a conversation</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Ask me about creating AI voice agents, configuring calls, or anything else!
            </p>
          </div>
        )}
        
        {/* Loading indicator when sending */}
        {sendMessageMutation.isPending && (
          <div className="flex gap-3 justify-start">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary">
              <Bot className="h-5 w-5 text-primary-foreground" />
            </div>
            <Card className="p-4">
              <div className="flex gap-1">
                <span className="animate-bounce">●</span>
                <span className="animate-bounce animation-delay-200">●</span>
                <span className="animate-bounce animation-delay-400">●</span>
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
              placeholder="Type your message..."
              className="flex-1"
              disabled={sendMessageMutation.isPending}
              data-testid="input-chat-message"
            />
            <Button
              type="submit"
              disabled={!input.trim() || sendMessageMutation.isPending}
              data-testid="button-send-message"
            >
              <Send className="h-4 w-4" />
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
