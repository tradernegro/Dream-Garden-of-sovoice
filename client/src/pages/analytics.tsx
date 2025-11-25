import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart3, TrendingUp, Phone, Clock } from "lucide-react";
import type { Call } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function Analytics() {
  const { data: calls, isLoading } = useQuery<Call[]>({
    queryKey: ["/api/calls"],
  });

  // Calculate analytics
  const totalCalls = calls?.length || 0;
  const completedCalls = calls?.filter(c => c.status === "completed").length || 0;
  const failedCalls = calls?.filter(c => c.status === "failed" || c.status === "no-answer").length || 0;
  const successRate = totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0;
  
  const avgDuration = calls && calls.length > 0
    ? Math.round(calls.filter(c => c.duration).reduce((acc, c) => acc + (c.duration || 0), 0) / calls.filter(c => c.duration).length)
    : 0;

  const callsByDirection = {
    inbound: calls?.filter(c => c.direction === "inbound").length || 0,
    outbound: calls?.filter(c => c.direction === "outbound").length || 0,
  };

  const callsByStatus = {
    completed: completedCalls,
    inProgress: calls?.filter(c => c.status === "in-progress").length || 0,
    failed: failedCalls,
    queued: calls?.filter(c => c.status === "queued").length || 0,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold" data-testid="text-analytics-title">Analytics</h1>
        <p className="text-muted-foreground mt-1">
          Insights and performance metrics for your AI voice assistant
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-success-rate">{successRate}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {completedCalls} of {totalCalls} calls completed
                </p>
              </>
            )}
          </CardContent>
        </Card>

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
                <div className="text-2xl font-bold" data-testid="text-analytics-total">{totalCalls}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  All time
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
                <div className="text-2xl font-bold">
                  {Math.floor(avgDuration / 60)}:{(avgDuration % 60).toString().padStart(2, '0')}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Minutes per call
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed Calls</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-failed-calls">{failedCalls}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  No answer or failed
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Call Distribution by Direction */}
        <Card>
          <CardHeader>
            <CardTitle>Call Direction</CardTitle>
            <CardDescription>Distribution of inbound vs outbound calls</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Inbound</Badge>
                    <span className="text-sm text-muted-foreground">
                      {callsByDirection.inbound} calls
                    </span>
                  </div>
                  <span className="text-sm font-medium">
                    {totalCalls > 0 ? Math.round((callsByDirection.inbound / totalCalls) * 100) : 0}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ 
                      width: `${totalCalls > 0 ? (callsByDirection.inbound / totalCalls) * 100 : 0}%` 
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Outbound</Badge>
                    <span className="text-sm text-muted-foreground">
                      {callsByDirection.outbound} calls
                    </span>
                  </div>
                  <span className="text-sm font-medium">
                    {totalCalls > 0 ? Math.round((callsByDirection.outbound / totalCalls) * 100) : 0}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-chart-2 h-2 rounded-full transition-all"
                    style={{ 
                      width: `${totalCalls > 0 ? (callsByDirection.outbound / totalCalls) * 100 : 0}%` 
                    }}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Call Distribution by Status */}
        <Card>
          <CardHeader>
            <CardTitle>Call Status Breakdown</CardTitle>
            <CardDescription>Current status of all calls</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-green-500" />
                      <span className="text-sm">Completed</span>
                    </div>
                    <span className="text-sm font-medium">{callsByStatus.completed}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-blue-500" />
                      <span className="text-sm">In Progress</span>
                    </div>
                    <span className="text-sm font-medium">{callsByStatus.inProgress}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-red-500" />
                      <span className="text-sm">Failed</span>
                    </div>
                    <span className="text-sm font-medium">{callsByStatus.failed}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-gray-500" />
                      <span className="text-sm">Queued</span>
                    </div>
                    <span className="text-sm font-medium">{callsByStatus.queued}</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Empty State */}
      {!isLoading && totalCalls === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
              <h3 className="text-lg font-medium mb-1">No analytics data yet</h3>
              <p className="text-sm text-muted-foreground">
                Start making calls to see performance insights and metrics
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
