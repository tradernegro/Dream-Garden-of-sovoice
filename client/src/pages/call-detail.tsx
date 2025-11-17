import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Phone, Clock, Calendar, User } from "lucide-react";
import type { Call, Agent } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

export default function CallDetail() {
  const [, params] = useRoute("/calls/:id");
  const callId = params?.id;

  const { data: call, isLoading: callLoading } = useQuery<Call>({
    queryKey: ["/api/calls", callId],
    enabled: !!callId,
  });

  const { data: agent } = useQuery<Agent>({
    queryKey: ["/api/agents", call?.agentId],
    enabled: !!call?.agentId,
  });

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

  if (callLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!call) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Phone className="h-16 w-16 text-muted-foreground opacity-50 mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Call Not Found</h2>
        <p className="text-muted-foreground mb-6">The call you're looking for doesn't exist.</p>
        <Link href="/calls">
          <Button>Back to Calls</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/calls">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold font-mono" data-testid="text-call-phone">
              {call.phoneNumber}
            </h1>
            <Badge variant="secondary" className={getStatusColor(call.status)}>
              {call.status}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            {call.direction === "inbound" ? "Inbound" : "Outbound"} call
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Call Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Transcript */}
          <Card>
            <CardHeader>
              <CardTitle>Transcript</CardTitle>
            </CardHeader>
            <CardContent>
              {call.transcript ? (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {call.transcript}
                  </p>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">
                    No transcript available for this call
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recording */}
          {call.recording && (
            <Card>
              <CardHeader>
                <CardTitle>Recording</CardTitle>
              </CardHeader>
              <CardContent>
                <audio controls className="w-full" data-testid="audio-recording">
                  <source src={call.recording} type="audio/mpeg" />
                  Your browser does not support the audio element.
                </audio>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Metadata Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Call Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Date & Time</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(call.createdAt).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(call.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Duration</p>
                    <p className="text-sm text-muted-foreground">
                      {call.duration 
                        ? `${Math.floor(call.duration / 60)} min ${call.duration % 60} sec`
                        : "Not available"
                      }
                    </p>
                  </div>
                </div>

                {agent && (
                  <>
                    <Separator />
                    <div className="flex items-start gap-3">
                      <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Agent</p>
                        <p className="text-sm text-muted-foreground">{agent.name}</p>
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Phone Number</p>
                    <p className="text-sm text-muted-foreground font-mono">
                      {call.phoneNumber}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tags */}
          {call.tags && call.tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {call.tags.map((tag, idx) => (
                    <Badge key={idx} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
