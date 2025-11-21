import { useMutation, useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { PhoneIncoming, PhoneOutgoing, Send, User } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Agent } from "@shared/schema";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [chatInput, setChatInput] = useState("");
  const [outboundDialogOpen, setOutboundDialogOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const { toast } = useToast();

  const { data: agents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const makeCallMutation = useMutation({
    mutationFn: async (data: { phoneNumber: string; agentId?: string }) => {
      return apiRequest("POST", "/api/calls", {
        phoneNumber: data.phoneNumber,
        direction: "outbound",
        status: "queued",
        agentId: data.agentId || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calls"] });
      toast({
        title: "Call initiated",
        description: `Calling ${phoneNumber}...`,
      });
      setOutboundDialogOpen(false);
      setPhoneNumber("");
      setSelectedAgent("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to initiate call",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleMakeCall = () => {
    if (!phoneNumber) {
      toast({
        title: "Phone number required",
        description: "Please enter a phone number to call",
        variant: "destructive",
      });
      return;
    }
    makeCallMutation.mutate({ phoneNumber, agentId: selectedAgent });
  };

  const handleChatSubmit = () => {
    if (!chatInput.trim()) return;
    
    // Navigate to chat page with the initial message using Wouter
    setLocation(`/chat?message=${encodeURIComponent(chatInput)}`);
  };

  return (
    <div className="space-y-12 max-w-6xl mx-auto">
      {/* Hero Section */}
      <div className="space-y-8 pt-8">
        <div className="space-y-3">
          <h1 className="text-4xl md:text-5xl font-bold" data-testid="text-dashboard-title">
            Hey, there 👋
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground">
            Let's build your AI voice agent
          </p>
        </div>

        {/* Chat Input */}
        <div className="relative">
          <div className="relative flex items-center gap-2 p-2 rounded-xl border border-border bg-card hover-elevate">
            <Input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleChatSubmit()}
              placeholder="Ask SoVoice to create an AI agent that runs complete debt-recovery calls, posts to a CRM..."
              className="flex-1 border-0 bg-transparent text-base focus-visible:ring-0 focus-visible:ring-offset-0 px-4"
              data-testid="input-chat-message"
            />
            <Button
              size="icon"
              onClick={handleChatSubmit}
              disabled={!chatInput.trim()}
              className="rounded-lg"
              data-testid="button-send-chat"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Quick Start Buttons */}
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Not sure where to start? Try one of these:
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/agents?type=inbound">
              <Button
                variant="outline"
                size="lg"
                className="gap-2"
                data-testid="button-inbound-agent"
              >
                <PhoneIncoming className="h-5 w-5" />
                Inbound Phone Agent
              </Button>
            </Link>
            <Dialog open={outboundDialogOpen} onOpenChange={setOutboundDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="lg"
                  className="gap-2"
                  data-testid="button-outbound-agent"
                >
                  <PhoneOutgoing className="h-5 w-5" />
                  Outbound Phone Agent
                </Button>
              </DialogTrigger>
              <DialogContent data-testid="dialog-make-call">
                <DialogHeader>
                  <DialogTitle>Make Outbound Call</DialogTitle>
                  <DialogDescription>
                    Enter a phone number to initiate an AI-powered call
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone-number">Phone Number</Label>
                    <Input
                      id="phone-number"
                      data-testid="input-phone-number"
                      placeholder="+1234567890"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      type="tel"
                    />
                    <p className="text-xs text-muted-foreground">
                      Include country code (e.g., +1 for US)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agent">AI Agent (Optional)</Label>
                    <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                      <SelectTrigger id="agent" data-testid="select-agent">
                        <SelectValue placeholder="Use default agent" />
                      </SelectTrigger>
                      <SelectContent>
                        {agents?.map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>
                            {agent.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setOutboundDialogOpen(false)}
                    data-testid="button-cancel-call"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleMakeCall}
                    disabled={makeCallMutation.isPending}
                    data-testid="button-confirm-call"
                  >
                    {makeCallMutation.isPending ? "Calling..." : "Make Call"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Community Templates Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">From the Community</h2>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-xs">
              Sort by
            </Button>
            <Button variant="ghost" size="sm" className="text-xs">
              Inbound
            </Button>
            <Button variant="ghost" size="sm" className="text-xs">
              Outbound
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {communityTemplates.map((template) => (
            <Card
              key={template.id}
              className="p-6 space-y-4 hover-elevate active-elevate-2 cursor-pointer"
              data-testid={`template-card-${template.id}`}
            >
              <div className="space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                  <User className="h-6 w-6 text-muted-foreground" />
                </div>
                <Badge
                  variant={template.badge === "Elevate" ? "default" : "secondary"}
                  className={template.badge === "Elevate" ? "bg-primary" : "bg-orange-500"}
                >
                  {template.badge}
                </Badge>
                <div>
                  <h3 className="font-semibold text-base">{template.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {template.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>♡ 0</span>
                <span>👁 1</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
