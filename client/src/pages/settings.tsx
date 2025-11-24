import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Phone, Key, Database, Webhook, Plus, Trash2, Copy, Eye, EyeOff, AlertCircle, Mail, ExternalLink, LogOut } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  key?: string; // Only returned on creation
}

export default function Settings() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Fetch API keys
  const { data: apiKeys = [], isLoading } = useQuery<ApiKey[]>({
    queryKey: ["/api/keys"],
  });

  // Fetch Microsoft OAuth status
  const { data: microsoftStatus } = useQuery<{
    connected: boolean;
    email: string | null;
    configured: boolean;
  }>({
    queryKey: ["/api/microsoft/status"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Check URL parameters for OAuth callback status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    
    if (params.get("success") === "connected") {
      const email = params.get("email");
      toast({
        title: "✅ Microsoft Outlook connected!",
        description: `Successfully connected to ${email}`,
      });
      // Clean up URL
      window.history.replaceState({}, document.title, "/settings");
      // Refetch status
      queryClient.invalidateQueries({ queryKey: ["/api/microsoft/status"] });
    } else if (params.get("error")) {
      const errorType = params.get("error");
      const details = params.get("details");
      toast({
        title: "❌ Connection failed",
        description: details || `Failed to connect to Microsoft Outlook (${errorType})`,
        variant: "destructive",
      });
      // Clean up URL
      window.history.replaceState({}, document.title, "/settings");
    }
  }, [toast]);

  // Handle Microsoft OAuth login
  const handleMicrosoftLogin = async () => {
    setIsConnecting(true);
    try {
      const response = await fetch("/api/microsoft/auth-url");
      if (response.ok) {
        const { authUrl } = await response.json();
        // Redirect to Microsoft OAuth
        window.location.href = authUrl;
      } else {
        throw new Error("Failed to get authorization URL");
      }
    } catch (error) {
      console.error("Failed to connect:", error);
      toast({
        title: "Connection error",
        description: "Failed to initiate Microsoft connection. Please ensure Microsoft OAuth is configured.",
        variant: "destructive",
      });
      setIsConnecting(false);
    }
  };

  // Handle Microsoft logout
  const handleMicrosoftLogout = async () => {
    if (!microsoftStatus?.email) return;
    
    try {
      const response = await apiRequest("POST", "/api/microsoft/disconnect", {
        email: microsoftStatus.email,
      });
      
      if (response.ok) {
        toast({
          title: "Disconnected",
          description: "Microsoft Outlook has been disconnected",
        });
        // Refetch status
        queryClient.invalidateQueries({ queryKey: ["/api/microsoft/status"] });
      }
    } catch (error) {
      console.error("Failed to disconnect:", error);
      toast({
        title: "Error",
        description: "Failed to disconnect Microsoft Outlook",
        variant: "destructive",
      });
    }
  };

  // Create API key
  const createKeyMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("POST", "/api/keys", { name });
      return response.json();
    },
    onSuccess: (data: ApiKey) => {
      queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
      setGeneratedKey(data.key!); // Store the generated key to show once
      setShowKey(true);
      setNewKeyName("");
      toast({
        title: "API Key Created",
        description: "Save this key securely - it will only be shown once!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete API key
  const deleteKeyMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/keys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
      toast({
        title: "API Key Deleted",
        description: "The API key has been permanently deleted.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateKey = () => {
    if (!newKeyName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a key name",
        variant: "destructive",
      });
      return;
    }
    createKeyMutation.mutate(newKeyName);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "API key copied to clipboard",
    });
  };

  const closeCreateDialog = () => {
    setIsCreateDialogOpen(false);
    setGeneratedKey(null);
    setShowKey(false);
    setNewKeyName("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold" data-testid="text-settings-title">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure your platform integrations and preferences
        </p>
      </div>

      <div className="grid gap-6">
        {/* Twilio Integration */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                  <Phone className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Twilio Integration</CardTitle>
                  <CardDescription>Connect your Twilio account for phone calls</CardDescription>
                </div>
              </div>
              <Badge variant="secondary" className="bg-green-500/10 text-green-700 dark:text-green-400">
                Connected
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="twilio-status">Status</Label>
                <p className="text-sm text-muted-foreground">
                  Your Twilio integration is active and ready to handle calls
                </p>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <p className="text-sm font-mono text-muted-foreground">
                  Configured via Twilio connection
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* OpenAI Integration */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                  <Key className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle>OpenAI Integration</CardTitle>
                  <CardDescription>AI model for voice conversations</CardDescription>
                </div>
              </div>
              <Badge variant="secondary" className="bg-green-500/10 text-green-700 dark:text-green-400">
                Connected
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>API Configuration</Label>
                <p className="text-sm text-muted-foreground">
                  OpenAI API key is configured and ready for voice AI
                </p>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Model</Label>
                <p className="text-sm font-mono text-muted-foreground">
                  gpt-4-realtime (Voice)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Microsoft Outlook Integration */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                  <Mail className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Microsoft Outlook</CardTitle>
                  <CardDescription>Send emails from info@sovoice.ai</CardDescription>
                </div>
              </div>
              {microsoftStatus?.connected ? (
                <Badge variant="secondary" className="bg-green-500/10 text-green-700 dark:text-green-400">
                  Connected
                </Badge>
              ) : microsoftStatus?.configured ? (
                <Badge variant="secondary" className="bg-orange-500/10 text-orange-700 dark:text-orange-400">
                  Not connected
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-red-500/10 text-red-700 dark:text-red-400">
                  Not configured
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              {microsoftStatus?.connected ? (
                <>
                  <div className="space-y-2">
                    <Label>Connected Account</Label>
                    <p className="text-sm text-muted-foreground">
                      {microsoftStatus.email || "info@sovoice.ai"}
                    </p>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <p className="text-sm text-muted-foreground">
                      Email sending is active. Appointment confirmations will be sent automatically.
                    </p>
                  </div>
                  <Button 
                    variant="outline" 
                    onClick={handleMicrosoftLogout}
                    data-testid="button-disconnect-outlook"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Disconnect
                  </Button>
                </>
              ) : microsoftStatus?.configured ? (
                <>
                  <div className="space-y-2">
                    <Label>Connect to Microsoft</Label>
                    <p className="text-sm text-muted-foreground">
                      Sign in with your Microsoft account to send emails from info@sovoice.ai
                    </p>
                  </div>
                  <Button 
                    onClick={handleMicrosoftLogin}
                    disabled={isConnecting}
                    data-testid="button-connect-outlook"
                    className="w-full sm:w-auto"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    {isConnecting ? "Connecting..." : "Connect with Microsoft"}
                  </Button>
                </>
              ) : (
                <>
                  <Alert className="border-orange-500/20 bg-orange-500/5">
                    <AlertCircle className="h-4 w-4 text-orange-600" />
                    <AlertDescription className="text-sm">
                      Microsoft OAuth is not configured. Please set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET environment variables to enable email sending.
                    </AlertDescription>
                  </Alert>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Webhook Configuration */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                <Webhook className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>Webhook Notifications</CardTitle>
                <CardDescription>Receive real-time call events via webhook</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="webhook-url">Webhook URL</Label>
              <Input
                id="webhook-url"
                placeholder="https://your-domain.com/webhook"
                data-testid="input-webhook-url"
              />
              <p className="text-xs text-muted-foreground">
                POST requests will be sent to this URL for call events
              </p>
            </div>
            <Button variant="outline" data-testid="button-save-webhook">
              Save Webhook
            </Button>
          </CardContent>
        </Card>

        {/* Data Management */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                <Database className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>Data Management</CardTitle>
                <CardDescription>Manage your call data and recordings</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label>Storage</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Call recordings and transcripts are stored securely
                </p>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Retention Policy</Label>
                <p className="text-sm text-muted-foreground">
                  Data is retained for 90 days by default
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Keys */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                  <Key className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle>API Keys</CardTitle>
                  <CardDescription>Manage API keys for external integrations</CardDescription>
                </div>
              </div>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-create-api-key">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Key
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create API Key</DialogTitle>
                    <DialogDescription>
                      {generatedKey ? "Your new API key has been generated" : "Create a new API key for external integrations"}
                    </DialogDescription>
                  </DialogHeader>
                  
                  {generatedKey ? (
                    <div className="space-y-4">
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Save this key securely! It will only be shown once and cannot be recovered.
                        </AlertDescription>
                      </Alert>
                      
                      <div className="space-y-2">
                        <Label>Your API Key</Label>
                        <div className="flex gap-2">
                          <Input
                            value={showKey ? generatedKey : "•".repeat(50)}
                            readOnly
                            className="font-mono text-sm"
                            data-testid="input-generated-key"
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setShowKey(!showKey)}
                            data-testid="button-toggle-key-visibility"
                          >
                            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => copyToClipboard(generatedKey)}
                            data-testid="button-copy-key"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="key-name">Key Name</Label>
                        <Input
                          id="key-name"
                          placeholder="Production API Key"
                          value={newKeyName}
                          onChange={(e) => setNewKeyName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleCreateKey()}
                          data-testid="input-key-name"
                        />
                        <p className="text-xs text-muted-foreground">
                          Give your key a descriptive name
                        </p>
                      </div>
                    </div>
                  )}
                  
                  <DialogFooter>
                    {generatedKey ? (
                      <Button onClick={closeCreateDialog} data-testid="button-done-key">
                        Done
                      </Button>
                    ) : (
                      <>
                        <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleCreateKey} disabled={createKeyMutation.isPending} data-testid="button-generate-key">
                          {createKeyMutation.isPending ? "Generating..." : "Generate Key"}
                        </Button>
                      </>
                    )}
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading API keys...</p>
            ) : apiKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">No API keys created yet</p>
            ) : (
              <div className="space-y-3">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between p-3 border rounded-md"
                    data-testid={`api-key-${key.id}`}
                  >
                    <div className="flex-1 space-y-1">
                      <p className="font-medium text-sm">{key.name}</p>
                      <p className="text-xs font-mono text-muted-foreground">{key.keyPrefix}</p>
                      <p className="text-xs text-muted-foreground">
                        Created {new Date(key.createdAt).toLocaleDateString()}
                        {key.lastUsedAt && ` • Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteKeyMutation.mutate(key.id)}
                      disabled={deleteKeyMutation.isPending}
                      data-testid={`button-delete-key-${key.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
