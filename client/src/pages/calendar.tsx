import { useState, useEffect } from "react";
import { Calendar, Clock, Link2, Plus, RefreshCw, Calendar as CalendarIcon, Settings, CheckCircle2, XCircle, Key } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface CalendlyEvent {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  event_type: string;
  location?: {
    type: string;
    location?: string;
  };
  invitees?: Array<{
    email: string;
    name: string;
    status: string;
  }>;
  status: string;
  meeting_notes?: string;
  uri: string;
}

interface CalendlyEventType {
  id: string;
  name: string;
  description?: string;
  duration_minutes: number;
  scheduling_url: string;
  active: boolean;
  color: string;
}

export default function CalendarPage() {
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendlyEvent | null>(null);
  const [showManualTokenDialog, setShowManualTokenDialog] = useState(false);
  const [manualToken, setManualToken] = useState("");

  // Fetch Calendly connection status
  const { data: connectionStatus, isLoading: isLoadingStatus, refetch: refetchStatus } = useQuery({
    queryKey: ["/api/calendly/status"],
    queryFn: async () => {
      const response = await fetch("/api/calendly/status");
      return response.json();
    },
    refetchInterval: isConnecting ? 2000 : false, // Poll every 2 seconds when connecting, otherwise don't poll
  });

  // Fetch scheduled events
  const { data: events, isLoading: isLoadingEvents, refetch: refetchEvents } = useQuery({
    queryKey: ["/api/calendly/events"],
    queryFn: async () => {
      const response = await fetch("/api/calendly/events");
      if (!response.ok) throw new Error("Failed to fetch events");
      return response.json();
    },
    enabled: connectionStatus?.connected,
  });

  // Fetch event types
  const { data: eventTypes, isLoading: isLoadingEventTypes } = useQuery({
    queryKey: ["/api/calendly/event-types"],
    queryFn: async () => {
      const response = await fetch("/api/calendly/event-types");
      if (!response.ok) throw new Error("Failed to fetch event types");
      return response.json();
    },
    enabled: connectionStatus?.connected,
  });

  const [authUrl, setAuthUrl] = useState<string | null>(null);

  // Connect to Calendly OAuth
  const connectMutation = useMutation({
    mutationFn: async () => {
      setIsConnecting(true);
      const response = await apiRequest("POST", "/api/calendly/connect", {});
      return response.json();
    },
    onSuccess: (data) => {
      if (data.authUrl) {
        // Try to open in popup first
        const authWindow = window.open(data.authUrl, "calendly-oauth", "width=600,height=700");
        
        if (!authWindow || authWindow.closed || typeof authWindow.closed === 'undefined') {
          // Popup was blocked, show direct link instead
          setAuthUrl(data.authUrl);
          toast({
            title: "Popup Blocked",
            description: "Click the link below to connect your Calendly account",
          });
        } else {
          // Monitor the popup window
          const checkInterval = setInterval(() => {
            if (authWindow && authWindow.closed) {
              clearInterval(checkInterval);
              setIsConnecting(false);
              setAuthUrl(null);
              // Refetch status after window closes
              setTimeout(() => {
                refetchStatus();
              }, 1000);
            }
          }, 500);
        }
      }
    },
    onError: (error) => {
      setIsConnecting(false);
      setAuthUrl(null);
      toast({
        title: "Connection failed",
        description: "Failed to connect to Calendly. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Disconnect from Calendly
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/calendly/disconnect", {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendly/status"] });
      toast({
        title: "Disconnected",
        description: "Successfully disconnected from Calendly.",
      });
    },
  });

  // Save manual token
  const saveManualTokenMutation = useMutation({
    mutationFn: async (token: string) => {
      const response = await apiRequest("POST", "/api/calendly/manual-token", { token });
      return response.json();
    },
    onSuccess: () => {
      setShowManualTokenDialog(false);
      setManualToken("");
      setIsConnecting(false);
      setAuthUrl(null);
      queryClient.invalidateQueries({ queryKey: ["/api/calendly/status"] });
      toast({
        title: "Connected Successfully",
        description: "Your Calendly account has been connected using the manual token.",
      });
    },
    onError: (error) => {
      toast({
        title: "Connection Failed",
        description: "Invalid token or unable to connect. Please check your token and try again.",
        variant: "destructive",
      });
    },
  });

  // Check for OAuth callback on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('connected') === 'true') {
      toast({
        title: "Connected Successfully",
        description: "Your Calendly account has been connected.",
      });
      // Clear the URL params
      window.history.replaceState({}, '', window.location.pathname);
      setIsConnecting(false);
      refetchStatus();
    } else if (urlParams.get('error') === 'connection_failed') {
      toast({
        title: "Connection Failed",
        description: "Failed to connect to Calendly. Please try again.",
        variant: "destructive",
      });
      // Clear the URL params
      window.history.replaceState({}, '', window.location.pathname);
      setIsConnecting(false);
    }
  }, []);

  // Listen for real-time Calendly webhook events via WebSocket
  useEffect(() => {
    const handleWebSocketMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'calendly_event') {
          const eventData = message.data;
          
          // Show toast notification based on event type
          switch (eventData.type) {
            case 'scheduled':
              toast({
                title: "📅 New Meeting Scheduled",
                description: `${eventData.event.name || 'Someone'} has scheduled a meeting`,
              });
              break;
            case 'cancelled':
              toast({
                title: "❌ Meeting Cancelled",
                description: `A meeting has been cancelled`,
                variant: "destructive"
              });
              break;
            case 'no_show':
              toast({
                title: "👻 No-Show",
                description: `Someone didn't show up for their meeting`,
                variant: "destructive"
              });
              break;
          }
          
          // Refresh events to show latest data
          queryClient.invalidateQueries({ queryKey: ["/api/calendly/events"] });
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    };

    // Get WebSocket instance from window (if available)
    const ws = (window as any).ws;
    if (ws && ws.addEventListener) {
      ws.addEventListener('message', handleWebSocketMessage);
      
      return () => {
        ws.removeEventListener('message', handleWebSocketMessage);
      };
    }
  }, [toast]);

  // Format date and time
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    const dateOptions: Intl.DateTimeFormatOptions = { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    };
    const timeOptions: Intl.DateTimeFormatOptions = { 
      hour: '2-digit', 
      minute: '2-digit'
    };
    return {
      date: date.toLocaleDateString('en-US', dateOptions),
      time: date.toLocaleTimeString('en-US', timeOptions),
    };
  };

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'completed':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'cancelled':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  if (!connectionStatus?.connected) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Calendar</h1>
            <p className="text-muted-foreground">Manage your Calendly events and availability</p>
          </div>
        </div>

        <Card className="max-w-2xl mx-auto mt-12">
          <CardHeader className="text-center">
            <CalendarIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <CardTitle className="text-2xl">Connect Your Calendly Account</CardTitle>
            <CardDescription>
              Link your Calendly account to manage events, view scheduled meetings, and sync your availability
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            {isConnecting ? (
              <div className="space-y-4">
                {authUrl ? (
                  // Show direct link if popup was blocked
                  <>
                    <div className="p-4 bg-orange-50 dark:bg-orange-950/20 rounded-lg">
                      <p className="text-sm font-medium text-orange-900 dark:text-orange-200 mb-2">
                        Popup blocked - Use this link instead:
                      </p>
                      <Button 
                        variant="default"
                        size="lg"
                        asChild
                        data-testid="button-direct-calendly"
                      >
                        <a href={authUrl} target="_blank" rel="noopener noreferrer">
                          <Link2 className="mr-2 h-5 w-5" />
                          Open Calendly Authorization
                        </a>
                      </Button>
                      <p className="text-xs text-muted-foreground mt-2">
                        After authorizing, come back here and your connection will be detected
                      </p>
                    </div>
                    <Button 
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsConnecting(false);
                        setAuthUrl(null);
                      }}
                      data-testid="button-cancel-calendly"
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  // Show loading spinner if popup opened
                  <>
                    <RefreshCw className="h-8 w-8 mx-auto animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">
                      Complete the authorization in the popup window...
                    </p>
                    <p className="text-xs text-muted-foreground">
                      If the popup was blocked or closed, click below to try again
                    </p>
                    <Button 
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsConnecting(false);
                        setAuthUrl(null);
                        setTimeout(() => connectMutation.mutate(), 100);
                      }}
                      data-testid="button-retry-calendly"
                    >
                      Retry Connection
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <Button 
                  size="lg" 
                  onClick={() => connectMutation.mutate()}
                  disabled={connectMutation.isPending}
                  data-testid="button-connect-calendly"
                >
                  <Link2 className="mr-2 h-5 w-5" />
                  Connect to Calendly
                </Button>
                
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or</span>
                  </div>
                </div>
                
                <Dialog open={showManualTokenDialog} onOpenChange={setShowManualTokenDialog}>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline"
                      size="lg"
                      data-testid="button-manual-token"
                    >
                      <Key className="mr-2 h-5 w-5" />
                      Use Personal Access Token
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Manual Token Configuration</DialogTitle>
                      <DialogDescription>
                        If OAuth isn't working, you can manually enter a Calendly Personal Access Token.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="text-sm space-y-2">
                        <p className="font-medium">How to get your token:</p>
                        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                          <li>Go to <a href="https://calendly.com/app/personal_access_tokens" target="_blank" className="underline">Calendly Personal Access Tokens</a></li>
                          <li>Click "Create Personal Access Token"</li>
                          <li>Give it a name (e.g., "SoVoice AI")</li>
                          <li>Copy the token and paste it below</li>
                        </ol>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="token">Personal Access Token</Label>
                        <Textarea
                          id="token"
                          placeholder="Paste your Calendly Personal Access Token here..."
                          value={manualToken}
                          onChange={(e) => setManualToken(e.target.value)}
                          className="min-h-[100px] font-mono text-sm"
                        />
                      </div>
                      
                      <div className="flex justify-end space-x-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setShowManualTokenDialog(false);
                            setManualToken("");
                          }}
                          disabled={saveManualTokenMutation.isPending}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => saveManualTokenMutation.mutate(manualToken)}
                          disabled={!manualToken.trim() || saveManualTokenMutation.isPending}
                        >
                          {saveManualTokenMutation.isPending ? (
                            <>
                              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            "Connect"
                          )}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Calendar</h1>
          <p className="text-muted-foreground">Your Calendly events and scheduling</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => refetchEvents()}
            disabled={isLoadingEvents}
            data-testid="button-refresh-events"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingEvents ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => disconnectMutation.mutate()}
            disabled={disconnectMutation.isPending}
            data-testid="button-disconnect-calendly"
          >
            <Settings className="h-4 w-4 mr-2" />
            Disconnect
          </Button>
        </div>
      </div>

      {/* Connection Info */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <CardTitle className="text-base">Connected to Calendly</CardTitle>
            </div>
            <Badge variant="outline" className="bg-green-500/10 text-green-500">
              Active
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Account: {connectionStatus?.userEmail || 'Unknown'}
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="events" className="space-y-4">
        <TabsList>
          <TabsTrigger value="events" data-testid="tab-events">
            <Calendar className="h-4 w-4 mr-2" />
            Scheduled Events
          </TabsTrigger>
          <TabsTrigger value="event-types" data-testid="tab-event-types">
            <Clock className="h-4 w-4 mr-2" />
            Event Types
          </TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="space-y-4">
          {isLoadingEvents ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-32 mt-2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-4 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : events && events.length > 0 ? (
            <div className="space-y-3">
              {events.map((event: CalendlyEvent) => {
                const startDateTime = formatDateTime(event.start_time);
                const endDateTime = formatDateTime(event.end_time);
                
                return (
                  <Card 
                    key={event.id} 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setSelectedEvent(event)}
                    data-testid={`card-event-${event.id}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{event.name}</CardTitle>
                          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                            <span>{startDateTime.date}</span>
                            <span>{startDateTime.time} - {endDateTime.time}</span>
                          </div>
                        </div>
                        <Badge 
                          variant="outline" 
                          className={getStatusColor(event.status)}
                        >
                          {event.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    {event.invitees && event.invitees.length > 0 && (
                      <CardContent>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Invitees:</span>
                          {event.invitees.map((invitee, index) => (
                            <Badge key={index} variant="secondary">
                              {invitee.name || invitee.email}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No scheduled events</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="event-types" className="space-y-4">
          {isLoadingEventTypes ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-full mt-2" />
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : eventTypes && eventTypes.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {eventTypes.map((eventType: CalendlyEventType) => (
                <Card key={eventType.id} data-testid={`card-event-type-${eventType.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{eventType.name}</CardTitle>
                        {eventType.description && (
                          <CardDescription className="mt-1">
                            {eventType.description}
                          </CardDescription>
                        )}
                      </div>
                      <Badge 
                        variant={eventType.active ? "default" : "secondary"}
                      >
                        {eventType.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        <span>{eventType.duration_minutes} min</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(eventType.scheduling_url, '_blank');
                        }}
                        data-testid={`button-open-scheduling-${eventType.id}`}
                      >
                        <Link2 className="h-4 w-4 mr-1" />
                        Scheduling Link
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No event types configured</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Event Detail Dialog */}
      {selectedEvent && (
        <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{selectedEvent.name}</DialogTitle>
              <DialogDescription>
                Event details and information
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-muted-foreground">Date & Time</Label>
                <p className="text-sm">
                  {formatDateTime(selectedEvent.start_time).date} • {formatDateTime(selectedEvent.start_time).time} - {formatDateTime(selectedEvent.end_time).time}
                </p>
              </div>
              {selectedEvent.location && (
                <div>
                  <Label className="text-muted-foreground">Location</Label>
                  <p className="text-sm">{selectedEvent.location.location || selectedEvent.location.type}</p>
                </div>
              )}
              {selectedEvent.invitees && selectedEvent.invitees.length > 0 && (
                <div>
                  <Label className="text-muted-foreground">Invitees</Label>
                  <div className="space-y-1 mt-1">
                    {selectedEvent.invitees.map((invitee, index) => (
                      <p key={index} className="text-sm">
                        {invitee.name} ({invitee.email})
                      </p>
                    ))}
                  </div>
                </div>
              )}
              {selectedEvent.meeting_notes && (
                <div>
                  <Label className="text-muted-foreground">Meeting Notes</Label>
                  <p className="text-sm">{selectedEvent.meeting_notes}</p>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => window.open(selectedEvent.uri, '_blank')}
                  data-testid="button-open-in-calendly"
                >
                  <Link2 className="h-4 w-4 mr-2" />
                  Open in Calendly
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}