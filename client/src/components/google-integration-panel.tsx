import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Mail, 
  Calendar, 
  Plus, 
  Send, 
  Loader2, 
  Link2, 
  Unlink,
  RefreshCw,
  User,
  Clock,
  MapPin,
  FileText,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Project } from "@shared/schema";

interface GoogleIntegrationPanelProps {
  project: Project;
}

const emailSchema = z.object({
  to: z.string().email("Invalid email address"),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Message body is required"),
});

const eventSchema = z.object({
  summary: z.string().min(1, "Event title is required"),
  description: z.string().optional(),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  location: z.string().optional(),
  attendees: z.string().optional(),
});

export default function GoogleIntegrationPanel({ project }: GoogleIntegrationPanelProps) {
  const { toast } = useToast();
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isEventOpen, setIsEventOpen] = useState(false);
  const [authWindow, setAuthWindow] = useState<Window | null>(null);
  const projectId = project.id;

  // Check if Google account is connected
  const isConnected = !!project.googleOAuthEmail;

  // Fetch calendar events
  const { data: events = [], isLoading: eventsLoading, refetch: refetchEvents } = useQuery<any[]>({
    queryKey: [`/api/projects/${projectId}/calendar/events`],
    enabled: isConnected,
    retry: false,
  });

  // Fetch Gmail messages
  const { data: messages = [], isLoading: messagesLoading, refetch: refetchMessages } = useQuery<any[]>({
    queryKey: [`/api/projects/${projectId}/gmail/messages`],
    enabled: isConnected,
    retry: false,
  });

  // Get auth URL mutation
  const getAuthUrlMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", `/api/projects/${projectId}/google/auth`);
      return response.json();
    },
    onSuccess: (data) => {
      // Open OAuth flow in new window
      const authWindow = window.open(data.authUrl, "google-auth", "width=600,height=600");
      setAuthWindow(authWindow);
      
      // Poll for completion
      const checkInterval = setInterval(() => {
        if (authWindow?.closed) {
          clearInterval(checkInterval);
          queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
          toast({
            title: "Connection complete",
            description: "Please refresh to see your Google account status.",
          });
        }
      }, 1000);
    },
    onError: () => {
      toast({
        title: "Connection failed",
        description: "Failed to start Google authentication. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/projects/${projectId}/google/disconnect`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      toast({
        title: "Account disconnected",
        description: "Your Google account has been disconnected.",
      });
    },
    onError: () => {
      toast({
        title: "Disconnection failed",
        description: "Failed to disconnect Google account. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Send email mutation
  const sendEmailMutation = useMutation({
    mutationFn: async (data: z.infer<typeof emailSchema>) => {
      const response = await apiRequest("POST", `/api/projects/${projectId}/gmail/send`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Email sent",
        description: "Your email has been sent successfully.",
      });
      setIsComposeOpen(false);
      emailForm.reset();
      refetchMessages();
    },
    onError: () => {
      toast({
        title: "Failed to send email",
        description: "There was an error sending your email. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Create event mutation
  const createEventMutation = useMutation({
    mutationFn: async (data: z.infer<typeof eventSchema>) => {
      const eventData = {
        summary: data.summary,
        description: data.description,
        location: data.location,
        start: {
          dateTime: new Date(data.startTime).toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        end: {
          dateTime: new Date(data.endTime).toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        attendees: data.attendees ? 
          data.attendees.split(',').map(email => ({ email: email.trim() })) : 
          [],
      };
      const response = await apiRequest("POST", `/api/projects/${projectId}/calendar/events`, eventData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Event created",
        description: "Your calendar event has been created successfully.",
      });
      setIsEventOpen(false);
      eventForm.reset();
      refetchEvents();
    },
    onError: () => {
      toast({
        title: "Failed to create event",
        description: "There was an error creating your event. Please try again.",
        variant: "destructive",
      });
    },
  });

  const emailForm = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema),
    defaultValues: {
      to: "",
      subject: "",
      body: "",
    },
  });

  const eventForm = useForm<z.infer<typeof eventSchema>>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      summary: "",
      description: "",
      startTime: "",
      endTime: "",
      location: "",
      attendees: "",
    },
  });

  const formatEventDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  const formatMessageDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffHours < 24) {
      return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }).format(date);
    }
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

  if (!isConnected) {
    return (
      <Card className="border-dashed">
        <CardHeader className="text-center pb-6">
          <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Link2 className="h-6 w-6" />
          </div>
          <CardTitle>Connect Your Google Account</CardTitle>
          <CardDescription className="max-w-md mx-auto">
            Connect your Google account to sync calendar events and manage emails directly from this project.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button 
            onClick={() => getAuthUrlMutation.mutate()} 
            disabled={getAuthUrlMutation.isPending}
            size="lg"
            data-testid="button-connect-google"
          >
            {getAuthUrlMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4 mr-2" />
                Connect Google Account
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connection Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <User className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <CardTitle className="text-lg">Google Account Connected</CardTitle>
                <CardDescription className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="font-mono text-xs">
                    {project.googleOAuthEmail}
                  </Badge>
                  {project.googleOAuthConnectedAt && (
                    <span className="text-xs text-muted-foreground">
                      Connected {new Date(project.googleOAuthConnectedAt).toLocaleDateString()}
                    </span>
                  )}
                </CardDescription>
              </div>
            </div>
            <Button 
              variant="destructive" 
              size="sm"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              data-testid="button-disconnect-google"
            >
              {disconnectMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Unlink className="h-4 w-4" />
              )}
              Disconnect
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Calendar Events Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                <CardTitle>Calendar Events</CardTitle>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => refetchEvents()}
                  data-testid="button-refresh-events"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => setIsEventOpen(true)}
                  data-testid="button-create-event"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  New Event
                </Button>
              </div>
            </div>
            <CardDescription>Your upcoming calendar events</CardDescription>
          </CardHeader>
          <CardContent>
            {eventsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No upcoming events</p>
              </div>
            ) : (
              <div className="space-y-3">
                {events.slice(0, 5).map((event, index) => (
                  <div key={index} className="flex gap-3 p-3 rounded-lg bg-muted/50 hover-elevate" data-testid={`event-item-${index}`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{event.summary}</p>
                      <div className="flex items-center gap-4 mt-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatEventDate(event.start?.dateTime || event.start?.date)}
                        </span>
                        {event.location && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3" />
                            {event.location}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {events.length > 5 && (
                  <p className="text-xs text-center text-muted-foreground pt-2">
                    +{events.length - 5} more events
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gmail Messages Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                <CardTitle>Recent Emails</CardTitle>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => refetchMessages()}
                  data-testid="button-refresh-emails"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => setIsComposeOpen(true)}
                  data-testid="button-compose-email"
                >
                  <Send className="h-3 w-3 mr-1" />
                  Compose
                </Button>
              </div>
            </div>
            <CardDescription>Your recent Gmail messages</CardDescription>
          </CardHeader>
          <CardContent>
            {messagesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No recent messages</p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.slice(0, 5).map((message, index) => (
                  <div key={index} className="flex gap-3 p-3 rounded-lg bg-muted/50 hover-elevate" data-testid={`message-item-${index}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{message.from || "Unknown Sender"}</p>
                          <p className="text-sm text-foreground truncate mt-0.5">{message.subject || "(No subject)"}</p>
                          {message.snippet && (
                            <p className="text-xs text-muted-foreground truncate mt-1">{message.snippet}</p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatMessageDate(message.date)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {messages.length > 5 && (
                  <p className="text-xs text-center text-muted-foreground pt-2">
                    +{messages.length - 5} more messages
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Compose Email Dialog */}
      <Dialog open={isComposeOpen} onOpenChange={setIsComposeOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Compose Email</DialogTitle>
            <DialogDescription>
              Send an email from your connected Google account
            </DialogDescription>
          </DialogHeader>
          <Form {...emailForm}>
            <form onSubmit={emailForm.handleSubmit((data) => sendEmailMutation.mutate(data))} className="space-y-4">
              <FormField
                control={emailForm.control}
                name="to"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>To</FormLabel>
                    <FormControl>
                      <Input placeholder="recipient@example.com" {...field} data-testid="input-email-to" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={emailForm.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subject</FormLabel>
                    <FormControl>
                      <Input placeholder="Email subject" {...field} data-testid="input-email-subject" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={emailForm.control}
                name="body"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Message</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Type your message here..." 
                        className="min-h-[150px]" 
                        {...field} 
                        data-testid="input-email-body"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsComposeOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={sendEmailMutation.isPending} data-testid="button-send-email">
                  {sendEmailMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send Email
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Create Event Dialog */}
      <Dialog open={isEventOpen} onOpenChange={setIsEventOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Calendar Event</DialogTitle>
            <DialogDescription>
              Add a new event to your Google Calendar
            </DialogDescription>
          </DialogHeader>
          <Form {...eventForm}>
            <form onSubmit={eventForm.handleSubmit((data) => createEventMutation.mutate(data))} className="space-y-4">
              <FormField
                control={eventForm.control}
                name="summary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Meeting with team" {...field} data-testid="input-event-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={eventForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Event details..." 
                        className="min-h-[80px]" 
                        {...field} 
                        data-testid="input-event-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={eventForm.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Time</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} data-testid="input-event-start" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={eventForm.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Time</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} data-testid="input-event-end" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={eventForm.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Conference Room A" {...field} data-testid="input-event-location" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={eventForm.control}
                name="attendees"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Attendees (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="email1@example.com, email2@example.com" 
                        {...field} 
                        data-testid="input-event-attendees"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEventOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createEventMutation.isPending} data-testid="button-create-event-submit">
                  {createEventMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Event
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}