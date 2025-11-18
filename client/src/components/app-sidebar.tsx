import { Home, Phone, Bot, Settings, BarChart3, MessageSquare, Plus } from "lucide-react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter } from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { ChatSession } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";

const menuItems = [
  { title: "Dashboard", url: "/", icon: Home },
  { title: "Call History", url: "/calls", icon: Phone },
  { title: "Agents", url: "/agents", icon: Bot },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings }
];

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { data: sessions, isLoading } = useQuery<ChatSession[]>({ 
    queryKey: ["/api/sessions"],
    queryFn: () => fetch("/api/sessions?limit=10").then(r => r.json())
  });
  
  const createSessionMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/sessions", { title: "New Chat" });
    },
    onSuccess: (newSession: ChatSession) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      setLocation(`/chat?session=${newSession.id}`);
    },
  });

  return (
    <Sidebar>
      <SidebarHeader className="p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary">
            <Phone className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">SoVoice AI</h1>
            <p className="text-xs text-muted-foreground">Voice Assistant</p>
          </div>
        </div>
        <Button 
          className="w-full mt-4 gap-2" 
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
                  {[...Array(3)].map((_, i) => (
                    <SidebarMenuItem key={i}>
                      <div className="flex items-center gap-2 px-2 py-2">
                        <Skeleton className="h-8 w-8 rounded-md" />
                        <Skeleton className="h-4 w-32" />
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
                  <div className="px-2 py-2 text-sm text-muted-foreground">No chats yet</div>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(" ", "-")}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="text-xs text-muted-foreground">
          <p>Version 1.0.0</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
