import { 
  MessageSquare, 
  Plus, 
  Sparkles, 
  LayoutDashboard,
  FolderKanban,
  Users,
  Phone,
  BarChart3,
  Settings,
  PhoneCall,
  Folder,
  Smartphone
} from "lucide-react";
import { 
  Sidebar, 
  SidebarContent, 
  SidebarGroup, 
  SidebarGroupContent, 
  SidebarGroupLabel, 
  SidebarMenu, 
  SidebarMenuButton, 
  SidebarMenuItem, 
  SidebarHeader,
  SidebarSeparator 
} from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Project } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";

const navigationItems = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    href: "/",
  },
  {
    title: "Projects",
    icon: FolderKanban,
    href: "/projects",
  },
  {
    title: "Agents",
    icon: Users,
    href: "/agents",
  },
  {
    title: "Call History",
    icon: Phone,
    href: "/calls",
  },
  {
    title: "Analytics",
    icon: BarChart3,
    href: "/analytics",
  },
  {
    title: "Phone Numbers",
    icon: Smartphone,
    href: "/phone-numbers",
  },
  {
    title: "Settings",
    icon: Settings,
    href: "/settings",
  },
];

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { data: projects, isLoading } = useQuery<Project[]>({ 
    queryKey: ["/api/projects"],
    queryFn: () => fetch("/api/projects").then(r => r.json())
  });
  
  const createProjectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/projects", { 
        name: "New Project", 
        description: "A new voice agent project",
        twilioPhoneNumber: "",
        googleAccountId: null 
      });
      return await response.json();
    },
    onSuccess: (newProject) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      if (newProject && newProject.id) {
        setLocation(`/projects/${newProject.id}`);
      } else {
        console.error("Project creation failed: no ID returned", newProject);
      }
    },
  });

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gradient-to-br from-primary to-primary/60">
            <PhoneCall className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">SoVoice AI</h2>
            <p className="text-xs text-muted-foreground">Voice Assistant Platform</p>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Main Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => {
                const isActive = location === item.href || 
                  (item.href !== "/" && location.startsWith(item.href));
                
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link 
                        href={item.href} 
                        data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Projects Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center justify-between">
            <span>Projects</span>
            <Button 
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              data-testid="button-new-project-icon"
              onClick={() => createProjectMutation.mutate()}
              disabled={createProjectMutation.isPending}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <Button 
              className="w-full gap-2 mb-3" 
              variant="outline"
              size="sm"
              data-testid="button-start-new-chat"
              onClick={() => setLocation("/chat")}
            >
              <MessageSquare className="h-4 w-4" />
              Start New Chat
            </Button>
            <SidebarMenu>
              {isLoading ? (
                <>
                  {[...Array(3)].map((_, i) => (
                    <SidebarMenuItem key={i}>
                      <div className="flex items-center gap-2 px-2 py-2">
                        <Skeleton className="h-4 w-4 rounded" />
                        <Skeleton className="h-4 flex-1" />
                      </div>
                    </SidebarMenuItem>
                  ))}
                </>
              ) : projects && projects.length > 0 ? (
                projects.map((project) => {
                  const isActive = location.includes(`/projects/${project.id}`);
                  return (
                    <SidebarMenuItem key={project.id}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link href={`/projects/${project.id}`} data-testid={`link-project-${project.id}`}>
                          <Folder className="h-3 w-3" />
                          <span className="truncate text-xs">{project.name}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })
              ) : (
                <SidebarMenuItem>
                  <div className="px-2 py-2 text-xs text-muted-foreground">
                    No projects yet
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