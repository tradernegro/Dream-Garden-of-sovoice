import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Mail, 
  Send, 
  Archive, 
  Trash2, 
  Star, 
  Reply, 
  Forward, 
  Paperclip,
  Folder,
  Inbox,
  PenSquare,
  Search,
  Filter,
  ChevronDown,
  Clock,
  Check,
  AlertCircle,
  RefreshCw,
  Settings2,
  ExternalLink,
  Key
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { 
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import type { Email } from "@shared/schema";

// Email folders
const folders = [
  { value: "inbox", label: "Posteingang", icon: Inbox },
  { value: "sent", label: "Gesendet", icon: Send },
  { value: "drafts", label: "Entwürfe", icon: PenSquare },
  { value: "junk", label: "Spam/Junk", icon: AlertCircle },
  { value: "archive", label: "Archiv", icon: Archive },
  { value: "trash", label: "Papierkorb", icon: Trash2 },
  { value: "important", label: "Wichtig", icon: Star },
  { value: "all", label: "Alle E-Mails", icon: Mail }
];

export default function EmailManagement() {
  const { toast } = useToast();
  const [selectedFolder, setSelectedFolder] = useState("inbox");
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isManualTokenOpen, setIsManualTokenOpen] = useState(false);
  const [manualTokenData, setManualTokenData] = useState({
    accessToken: "",
    userEmail: ""
  });
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean;
    email: string | null;
    tokenAcquired: string | null;
  }>({ connected: false, email: null, tokenAcquired: null });
  const [composeData, setComposeData] = useState({
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    body: ""
  });

  // Check Microsoft connection status on mount
  useEffect(() => {
    checkConnectionStatus();
    // Check for connection callback
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "true") {
      const wasSynced = params.get("synced") === "true";
      toast({
        title: "Erfolgreich angemeldet!",
        description: wasSynced 
          ? "Ihr Outlook-Konto wurde verbunden und E-Mails wurden synchronisiert." 
          : "Ihr Outlook-Konto wurde erfolgreich verbunden.",
      });
      if (!wasSynced) {
        syncEmails();
      } else {
        // E-Mails wurden bereits automatisch synchronisiert, nur neu laden
        refetch();
      }
      // Clean up URL
      window.history.replaceState({}, document.title, "/emails");
    } else if (params.get("error") === "auth_failed") {
      toast({
        title: "Connection Failed",
        description: "Failed to connect to Microsoft Outlook. Please try again.",
        variant: "destructive",
      });
      // Clean up URL
      window.history.replaceState({}, document.title, "/emails");
    }
  }, []);

  const checkConnectionStatus = async () => {
    try {
      const response = await fetch("/api/microsoft/status");
      if (response.ok) {
        const status = await response.json();
        setConnectionStatus(status);
      }
    } catch (error) {
      console.error("Failed to check connection status:", error);
    }
  };

  const connectToMicrosoft = async () => {
    setIsConnecting(true);
    try {
      const response = await fetch("/api/microsoft/auth-url");
      if (response.ok) {
        const { authUrl } = await response.json();
        // Open in new window to avoid Replit iframe issues
        const authWindow = window.open(authUrl, '_blank', 'width=600,height=700');
        
        // Check if popup was blocked
        if (!authWindow || authWindow.closed || typeof authWindow.closed === 'undefined') {
          // Fallback: show URL to user to copy
          toast({
            title: "Popup blockiert",
            description: "Bitte kopieren Sie diese URL und öffnen Sie sie in einem neuen Tab",
          });
          
          // Show URL in a dialog or prompt
          const userConfirm = window.confirm(
            "OAuth Popup wurde blockiert.\n\n" +
            "Klicken Sie OK, um die URL in einem neuen Tab zu öffnen, oder\n" +
            "Kopieren Sie diese URL manuell:\n\n" +
            authUrl.substring(0, 100) + "..."
          );
          
          if (userConfirm) {
            window.open(authUrl, '_blank');
          }
        }
        
        setIsConnecting(false);
      } else {
        throw new Error("Failed to get authorization URL");
      }
    } catch (error) {
      console.error("Failed to connect:", error);
      toast({
        title: "Connection Error",
        description: "Failed to initiate Microsoft connection. Please try again.",
        variant: "destructive",
      });
      setIsConnecting(false);
    }
  };

  const submitManualToken = async () => {
    if (!manualTokenData.accessToken || !manualTokenData.userEmail) {
      toast({
        title: "Missing Information",
        description: "Please provide both access token and email address",
        variant: "destructive",
      });
      return;
    }

    setIsConnecting(true);
    try {
      const response = await apiRequest("POST", "/api/microsoft/manual-token", manualTokenData);
      const result = await response.json();
      
      if (result.success) {
        setConnectionStatus({
          connected: true,
          email: manualTokenData.userEmail,
          tokenAcquired: new Date().toISOString()
        });
        setIsManualTokenOpen(false);
        setManualTokenData({ accessToken: "", userEmail: "" });
        
        toast({
          title: "Connected Successfully",
          description: `Connected to ${manualTokenData.userEmail}`,
        });
        
        // Sync emails after connection
        await syncEmails();
      } else {
        throw new Error(result.error || "Failed to save token");
      }
    } catch (error) {
      console.error("Failed to save manual token:", error);
      toast({
        title: "Connection Failed",
        description: "Failed to configure access token. Please check your token and try again.",
        variant: "destructive",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const syncEmails = async () => {
    try {
      const response = await apiRequest("POST", "/api/microsoft/sync", {
        folder: selectedFolder,
        limit: 100
      });
      const result = await response.json();
      
      toast({
        title: "Sync Complete",
        description: `Synced ${result.syncedCount} new emails from Outlook`,
      });
      
      refetch();
    } catch (error) {
      console.error("Failed to sync emails:", error);
      toast({
        title: "Sync Failed",
        description: "Failed to sync emails from Outlook",
        variant: "destructive",
      });
    }
  };

  // Fetch emails
  const { data: emails = [], isLoading, refetch } = useQuery<Email[]>({
    queryKey: ["/api/emails", selectedFolder],
    queryFn: async () => {
      const response = await fetch(`/api/emails?folder=${selectedFolder}`);
      if (!response.ok) throw new Error("Failed to fetch emails");
      return response.json();
    },
  });

  // Create/Send email mutation
  const createEmailMutation = useMutation({
    mutationFn: async (emailData: any) => {
      const response = await apiRequest("POST", "/api/emails", emailData);
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/emails"] });
      toast({
        title: "Success",
        description: variables.status === "sent" ? "Email sent successfully" : "Draft saved",
      });
      setIsComposeOpen(false);
      resetCompose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send email",
        variant: "destructive",
      });
    },
  });

  // Delete email mutation
  const deleteEmailMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/emails/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emails"] });
      toast({
        title: "Email deleted",
        description: "The email has been moved to trash",
      });
      setSelectedEmail(null);
    },
  });

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/emails/${id}/read`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emails"] });
    },
  });

  // Toggle star mutation
  const toggleStarMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/emails/${id}/star`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emails"] });
    },
  });

  // Move to folder mutation
  const moveToFolderMutation = useMutation({
    mutationFn: async ({ id, folder }: { id: string; folder: string }) => {
      const response = await apiRequest("POST", `/api/emails/${id}/move`, { folder });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emails"] });
      toast({
        title: "Email moved",
        description: "The email has been moved successfully",
      });
      setSelectedEmail(null);
    },
  });

  // WebSocket for real-time updates
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.event?.startsWith("email:")) {
        refetch();
      }
    };

    return () => {
      ws.close();
    };
  }, [refetch]);

  const resetCompose = () => {
    setComposeData({
      to: "",
      cc: "",
      bcc: "",
      subject: "",
      body: ""
    });
  };

  const handleSend = async () => {
    const emailData = {
      ...composeData,
      to: composeData.to.split(",").map(e => e.trim()),
      cc: composeData.cc ? composeData.cc.split(",").map(e => e.trim()) : [],
      bcc: composeData.bcc ? composeData.bcc.split(",").map(e => e.trim()) : [],
    };

    // If connected to Microsoft, send via Outlook
    if (connectionStatus.connected) {
      try {
        const response = await apiRequest("POST", "/api/microsoft/send", {
          ...emailData,
          isHtml: false
        });
        
        if (response.ok) {
          toast({
            title: "Success",
            description: "Email sent via Outlook",
          });
          setIsComposeOpen(false);
          resetCompose();
          refetch();
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to send email via Outlook",
          variant: "destructive",
        });
      }
    } else {
      // Use local storage
      createEmailMutation.mutate({
        ...emailData,
        status: "sent",
        folder: "sent"
      });
    }
  };

  const handleSaveDraft = () => {
    const emailData = {
      ...composeData,
      to: composeData.to.split(",").map(e => e.trim()),
      cc: composeData.cc ? composeData.cc.split(",").map(e => e.trim()) : [],
      bcc: composeData.bcc ? composeData.bcc.split(",").map(e => e.trim()) : [],
      status: "draft",
      folder: "drafts"
    };
    createEmailMutation.mutate(emailData);
  };

  const filteredEmails = emails.filter(email => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      email.subject.toLowerCase().includes(query) ||
      email.from.toLowerCase().includes(query) ||
      email.body.toLowerCase().includes(query)
    );
  });

  const unreadCount = emails.filter(e => !e.isRead).length;

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 border-r bg-background p-4 space-y-4">
        <Button 
          className="w-full gap-2" 
          onClick={() => setIsComposeOpen(true)}
          data-testid="button-compose"
        >
          <PenSquare className="h-4 w-4" />
          Compose
        </Button>

        <div className="space-y-1">
          {folders.map((folder) => {
            const Icon = folder.icon;
            const count = folder.value === "inbox" ? unreadCount : 0;
            return (
              <Button
                key={folder.value}
                variant={selectedFolder === folder.value ? "secondary" : "ghost"}
                className="w-full justify-start gap-2"
                onClick={() => setSelectedFolder(folder.value)}
                data-testid={`button-folder-${folder.value}`}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1 text-left">{folder.label}</span>
                {count > 0 && (
                  <Badge variant="secondary" className="ml-auto">
                    {count}
                  </Badge>
                )}
              </Button>
            );
          })}
        </div>

        <Separator />

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground px-2">
            Outlook Settings
          </h3>
          <Card className="p-3">
            <div className="space-y-2">
              {connectionStatus.connected ? (
                <>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{connectionStatus.email || "info@sovoice.ai"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="h-3 w-3 text-green-500" />
                    Connected to Microsoft Outlook
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full gap-1"
                    onClick={() => window.open("https://outlook.live.com/mail/0/", "_blank")}
                    data-testid="button-open-outlook"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open in Outlook
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full gap-1"
                    onClick={syncEmails}
                    data-testid="button-sync"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Sync Emails
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full gap-1"
                    onClick={() => setIsManualTokenOpen(true)}
                    data-testid="button-update-token"
                  >
                    <Settings2 className="h-3 w-3" />
                    Update Access Token
                  </Button>
                  <Button 
                    variant="default" 
                    size="sm" 
                    className="w-full gap-1"
                    onClick={async () => {
                      try {
                        await apiRequest('/api/microsoft/app-auth', 'POST', {
                          targetMailbox: 'info@sovoice.ai'
                        });
                        toast({
                          title: "Authentication Successful",
                          description: `Connected to info@sovoice.ai using application permissions`,
                        });
                        await refetch();
                        setTimeout(() => window.location.reload(), 1000);
                      } catch (error) {
                        toast({
                          title: "Authentication Failed",
                          description: "Please ensure your Azure App has Mail.Read and Mail.ReadWrite permissions with admin consent",
                          variant: "destructive",
                        });
                      }
                    }}
                    data-testid="button-app-auth"
                  >
                    <Key className="h-3 w-3" />
                    Use App Authentication
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm font-medium">Not Connected</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Connect your Microsoft account to sync real emails
                  </p>
                  <Button 
                    className="w-full gap-2"
                    size="sm"
                    onClick={() => setIsManualTokenOpen(true)}
                    data-testid="button-manual-token"
                  >
                    <Settings2 className="h-3 w-3" />
                    Manual Token Configuration
                  </Button>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">or</span>
                    </div>
                  </div>
                  <Button 
                    className="w-full gap-2"
                    size="sm"
                    variant="default"
                    onClick={connectToMicrosoft}
                    disabled={isConnecting}
                    data-testid="button-connect-microsoft"
                  >
                    {isConnecting ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        Verbindung wird hergestellt...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="h-3 w-3" />
                        Mit Outlook anmelden
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </Card>

          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full gap-2"
            onClick={() => refetch()}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Email List */}
      <div className="flex-1 flex">
        <div className="w-96 border-r">
          <div className="p-4 border-b space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search emails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {filteredEmails.length} email{filteredEmails.length !== 1 ? "s" : ""}
              </span>
              <Select value="newest">
                <SelectTrigger className="w-[120px] h-8" data-testid="select-sort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="oldest">Oldest</SelectItem>
                  <SelectItem value="unread">Unread</SelectItem>
                  <SelectItem value="starred">Starred</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-y-auto h-[calc(100%-120px)]">
            {isLoading ? (
              <div className="p-4 text-center text-muted-foreground">
                Loading emails...
              </div>
            ) : filteredEmails.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Mail className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>No emails in {selectedFolder}</p>
              </div>
            ) : (
              filteredEmails.map((email) => (
                <div
                  key={email.id}
                  className={`p-4 border-b cursor-pointer hover:bg-muted/50 ${
                    selectedEmail?.id === email.id ? "bg-muted" : ""
                  } ${!email.isRead ? "font-semibold" : ""}`}
                  onClick={() => {
                    setSelectedEmail(email);
                    if (!email.isRead) {
                      markAsReadMutation.mutate(email.id);
                    }
                  }}
                  data-testid={`email-item-${email.id}`}
                >
                  <div className="flex items-start gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 mt-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStarMutation.mutate(email.id);
                      }}
                      data-testid={`button-star-${email.id}`}
                    >
                      <Star className={`h-4 w-4 ${email.isStarred ? "fill-yellow-500 text-yellow-500" : ""}`} />
                    </Button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm truncate ${!email.isRead ? "font-semibold" : ""}`}>
                          {email.from}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {email.receivedAt || email.sentAt
                            ? formatDistanceToNow(new Date(email.receivedAt || email.sentAt || ""), { addSuffix: true })
                            : "Draft"}
                        </span>
                      </div>
                      <div className={`text-sm truncate mb-1 ${!email.isRead ? "" : "text-muted-foreground"}`}>
                        {email.subject || "(No subject)"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {email.body}
                      </div>
                      {email.attachments && email.attachments.length > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <Paperclip className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {email.attachments.length} attachment{email.attachments.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Email Detail */}
        <div className="flex-1">
          {selectedEmail ? (
            <div className="h-full flex flex-col">
              <div className="p-4 border-b">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">{selectedEmail.subject || "(No subject)"}</h2>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => toggleStarMutation.mutate(selectedEmail.id)}
                      data-testid="button-detail-star"
                    >
                      <Star className={`h-4 w-4 ${selectedEmail.isStarred ? "fill-yellow-500 text-yellow-500" : ""}`} />
                    </Button>
                    <Button variant="ghost" size="icon" data-testid="button-reply">
                      <Reply className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" data-testid="button-forward">
                      <Forward className="h-4 w-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid="button-more-actions">
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => moveToFolderMutation.mutate({ id: selectedEmail.id, folder: "archive" })}
                          data-testid="menu-archive"
                        >
                          <Archive className="h-4 w-4 mr-2" />
                          Archive
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => deleteEmailMutation.mutate(selectedEmail.id)}
                          data-testid="menu-delete"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem data-testid="menu-mark-unread">
                          <Mail className="h-4 w-4 mr-2" />
                          Mark as unread
                        </DropdownMenuItem>
                        <DropdownMenuItem data-testid="menu-move-to">
                          <Folder className="h-4 w-4 mr-2" />
                          Move to folder
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold">From:</span>
                    <span className="text-muted-foreground">{selectedEmail.from}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold">To:</span>
                    <span className="text-muted-foreground">{selectedEmail.to.join(", ")}</span>
                  </div>
                  {selectedEmail.cc && selectedEmail.cc.length > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold">Cc:</span>
                      <span className="text-muted-foreground">{selectedEmail.cc.join(", ")}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold">Date:</span>
                    <span className="text-muted-foreground">
                      {selectedEmail.receivedAt || selectedEmail.sentAt
                        ? new Date(selectedEmail.receivedAt || selectedEmail.sentAt || "").toLocaleString()
                        : "Draft"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex-1 p-6 overflow-y-auto">
                {selectedEmail.bodyHtml ? (
                  <div dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }} />
                ) : (
                  <div className="whitespace-pre-wrap">{selectedEmail.body}</div>
                )}
                {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                  <div className="mt-6 space-y-2">
                    <h3 className="font-semibold text-sm">Attachments</h3>
                    {selectedEmail.attachments.map((attachment, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 border rounded">
                        <Paperclip className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{attachment.filename}</span>
                        <span className="text-xs text-muted-foreground">
                          ({(attachment.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Mail className="h-16 w-16 mx-auto mb-4 opacity-20" />
                <p>Select an email to view</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Compose Dialog */}
      <Dialog open={isComposeOpen} onOpenChange={setIsComposeOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>New Email</DialogTitle>
            <DialogDescription>
              Compose and send an email from info@sovoice.ai
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="to">To</Label>
              <Input
                id="to"
                placeholder="recipient@example.com"
                value={composeData.to}
                onChange={(e) => setComposeData({ ...composeData, to: e.target.value })}
                data-testid="input-to"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cc">Cc (optional)</Label>
                <Input
                  id="cc"
                  placeholder="cc@example.com"
                  value={composeData.cc}
                  onChange={(e) => setComposeData({ ...composeData, cc: e.target.value })}
                  data-testid="input-cc"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="bcc">Bcc (optional)</Label>
                <Input
                  id="bcc"
                  placeholder="bcc@example.com"
                  value={composeData.bcc}
                  onChange={(e) => setComposeData({ ...composeData, bcc: e.target.value })}
                  data-testid="input-bcc"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                placeholder="Email subject"
                value={composeData.subject}
                onChange={(e) => setComposeData({ ...composeData, subject: e.target.value })}
                data-testid="input-subject"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="body">Message</Label>
              <Textarea
                id="body"
                placeholder="Type your message here..."
                value={composeData.body}
                onChange={(e) => setComposeData({ ...composeData, body: e.target.value })}
                rows={10}
                data-testid="textarea-body"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={handleSaveDraft}
              data-testid="button-save-draft"
            >
              Save as Draft
            </Button>
            <Button 
              onClick={handleSend}
              disabled={!composeData.to || !composeData.subject}
              data-testid="button-send"
            >
              <Send className="h-4 w-4 mr-2" />
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Token Configuration Dialog */}
      <Dialog open={isManualTokenOpen} onOpenChange={setIsManualTokenOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manual Token Configuration</DialogTitle>
            <DialogDescription>
              Configure your Microsoft Outlook access token manually
            </DialogDescription>
          </DialogHeader>
          
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>How to get your Access Token</AlertTitle>
            <AlertDescription className="space-y-2 mt-2">
              <ol className="list-decimal ml-4 space-y-1 text-sm">
                <li>Go to <a href="https://developer.microsoft.com/en-us/graph/graph-explorer" target="_blank" className="text-primary hover:underline">Microsoft Graph Explorer</a></li>
                <li>Sign in with your Microsoft account (info@sovoice.ai)</li>
                <li>Click on "Access Token" tab on the left sidebar</li>
                <li>Copy the entire access token</li>
                <li>Paste it below along with your email address</li>
              </ol>
              <p className="text-sm text-muted-foreground mt-2">
                Note: Access tokens expire after about 1 hour. You'll need to refresh it periodically.
              </p>
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="userEmail">Email Address</Label>
              <Input
                id="userEmail"
                type="email"
                placeholder="info@sovoice.ai"
                value={manualTokenData.userEmail}
                onChange={(e) => setManualTokenData({ ...manualTokenData, userEmail: e.target.value })}
                data-testid="input-user-email"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="accessToken">Access Token</Label>
              <Textarea
                id="accessToken"
                placeholder="Paste your Microsoft Graph access token here..."
                value={manualTokenData.accessToken}
                onChange={(e) => setManualTokenData({ ...manualTokenData, accessToken: e.target.value })}
                rows={6}
                className="font-mono text-xs"
                data-testid="textarea-access-token"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsManualTokenOpen(false);
                setManualTokenData({ accessToken: "", userEmail: "" });
              }}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button 
              onClick={submitManualToken}
              disabled={!manualTokenData.accessToken || !manualTokenData.userEmail || isConnecting}
              data-testid="button-save-token"
            >
              {isConnecting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Save & Connect
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}