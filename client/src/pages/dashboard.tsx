import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useState, useEffect } from "react";
import { DashboardMetrics } from "@/components/dashboard-metrics";
import { 
  CallVolumeChart, 
  StatusDistributionChart, 
  HourlyActivityChart 
} from "@/components/dashboard-charts";
import {
  AgentPerformancePanel,
  RecentCallsPanel,
  SystemHealthPanel,
  QuickActionsPanel
} from "@/components/dashboard-panels";
import { useWebSocket } from "@/hooks/use-websocket";
import { queryClient } from "@/lib/queryClient";

interface DashboardData {
  totalCalls: number;
  todayCalls: number;
  activeCalls: number;
  completedCalls: number;
  failedCalls: number;
  successRate: number;
  avgDuration: number;
  callVolumeByDay: Array<{
    date: string;
    inbound: number;
    outbound: number;
  }>;
  hourlyDistribution: Array<{
    hour: string;
    calls: number;
  }>;
  statusDistribution: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  agentPerformance: Array<{
    id: string;
    name: string;
    calls: number;
    successRate: number;
  }>;
  recentCalls: Array<{
    id: string;
    phoneNumber: string;
    direction: "inbound" | "outbound";
    status: string;
    createdAt: string;
  }>;
  systemHealth: {
    twilio: { status: string; message: string };
    openai: { status: string; message: string };
    googleCalendar: { status: string; message: string };
    gmail: { status: string; message: string };
  };
}

export default function Dashboard() {
  const [timeRange, setTimeRange] = useState("7d");

  // Use the existing WebSocket hook for real-time updates
  useEffect(() => {
    const handleWebSocketMessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      if (data.type === "call-update" || data.event === "call-update") {
        // Invalidate dashboard metrics when calls are updated
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
      }
    };

    // Listen for WebSocket updates
    const ws = window.ws; // The WebSocket is already managed by useWebSocket hook
    if (ws) {
      ws.addEventListener("message", handleWebSocketMessage);
      return () => {
        ws.removeEventListener("message", handleWebSocketMessage);
      };
    }
  }, []);

  // Fetch dashboard data with time range
  const { data: dashboardData, isLoading, refetch } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard/metrics", timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/dashboard/metrics?timeRange=${timeRange}`);
      if (!response.ok) throw new Error("Failed to fetch dashboard metrics");
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const handleRefresh = () => {
    refetch();
  };

  const handleTimeRangeChange = (value: string) => {
    setTimeRange(value);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">Loading metrics...</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const metrics = dashboardData || {
    todayCalls: 0,
    activeCalls: 0,
    successRate: 0,
    avgDuration: 0,
    callVolumeByDay: [],
    hourlyDistribution: [],
    statusDistribution: [],
    agentPerformance: [],
    recentCalls: [],
    systemHealth: {
      twilio: { status: "not_connected", message: "Not Connected" },
      openai: { status: "not_connected", message: "Not Connected" },
      googleCalendar: { status: "not_connected", message: "Not Connected" },
      gmail: { status: "not_connected", message: "Not Connected" },
    },
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-dashboard-title">
            Dashboard
          </h1>
          <p className="text-muted-foreground">
            Real-time overview of your voice AI operations
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={timeRange} onValueChange={handleTimeRangeChange}>
            <SelectTrigger className="w-40" data-testid="select-time-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleRefresh} variant="outline" data-testid="button-refresh">
            <Activity className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <DashboardMetrics
        todayCalls={metrics.todayCalls}
        activeCalls={metrics.activeCalls}
        successRate={metrics.successRate}
        avgDuration={metrics.avgDuration}
      />

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <CallVolumeChart data={metrics.callVolumeByDay} />
        <StatusDistributionChart data={metrics.statusDistribution} />
      </div>

      {/* Bottom Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <AgentPerformancePanel agents={metrics.agentPerformance} />
        <RecentCallsPanel calls={metrics.recentCalls} />
        <SystemHealthPanel health={metrics.systemHealth} />
      </div>

      {/* Quick Actions */}
      <QuickActionsPanel />

      {/* Hourly Activity */}
      <HourlyActivityChart data={metrics.hourlyDistribution} />
    </div>
  );
}