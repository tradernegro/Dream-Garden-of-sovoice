import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Bot } from "lucide-react";
import { useState, useEffect } from "react";
import type { Agent } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const VOICES = [
  { value: "alloy", label: "Alloy (Legacy)" },
  { value: "echo", label: "Echo (Legacy)" },
  { value: "shimmer", label: "Shimmer (Legacy)" },
  { value: "fable", label: "Fable (Legacy)" },
  { value: "onyx", label: "Onyx (Legacy)" },
  { value: "nova", label: "Nova (Legacy)" },
  { value: "ash", label: "Ash (Expressive)" },
  { value: "ballad", label: "Ballad (Expressive)" },
  { value: "coral", label: "Coral (Expressive)" },
  { value: "sage", label: "Sage (Expressive)" },
  { value: "verse", label: "Verse (Expressive)" },
  { value: "cedar", label: "Cedar (Realtime)" },
  { value: "marin", label: "Marin (Realtime)" },
];

interface AgentSettingsPanelProps {
  agentId: string;
}

export function AgentSettingsPanel({ agentId }: AgentSettingsPanelProps) {
  const { toast } = useToast();
  const [hasChanges, setHasChanges] = useState(false);

  const { data: agent, isLoading } = useQuery<Agent>({
    queryKey: [`/api/agents/${agentId}`],
    enabled: !!agentId,
  });

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    prompt: "",
    voice: "alloy",
    temperature: 10,
    language: "en",
    isActive: 1,
  });

  useEffect(() => {
    if (agent) {
      setFormData({
        name: agent.name ?? "",
        description: agent.description ?? "",
        prompt: agent.prompt ?? "",
        voice: agent.voice ?? "alloy",
        temperature: agent.temperature ?? 10, // Already stored as 0-20 (x10 scale)
        language: agent.language ?? "en",
        isActive: agent.isActive ?? 1,
      });
    }
  }, [agent]);

  const updateAgentMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // Temperature is already in 0-20 scale (x10), no conversion needed
      return apiRequest("PATCH", `/api/agents/${agentId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/agents/${agentId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      setHasChanges(false);
      toast({
        title: "Agent updated",
        description: "Your changes have been saved successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update agent",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updateAgentMutation.mutate(formData);
  };

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!agent) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Agent not found
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <CardTitle>Agent Settings</CardTitle>
        </div>
        <CardDescription>
          Configure your AI voice agent settings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="agent-name">Name</Label>
          <Input
            id="agent-name"
            value={formData.name}
            onChange={(e) => handleChange("name", e.target.value)}
            placeholder="Agent name"
            data-testid="input-agent-name"
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="agent-description">Description</Label>
          <Textarea
            id="agent-description"
            value={formData.description}
            onChange={(e) => handleChange("description", e.target.value)}
            placeholder="Brief description of the agent's purpose"
            rows={2}
            data-testid="textarea-agent-description"
          />
        </div>

        {/* System Prompt */}
        <div className="space-y-2">
          <Label htmlFor="agent-prompt">System Instructions</Label>
          <Textarea
            id="agent-prompt"
            value={formData.prompt}
            onChange={(e) => handleChange("prompt", e.target.value)}
            placeholder="Instructions that guide the AI's behavior"
            rows={6}
            data-testid="textarea-agent-prompt"
          />
          <p className="text-xs text-muted-foreground">
            These instructions tell the AI how to behave during calls
          </p>
        </div>

        {/* Voice */}
        <div className="space-y-2">
          <Label htmlFor="agent-voice">Voice</Label>
          <Select
            value={formData.voice}
            onValueChange={(value) => handleChange("voice", value)}
          >
            <SelectTrigger id="agent-voice" data-testid="select-agent-voice">
              <SelectValue placeholder="Select voice" />
            </SelectTrigger>
            <SelectContent>
              {VOICES.map((voice) => (
                <SelectItem key={voice.value} value={voice.value}>
                  {voice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Cedar & Marin are the newest and most natural-sounding voices
          </p>
        </div>

        {/* Temperature */}
        <div className="space-y-2">
          <Label htmlFor="agent-temperature">
            Temperature: {(formData.temperature / 10).toFixed(1)}
          </Label>
          <Slider
            id="agent-temperature"
            min={0}
            max={20}
            step={1}
            value={[formData.temperature]}
            onValueChange={(values) => handleChange("temperature", values[0])}
            data-testid="slider-agent-temperature"
          />
          <p className="text-xs text-muted-foreground">
            Higher = more creative, Lower = more focused (0.0 - 2.0)
          </p>
        </div>

        {/* Language */}
        <div className="space-y-2">
          <Label htmlFor="agent-language">Language</Label>
          <Input
            id="agent-language"
            value={formData.language}
            onChange={(e) => handleChange("language", e.target.value)}
            placeholder="en"
            data-testid="input-agent-language"
          />
          <p className="text-xs text-muted-foreground">
            Language code (e.g., en, de, fr, es)
          </p>
        </div>

        {/* Active Status */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="agent-active">Active</Label>
            <p className="text-xs text-muted-foreground">
              Enable this agent for incoming calls
            </p>
          </div>
          <Switch
            id="agent-active"
            checked={formData.isActive === 1}
            onCheckedChange={(checked) => handleChange("isActive", checked ? 1 : 0)}
            data-testid="switch-agent-active"
          />
        </div>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={!hasChanges || updateAgentMutation.isPending}
          className="w-full gap-2"
          data-testid="button-save-agent"
        >
          <Save className="h-4 w-4" />
          {updateAgentMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </CardContent>
    </Card>
  );
}
