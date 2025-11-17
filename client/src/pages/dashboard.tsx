import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, Clock, TrendingUp, Activity, PhoneCall } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Call } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Agent } from "@shared/schema";

export default function Dashboard() {
  const [open, setOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const { toast } = useToast();

  const { data: calls, isLoading } = useQuery<Call[]>({
    queryKey: ["/api/calls"],
  });

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
      setOpen(false);
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

  const stats = {
    totalCalls: calls?.length || 0,
    activeCalls: calls?.filter(c => c.status === "in-progress").length || 0,
    completedCalls: calls?.filter(c => c.status === "completed").length || 0,
    avgDuration: calls && calls.length > 0
      ? Math.round(calls.filter(c => c.duration).reduce((acc, c) => acc + (c.duration || 0), 0) / calls.filter(c => c.duration).length)
      : 0,
  };

  const recentCalls = calls?.slice(0, 5) || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500/10 text-green-700 dark:text-green-400";
      case "in-progress":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      case "failed":
      case "no-answer":
        return "bg-red-500/10 text-red-700 dark:text-red-400";
      default:
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-dashboard-title">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Overview of your AI voice assistant performance
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="lg" data-testid="button-make-call">
              <PhoneCall className="mr-2 h-4 w-4" />
              Make Outbound Call
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
                onClick={() => setOpen(false)}
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

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-total-calls">{stats.totalCalls}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  All time calls
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Now</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-active-calls">{stats.activeCalls}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  In progress
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-completed-calls">{stats.completedCalls}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Successfully finished
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-avg-duration">
                  {Math.floor(stats.avgDuration / 60)}:{(stats.avgDuration % 60).toString().padStart(2, '0')}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Minutes per call
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Calls */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Calls</CardTitle>
          <Link href="/calls">
            <Button variant="ghost" size="sm" data-testid="button-view-all-calls">
              View All
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center justify-between py-3">
                  <Skeleton className="h-10 w-32" />
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          ) : recentCalls.length === 0 ? (
            <div className="text-center py-12">
              <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
              <h3 className="text-lg font-medium mb-1">No calls yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Start making calls with your AI assistant
              </p>
              <Link href="/agents">
                <Button data-testid="button-configure-agent">Configure Agent</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-1">
              {recentCalls.map((call) => (
                <Link key={call.id} href={`/calls/${call.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-md hover-elevate active-elevate-2" data-testid={`call-item-${call.id}`}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                        <Phone className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-mono text-sm font-medium">{call.phoneNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(call.createdAt).toLocaleDateString()} at {new Date(call.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {call.duration && (
                        <span className="text-sm text-muted-foreground">
                          {Math.floor(call.duration / 60)}:{(call.duration % 60).toString().padStart(2, '0')}
                        </span>
                      )}
                      <Badge variant="secondary" className={getStatusColor(call.status)}>
                        {call.status}
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
