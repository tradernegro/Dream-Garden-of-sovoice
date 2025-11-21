import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { TopNav } from "@/components/top-nav";
import { ThemeProvider } from "@/components/theme-provider";
import { useWebSocket } from "@/hooks/use-websocket";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Chat from "@/pages/chat";
import CallHistory from "@/pages/call-history";
import CallDetail from "@/pages/call-detail";
import Agents from "@/pages/agents";
import Analytics from "@/pages/analytics";
import Settings from "@/pages/settings";
import Projects from "@/pages/projects";
import ProjectDetail from "@/pages/project-detail";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/chat" component={Chat} />
      <Route path="/calls" component={CallHistory} />
      <Route path="/calls/:id" component={CallDetail} />
      <Route path="/projects" component={Projects} />
      <Route path="/projects/:id" component={ProjectDetail} />
      <Route path="/agents" component={Agents} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  // Initialize WebSocket connection for real-time updates
  useWebSocket();

  const style = {
    "--sidebar-width": "18rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <TopNav />
          <main className="flex-1 overflow-auto">
            <div className="container max-w-7xl mx-auto px-6 py-8">
              <Router />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <AppContent />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
