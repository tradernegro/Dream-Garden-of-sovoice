import { MessageSquare, Plus, Sparkles } from "lucide-react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader } from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { ChatSession } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { data: sessions, isLoading } = useQuery<ChatSession[]>({ 
    queryKey: ["/api/sessions"],
    queryFn: () => fetch("/api/sessions?limit=10").then(r => r.json())
  });
  
  const createSessionMutation = useMutation({
    mutationFn: async (): Promise<ChatSession> => {
      return apiRequest("POST", "/api/sessions", { title: "New Chat" }) as unknown as Promise<ChatSession>;
    },
    onSuccess: (newSession: ChatSession) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      setLocation(`/chat?session=${newSession.id}`);
    },
  });

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-primary to-primary/60">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">AI Assistant</h2>
            <p className="text-xs text-muted-foreground">Configure agents via chat</p>
          </div>
        </div>
        <Button 
          className="w-full gap-2" 
          data-testid="button-new-chat"
          onClick={() => createSessionMutation.mutate()}
          disabled={createSessionMutation.isPending}
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Recent Chats</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {isLoading ? (
                <>
                  {[...Array(5)].map((_, i) => (
                    <SidebarMenuItem key={i}>
                      <div className="flex items-center gap-2 px-2 py-2">
                        <Skeleton className="h-4 w-4 rounded" />
                        <Skeleton className="h-4 flex-1" />
                      </div>
                    </SidebarMenuItem>
                  ))}
                </>
              ) : sessions && sessions.length > 0 ? (
                sessions.map((session) => (
                  <SidebarMenuItem key={session.id}>
                    <SidebarMenuButton asChild isActive={location.includes(session.id)}>
                      <Link href={`/chat?session=${session.id}`} data-testid={`link-session-${session.id}`}>
                        <MessageSquare className="h-4 w-4" />
                        <span className="truncate">{session.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              ) : (
                <SidebarMenuItem>
                  <div className="px-2 py-2 text-sm text-muted-foreground">
                    Start a chat to configure agents
                  </div>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
