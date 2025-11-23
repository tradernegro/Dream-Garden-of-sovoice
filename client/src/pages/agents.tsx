import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Plus, Settings, Trash2, Volume2, Calendar } from "lucide-react";
import type { Agent } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAgentSchema } from "@shared/schema";
import { z } from "zod";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";

interface Voice {
  id: string;
  name: string;
  provider: string;
  category: string;
  description: string;
  previewUrl?: string;
}

const agentFormSchema = insertAgentSchema.extend({
  name: z.string().min(1, "Name is required"),
  prompt: z.string().min(10, "Prompt must be at least 10 characters"),
  calendlyEnabled: z.number().optional(),
  calendlyEventType: z.string().optional(),
});

type AgentFormValues = z.infer<typeof agentFormSchema>;

export default function Agents() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const { toast } = useToast();

  const { data: agents, isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const { data: allVoices = [] } = useQuery<Voice[]>({
    queryKey: ["/api/voices"],
  });

  const { data: calendlyEventTypes = [] } = useQuery<Array<{
    uri: string;
    name: string;
    active: boolean;
  }>>({
    queryKey: ["/api/calendly/event-types"],
    enabled: true,
    retry: false,
  });

  const form = useForm<AgentFormValues>({
    resolver: zodResolver(agentFormSchema),
    defaultValues: {
      name: "",
      description: "",
      prompt: "",
      voiceProvider: "openai",
      voice: "alloy",
      temperature: 10,
      isActive: 1,
      language: "en",
      calendlyEnabled: 0,
      calendlyEventType: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: AgentFormValues) => {
      return await apiRequest("POST", "/api/agents", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      setIsCreateDialogOpen(false);
      form.reset();
      toast({
        title: "Agent created",
        description: "Your AI agent has been created successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AgentFormValues> }) => {
      return await apiRequest("PATCH", `/api/agents/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      setEditingAgent(null);
      form.reset();
      toast({
        title: "Agent updated",
        description: "Your AI agent has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/agents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({
        title: "Agent deleted",
        description: "The AI agent has been deleted successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AgentFormValues) => {
    if (editingAgent) {
      updateMutation.mutate({ id: editingAgent.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent);
    form.reset({
      name: agent.name,
      description: agent.description ?? "",
      prompt: agent.prompt,
      voiceProvider: agent.voiceProvider ?? "openai",
      voice: agent.voice,
      temperature: agent.temperature ?? 10,
      isActive: agent.isActive,
      language: agent.language ?? "en",
      calendlyEnabled: agent.calendlyEnabled ?? 0,
      calendlyEventType: agent.calendlyEventType ?? "",
    });
    setIsCreateDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setIsCreateDialogOpen(open);
    if (!open) {
      setEditingAgent(null);
      form.reset();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-agents-title">AI Agents</h1>
          <p className="text-muted-foreground mt-1">
            Configure and manage your AI voice assistants
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-agent">
              <Plus className="h-4 w-4 mr-2" />
              Create Agent
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingAgent ? "Edit Agent" : "Create New Agent"}</DialogTitle>
              <DialogDescription>
                Configure your AI voice assistant with custom prompts and settings
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agent Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Customer Support Agent" {...field} data-testid="input-agent-name" />
                      </FormControl>
                      <FormDescription>A descriptive name for your AI agent</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Handles customer inquiries and support" {...field} value={field.value || ""} data-testid="input-agent-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="prompt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>System Prompt</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="You are a helpful customer support assistant. Be friendly, professional, and assist customers with their inquiries." 
                          className="min-h-32"
                          {...field} 
                          data-testid="input-agent-prompt"
                        />
                      </FormControl>
                      <FormDescription>Instructions that guide the AI's behavior</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="voiceProvider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Voice Provider</FormLabel>
                      <Select 
                        onValueChange={(value) => {
                          field.onChange(value);
                          // Reset to default voice when provider changes
                          const defaultVoice = value === "openai" ? "alloy" : allVoices.find(v => v.provider === "elevenlabs")?.id || "alloy";
                          form.setValue("voice", defaultVoice);
                        }} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-voice-provider">
                            <SelectValue placeholder="Select provider" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="openai">OpenAI (13 voices)</SelectItem>
                          <SelectItem value="elevenlabs">ElevenLabs ({allVoices.filter(v => v.provider === "elevenlabs").length} voices)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="voice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Voice</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-agent-voice">
                            <SelectValue placeholder="Select voice" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {allVoices
                            .filter(voice => voice.provider === form.watch("voiceProvider"))
                            .map((voice) => (
                              <SelectItem key={voice.id} value={voice.id}>
                                {voice.name} ({voice.category})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      {form.watch("voiceProvider") === "elevenlabs" && allVoices.find(v => v.id === field.value)?.previewUrl && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => {
                            const voice = allVoices.find(v => v.id === field.value);
                            if (voice?.previewUrl) {
                              const audio = new Audio(voice.previewUrl);
                              audio.play();
                            }
                          }}
                          data-testid="button-preview-voice"
                        >
                          <Volume2 className="h-4 w-4 mr-1" />
                          Preview Voice
                        </Button>
                      )}
                      <FormDescription>
                        {form.watch("voiceProvider") === "openai" 
                          ? "Cedar & Marin are the newest OpenAI voices"
                          : "ElevenLabs provides high-quality AI voices"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="language"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Language</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value || "en"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-agent-language">
                            <SelectValue placeholder="Select language" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="es">Spanish</SelectItem>
                          <SelectItem value="fr">French</SelectItem>
                          <SelectItem value="de">German</SelectItem>
                          <SelectItem value="zh">Chinese</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-md border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Active Status</FormLabel>
                        <FormDescription>
                          Enable this agent to handle calls
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value === 1}
                          onCheckedChange={(checked) => field.onChange(checked ? 1 : 0)}
                          data-testid="switch-agent-active"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="calendlyEnabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-md border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>
                          <Calendar className="h-4 w-4 inline-block mr-2" />
                          Calendly Integration
                        </FormLabel>
                        <FormDescription>
                          Allow this agent to schedule appointments via Calendly
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value === 1}
                          onCheckedChange={(checked) => field.onChange(checked ? 1 : 0)}
                          data-testid="switch-calendly-enabled"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {form.watch("calendlyEnabled") === 1 && (
                  <FormField
                    control={form.control}
                    name="calendlyEventType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Calendly Event Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-calendly-event-type">
                              <SelectValue placeholder="Select an event type for appointments" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {calendlyEventTypes.length > 0 ? (
                              calendlyEventTypes
                                .filter(et => et.active)
                                .map((eventType) => (
                                  <SelectItem key={eventType.uri} value={eventType.uri}>
                                    {eventType.name}
                                  </SelectItem>
                                ))
                            ) : (
                              <SelectItem value="none" disabled>
                                No event types available - Connect Calendly first
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Choose which Calendly event type this agent can schedule
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => handleDialogClose(false)}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-save-agent"
                  >
                    {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingAgent ? "Update Agent" : "Create Agent"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Agents List */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : agents && agents.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Card key={agent.id} data-testid={`agent-card-${agent.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{agent.name}</CardTitle>
                      {agent.description && (
                        <CardDescription className="text-xs mt-1">{agent.description}</CardDescription>
                      )}
                    </div>
                  </div>
                  {agent.isActive === 1 ? (
                    <Badge variant="secondary" className="bg-green-500/10 text-green-700 dark:text-green-400">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-2">System Prompt</p>
                  <p className="text-sm line-clamp-3">{agent.prompt}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="capitalize">{agent.voice}</Badge>
                  <Badge variant="outline" className="uppercase">{agent.language}</Badge>
                  {agent.calendlyEnabled === 1 && (
                    <Badge variant="secondary" className="bg-primary/10 text-primary">
                      <Calendar className="h-3 w-3 mr-1" />
                      Calendly
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={() => handleEdit(agent)}
                    data-testid={`button-edit-agent-${agent.id}`}
                  >
                    <Settings className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => deleteMutation.mutate(agent.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-agent-${agent.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
              <h3 className="text-lg font-medium mb-1">No agents yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first AI agent to start handling calls
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first-agent">
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Agent
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
