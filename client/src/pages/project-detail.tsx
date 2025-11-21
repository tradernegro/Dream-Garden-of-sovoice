import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Plus, Settings, Users, Workflow, GitBranch, Calendar, MoreVertical, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import type { Project, ProjectPipeline, ProjectWorkflow, ProjectAgent } from "@shared/schema";

const pipelineSchema = z.object({
  name: z.string().min(1, "Pipeline name is required"),
  description: z.string().optional(),
  order: z.number().default(0),
  color: z.string().optional(),
});

const workflowSchema = z.object({
  name: z.string().min(1, "Workflow name is required"),
  description: z.string().optional(),
  type: z.enum(["call_handling", "calendar_integration", "data_sync", "automation"]),
  configuration: z.string().optional(),
  isActive: z.number().default(1),
});

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [activeTab, setActiveTab] = useState("overview");
  const [pipelineDialogOpen, setPipelineDialogOpen] = useState(false);
  const [workflowDialogOpen, setWorkflowDialogOpen] = useState(false);
  const { toast } = useToast();

  // Fetch project data
  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
  });

  const { data: pipelines = [] } = useQuery<ProjectPipeline[]>({
    queryKey: [`/api/projects/${projectId}/pipelines`],
    enabled: !!projectId,
  });

  const { data: workflows = [] } = useQuery<ProjectWorkflow[]>({
    queryKey: [`/api/projects/${projectId}/workflows`],
    enabled: !!projectId,
  });

  const { data: agents = [] } = useQuery<ProjectAgent[]>({
    queryKey: [`/api/projects/${projectId}/agents`],
    enabled: !!projectId,
  });

  // Pipeline mutations
  const createPipelineMutation = useMutation({
    mutationFn: async (data: z.infer<typeof pipelineSchema>) => {
      const response = await apiRequest("POST", `/api/projects/${projectId}/pipelines`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/pipelines`] });
      setPipelineDialogOpen(false);
      toast({
        title: "Pipeline created",
        description: "The pipeline has been created successfully.",
      });
      pipelineForm.reset();
    },
  });

  // Workflow mutations
  const createWorkflowMutation = useMutation({
    mutationFn: async (data: z.infer<typeof workflowSchema>) => {
      const response = await apiRequest("POST", `/api/projects/${projectId}/workflows`, {
        ...data,
        configuration: data.configuration ? JSON.parse(data.configuration) : null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/workflows`] });
      setWorkflowDialogOpen(false);
      toast({
        title: "Workflow created",
        description: "The workflow has been created successfully.",
      });
      workflowForm.reset();
    },
  });

  const pipelineForm = useForm<z.infer<typeof pipelineSchema>>({
    resolver: zodResolver(pipelineSchema),
    defaultValues: {
      name: "",
      description: "",
      order: 0,
      color: "",
    },
  });

  const workflowForm = useForm<z.infer<typeof workflowSchema>>({
    resolver: zodResolver(workflowSchema),
    defaultValues: {
      name: "",
      description: "",
      type: "call_handling",
      configuration: "",
      isActive: 1,
    },
  });

  if (projectLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Card className="text-center py-12">
          <CardContent>
            <h2 className="text-xl font-semibold mb-4">Project not found</h2>
            <Link href="/projects">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Projects
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link href="/projects">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
            <p className="text-muted-foreground mt-1">{project.description || "No description"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={project.status === "active" ? "default" : "secondary"} className="capitalize">
            {project.status}
          </Badge>
          {project.googleCalendarId && (
            <Badge variant="outline">
              <Calendar className="h-3 w-3 mr-1" />
              Calendar Linked
            </Badge>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <Settings className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="pipelines" data-testid="tab-pipelines">
            <GitBranch className="h-4 w-4 mr-2" />
            Pipelines
          </TabsTrigger>
          <TabsTrigger value="workflows" data-testid="tab-workflows">
            <Workflow className="h-4 w-4 mr-2" />
            Workflows
          </TabsTrigger>
          <TabsTrigger value="agents" data-testid="tab-agents">
            <Users className="h-4 w-4 mr-2" />
            Agents
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Project Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Industry</p>
                  <p className="text-sm">{project.industry || "Not specified"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Contact Email</p>
                  <p className="text-sm">{project.contactEmail || "Not specified"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Contact Phone</p>
                  <p className="text-sm">{project.contactPhone || "Not specified"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Created</p>
                  <p className="text-sm">{new Date(project.createdAt).toLocaleDateString()}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Pipelines</span>
                  <Badge variant="secondary">{pipelines.length}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Active Workflows</span>
                  <Badge variant="secondary">{workflows.filter(w => w.isActive).length}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Assigned Agents</span>
                  <Badge variant="secondary">{agents.length}</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pipelines" className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Sales Pipelines</h2>
            <Button onClick={() => setPipelineDialogOpen(true)} data-testid="button-add-pipeline">
              <Plus className="h-4 w-4 mr-2" />
              Add Pipeline
            </Button>
          </div>
          
          {pipelines.length === 0 ? (
            <Card className="text-center py-8">
              <CardContent>
                <GitBranch className="h-8 w-8 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No pipelines configured yet</p>
                <Button onClick={() => setPipelineDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Pipeline
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pipelines.map((pipeline) => (
                <Card key={pipeline.id} data-testid={`card-pipeline-${pipeline.id}`}>
                  <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                    <div className="space-y-1">
                      <CardTitle className="text-base">
                        {pipeline.name}
                      </CardTitle>
                      {pipeline.color && (
                        <div 
                          className="w-full h-1 rounded" 
                          style={{ backgroundColor: pipeline.color }}
                        />
                      )}
                    </div>
                    <Badge variant="outline">Order: {pipeline.order}</Badge>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>
                      {pipeline.description || "No description"}
                    </CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="workflows" className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Workflows</h2>
            <Button onClick={() => setWorkflowDialogOpen(true)} data-testid="button-add-workflow">
              <Plus className="h-4 w-4 mr-2" />
              Add Workflow
            </Button>
          </div>

          {workflows.length === 0 ? (
            <Card className="text-center py-8">
              <CardContent>
                <Workflow className="h-8 w-8 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No workflows configured yet</p>
                <Button onClick={() => setWorkflowDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Workflow
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {workflows.map((workflow) => (
                <Card key={workflow.id} data-testid={`card-workflow-${workflow.id}`}>
                  <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
                    <div className="space-y-1">
                      <CardTitle className="text-base">{workflow.name}</CardTitle>
                      <CardDescription>{workflow.description || "No description"}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {workflow.type.replace("_", " ")}
                      </Badge>
                      <Badge variant={workflow.isActive ? "default" : "secondary"}>
                        {workflow.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="agents" className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Assigned Agents</h2>
            <Button data-testid="button-assign-agent">
              <Plus className="h-4 w-4 mr-2" />
              Assign Agent
            </Button>
          </div>

          {agents.length === 0 ? (
            <Card className="text-center py-8">
              <CardContent>
                <Users className="h-8 w-8 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No agents assigned yet</p>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Assign First Agent
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {agents.map((agent) => (
                <Card key={agent.id} data-testid={`card-agent-${agent.id}`}>
                  <CardHeader>
                    <CardTitle className="text-base">{agent.agentId}</CardTitle>
                    {agent.role && (
                      <CardDescription>{agent.role}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <Badge variant="outline">
                      Priority: {agent.priority ?? 0}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Pipeline Dialog */}
      <Dialog open={pipelineDialogOpen} onOpenChange={setPipelineDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Pipeline</DialogTitle>
            <DialogDescription>
              Add a new sales pipeline stage to this project
            </DialogDescription>
          </DialogHeader>
          <Form {...pipelineForm}>
            <form onSubmit={pipelineForm.handleSubmit((data) => createPipelineMutation.mutate(data))} className="space-y-4">
              <FormField
                control={pipelineForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pipeline Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Lead Qualification" {...field} data-testid="input-pipeline-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={pipelineForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe this pipeline stage..." 
                        {...field} 
                        data-testid="input-pipeline-description"
                        className="resize-none"
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={pipelineForm.control}
                  name="order"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Order</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          {...field} 
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                          data-testid="input-pipeline-order" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={pipelineForm.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Color (Optional)</FormLabel>
                      <FormControl>
                        <Input 
                          type="color" 
                          {...field} 
                          data-testid="input-pipeline-color" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPipelineDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createPipelineMutation.isPending} data-testid="button-save-pipeline">
                  {createPipelineMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Workflow Dialog */}
      <Dialog open={workflowDialogOpen} onOpenChange={setWorkflowDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Workflow</DialogTitle>
            <DialogDescription>
              Add a new workflow to automate processes in this project
            </DialogDescription>
          </DialogHeader>
          <Form {...workflowForm}>
            <form onSubmit={workflowForm.handleSubmit((data) => createWorkflowMutation.mutate(data))} className="space-y-4">
              <FormField
                control={workflowForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Workflow Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Call Follow-up" {...field} data-testid="input-workflow-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={workflowForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Workflow Type</FormLabel>
                    <FormControl>
                      <select 
                        {...field} 
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors"
                        data-testid="select-workflow-type"
                      >
                        <option value="call_handling">Call Handling</option>
                        <option value="calendar_integration">Calendar Integration</option>
                        <option value="data_sync">Data Sync</option>
                        <option value="automation">Automation</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={workflowForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe what this workflow does..." 
                        {...field} 
                        data-testid="input-workflow-description"
                        className="resize-none"
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setWorkflowDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createWorkflowMutation.isPending} data-testid="button-save-workflow">
                  {createWorkflowMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}