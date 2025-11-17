import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Phone, Key, Database, Webhook } from "lucide-react";

export default function Settings() {
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
      </div>
    </div>
  );
}
