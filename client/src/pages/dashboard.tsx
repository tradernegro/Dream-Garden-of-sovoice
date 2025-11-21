import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  PhoneIncoming, 
  PhoneOutgoing, 
  Users, 
  Clock,
  TrendingUp,
  Activity,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
  Mail,
  DollarSign,
  Zap,
  Phone,
  BarChart3,
  LineChart,
  Gauge,
  Timer,
  Cpu
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Call, Agent, Project } from "@shared/schema";
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Mock data for charts (in production, this would come from API)
const generateCallVolumeData = () => {
  const now = new Date();
  const data = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    data.push({
      date: date.toLocaleDateString('en', { weekday: 'short' }),
      inbound: Math.floor(Math.random() * 50) + 20,
      outbound: Math.floor(Math.random() * 30) + 10,
    });
  }
  return data;
};

const generateHourlyData = () => {
  const hours = [];
  for (let i = 0; i < 24; i++) {
    hours.push({
      hour: `${i}:00`,
      calls: Math.floor(Math.random() * 20) + 5,
    });
  }
  return hours;
};

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [timeRange, setTimeRange] = useState("7d");
  const [callVolumeData, setCallVolumeData] = useState(generateCallVolumeData());
  const [hourlyData, setHourlyData] = useState(generateHourlyData());
  const { toast } = useToast();

  // Fetch real data
  const { data: calls = [] } = useQuery<Call[]>({
    queryKey: ["/api/calls"],
  });

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Calculate metrics
  const totalCalls = calls.length;
  const todayCalls = calls.filter(call => {
    const callDate = new Date(call.createdAt);
    const today = new Date();
    return callDate.toDateString() === today.toDateString();
  }).length;
  const activeCalls = calls.filter(call => call.status === "in-progress").length;
  const completedCalls = calls.filter(call => call.status === "completed").length;
  const successRate = totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0;
  const avgDuration = calls.reduce((acc, call) => acc + (call.duration || 0), 0) / (calls.length || 1);

  // Agent performance data
  const agentPerformance = agents.map(agent => {
    const agentCalls = calls.filter(call => call.agentId === agent.id);
    return {
      name: agent.name,
      calls: agentCalls.length,
      successRate: agentCalls.length > 0 
        ? Math.round((agentCalls.filter(c => c.status === "completed").length / agentCalls.length) * 100)
        : 0,
    };
  }).sort((a, b) => b.calls - a.calls).slice(0, 5);

  // Call status distribution
  const statusDistribution = [
    { name: "Completed", value: calls.filter(c => c.status === "completed").length, color: "#10b981" },
    { name: "Failed", value: calls.filter(c => c.status === "failed").length, color: "#ef4444" },
    { name: "No Answer", value: calls.filter(c => c.status === "no-answer").length, color: "#f59e0b" },
    { name: "Busy", value: calls.filter(c => c.status === "busy").length, color: "#6b7280" },
  ];

  // WebSocket for real-time updates
  useEffect(() => {
    const ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}${window.location.host}/ws`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "call-update") {
        queryClient.invalidateQueries({ queryKey: ["/api/calls"] });
      }
    };

    return () => ws.close();
  }, []);

  // Refresh data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setCallVolumeData(generateCallVolumeData());
      setHourlyData(generateHourlyData());
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, []);

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
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => window.location.reload()} variant="outline">
            <Activity className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Calls Today</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayCalls}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
              <span className="text-green-500">+12%</span> from yesterday
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Calls</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCalls}</div>
            <Progress value={activeCalls * 10} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successRate}%</div>
            <Progress value={successRate} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Call Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(avgDuration / 60)}m {Math.round(avgDuration % 60)}s</div>
            <div className="text-xs text-muted-foreground mt-1">
              Target: 5m 30s
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Call Volume Trend */}
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Call Volume Trend</CardTitle>
            <CardDescription>Inbound vs Outbound calls over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={callVolumeData}>
                <defs>
                  <linearGradient id="inbound" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="outbound" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Area 
                  type="monotone" 
                  dataKey="inbound" 
                  stroke="hsl(var(--primary))" 
                  fillOpacity={1} 
                  fill="url(#inbound)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="outbound" 
                  stroke="hsl(var(--secondary))" 
                  fillOpacity={1} 
                  fill="url(#outbound)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Call Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Call Outcomes</CardTitle>
            <CardDescription>Distribution of call results</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              {statusDistribution.map((status) => (
                <div key={status.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: status.color }} />
                    <span>{status.name}</span>
                  </div>
                  <span className="font-medium">{status.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Agent Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Top Performing Agents</CardTitle>
            <CardDescription>Agents ranked by call volume</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {agentPerformance.length > 0 ? (
                agentPerformance.map((agent, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{agent.name}</p>
                        <p className="text-xs text-muted-foreground">{agent.calls} calls</p>
                      </div>
                    </div>
                    <Badge variant={agent.successRate > 80 ? "default" : "secondary"}>
                      {agent.successRate}%
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No agent data available
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Calls */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Calls</CardTitle>
            <CardDescription>Latest call activity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {calls.slice(0, 5).map((call) => (
                <div key={call.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {call.direction === "inbound" ? (
                      <PhoneIncoming className="h-4 w-4 text-blue-500" />
                    ) : (
                      <PhoneOutgoing className="h-4 w-4 text-green-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{call.phoneNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(call.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  <Badge 
                    variant={
                      call.status === "completed" ? "default" : 
                      call.status === "failed" ? "destructive" : 
                      "secondary"
                    }
                  >
                    {call.status}
                  </Badge>
                </div>
              ))}
              {calls.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No recent calls
                </p>
              )}
            </div>
            <Link href="/call-history">
              <Button variant="outline" className="w-full mt-4">
                View All Calls
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
            <CardDescription>Integration status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4" />
                  <span className="text-sm">Twilio</span>
                </div>
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Connected
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Cpu className="h-4 w-4" />
                  <span className="text-sm">OpenAI</span>
                </div>
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Active
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm">Google Calendar</span>
                </div>
                <Badge variant="secondary">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Not Connected
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4" />
                  <span className="text-sm">Gmail</span>
                </div>
                <Badge variant="secondary">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Not Connected
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks and operations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            <Link href="/agents">
              <Button variant="outline" className="w-full">
                <Users className="h-4 w-4 mr-2" />
                Create Agent
              </Button>
            </Link>
            <Link href="/projects">
              <Button variant="outline" className="w-full">
                <Zap className="h-4 w-4 mr-2" />
                New Project
              </Button>
            </Link>
            <Link href="/analytics">
              <Button variant="outline" className="w-full">
                <BarChart3 className="h-4 w-4 mr-2" />
                View Reports
              </Button>
            </Link>
            <Link href="/settings">
              <Button variant="outline" className="w-full">
                <DollarSign className="h-4 w-4 mr-2" />
                Billing
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Hourly Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Hourly Activity</CardTitle>
          <CardDescription>Call distribution throughout the day</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="hour" 
                className="text-xs"
                interval={2}
              />
              <YAxis className="text-xs" />
              <Tooltip />
              <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}