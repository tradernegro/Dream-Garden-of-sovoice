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
  ExternalLink
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
import type { Email } from "@shared/schema";

// Email folders
const folders = [
  { value: "inbox", label: "Inbox", icon: Inbox },
  { value: "sent", label: "Sent", icon: Send },
  { value: "drafts", label: "Drafts", icon: PenSquare },
  { value: "archive", label: "Archive", icon: Archive },
  { value: "trash", label: "Trash", icon: Trash2 }
];

export default function EmailManagement() {
  const { toast } = useToast();
  const [selectedFolder, setSelectedFolder] = useState("inbox");
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeData, setComposeData] = useState({
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    body: ""
  });

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

  const handleSend = () => {
    const emailData = {
      ...composeData,
      to: composeData.to.split(",").map(e => e.trim()),
      cc: composeData.cc ? composeData.cc.split(",").map(e => e.trim()) : [],
      bcc: composeData.bcc ? composeData.bcc.split(",").map(e => e.trim()) : [],
      status: "sent",
      folder: "sent"
    };
    createEmailMutation.mutate(emailData);
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
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">info@sovoice.ai</span>
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
    </div>
  );
}