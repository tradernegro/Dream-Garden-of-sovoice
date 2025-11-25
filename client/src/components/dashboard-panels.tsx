import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  PhoneIncoming, 
  PhoneOutgoing,
  Users,
  Zap,
  BarChart3,
  DollarSign,
  Phone,
  Cpu,
  Calendar,
  Mail,
  CheckCircle,
  AlertCircle
} from "lucide-react";

interface AgentPerformanceProps {
  agents: Array<{
    id: string;
    name: string;
    calls: number;
    successRate: number;
  }>;
}

export function AgentPerformancePanel({ agents }: AgentPerformanceProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Performing Agents</CardTitle>
        <CardDescription>Agents ranked by call volume</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {agents.length > 0 ? (
            agents.map((agent, index) => (
              <div key={agent.id} className="flex items-center justify-between" data-testid={`agent-performance-${agent.id}`}>
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
  );
}

interface RecentCallsProps {
  calls: Array<{
    id: string;
    phoneNumber: string;
    direction: "inbound" | "outbound";
    status: string;
    createdAt: string;
  }>;
}

export function RecentCallsPanel({ calls }: RecentCallsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Calls</CardTitle>
        <CardDescription>Latest call activity</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {calls.slice(0, 5).map((call) => (
            <div key={call.id} className="flex items-center justify-between" data-testid={`recent-call-${call.id}`}>
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
        <Link href="/calls">
          <Button variant="outline" className="w-full mt-4" data-testid="button-view-all-calls">
            View All Calls
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

interface SystemHealthProps {
  health: {
    twilio: { status: string; message: string };
    openai: { status: string; message: string };
    googleCalendar: { status: string; message: string };
    gmail: { status: string; message: string };
  };
}

export function SystemHealthPanel({ health }: SystemHealthProps) {
  const getStatusIcon = (status: string) => {
    return status === "connected" ? (
      <CheckCircle className="h-3 w-3 mr-1" />
    ) : (
      <AlertCircle className="h-3 w-3 mr-1" />
    );
  };

  const getStatusVariant = (status: string) => {
    return status === "connected" ? "default" : "secondary";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>System Health</CardTitle>
        <CardDescription>Integration status</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between" data-testid="health-twilio">
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4" />
              <span className="text-sm">Twilio</span>
            </div>
            <Badge variant={getStatusVariant(health.twilio.status)} className={health.twilio.status === "connected" ? "bg-green-500" : ""}>
              {getStatusIcon(health.twilio.status)}
              {health.twilio.message}
            </Badge>
          </div>
          <div className="flex items-center justify-between" data-testid="health-openai">
            <div className="flex items-center gap-3">
              <Cpu className="h-4 w-4" />
              <span className="text-sm">OpenAI</span>
            </div>
            <Badge variant={getStatusVariant(health.openai.status)} className={health.openai.status === "connected" ? "bg-green-500" : ""}>
              {getStatusIcon(health.openai.status)}
              {health.openai.message}
            </Badge>
          </div>
          <div className="flex items-center justify-between" data-testid="health-google-calendar">
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4" />
              <span className="text-sm">Google Calendar</span>
            </div>
            <Badge variant={getStatusVariant(health.googleCalendar.status)}>
              {getStatusIcon(health.googleCalendar.status)}
              {health.googleCalendar.message}
            </Badge>
          </div>
          <div className="flex items-center justify-between" data-testid="health-gmail">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4" />
              <span className="text-sm">Gmail</span>
            </div>
            <Badge variant={getStatusVariant(health.gmail.status)}>
              {getStatusIcon(health.gmail.status)}
              {health.gmail.message}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function QuickActionsPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <CardDescription>Common tasks and operations</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-4">
          <Link href="/agents">
            <Button variant="outline" className="w-full" data-testid="button-create-agent">
              <Users className="h-4 w-4 mr-2" />
              Create Agent
            </Button>
          </Link>
          <Link href="/projects">
            <Button variant="outline" className="w-full" data-testid="button-new-project">
              <Zap className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </Link>
          <Link href="/analytics">
            <Button variant="outline" className="w-full" data-testid="button-view-reports">
              <BarChart3 className="h-4 w-4 mr-2" />
              View Reports
            </Button>
          </Link>
          <Link href="/settings">
            <Button variant="outline" className="w-full" data-testid="button-billing">
              <DollarSign className="h-4 w-4 mr-2" />
              Billing
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}