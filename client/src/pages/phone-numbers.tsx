import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Phone, 
  Plus, 
  Trash2, 
  CheckCircle, 
  XCircle,
  AlertCircle,
  PhoneOutgoing,
  PhoneIncoming,
  Smartphone,
  Globe,
  Calendar,
  DollarSign,
  Activity,
  FolderKanban,
  Settings2,
  Copy,
  Eye,
  EyeOff,
  TestTube,
  Link2,
  Shield,
  Loader2,
  Check,
  Clock,
  MessageSquare,
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneCall,
  PhoneOff,
  Users,
  User,
  Languages,
  Voicemail,
  MapPin,
  Building2,
  Timer,
  MoreVertical,
  Edit,
  Volume2,
  ChevronDown,
  ChevronRight,
  Bot,
  Zap,
  Filter,
  Search
} from "lucide-react";
import type { Project, Agent } from "@shared/schema";
import { 
  getCountryFromPhone, 
  formatPhoneNumber, 
  detectNumberType,
  getCallUrl,
  getWhatsAppUrl,
  canSendSMS,
  getTimezoneForNumber 
} from "@/lib/phone-utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface PhoneNumber {
  id: string;
  phoneNumber: string;
  friendlyName: string;
  projectId: string | null;
  projectName?: string;
  agentId: string | null;
  agentName?: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
    fax: boolean;
  };
  status: "active" | "inactive" | "suspended";
  monthlyFee: number | string;
  currency: string;
  region: string;
  countryCode: string;
  voiceUrl?: string;
  smsUrl?: string;
  metadata?: {
    city?: string;
    state?: string;
    country?: string;
    timezone?: string;
    carrier?: string;
    numberType?: string;
    supportedLanguages?: string[];
    businessHours?: {
      start: string;
      end: string;
      timezone: string;
      days: string[];
    };
    callRecording?: boolean;
    voicemail?: boolean;
    callTransfer?: boolean;
    ivr?: boolean;
  };
  createdAt: string;
  updatedAt: string;
  lastUsed?: string;
  totalCalls?: number;
  totalMinutes?: number;
}

export default function PhoneNumbers() {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState<PhoneNumber | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [showAuthToken, setShowAuthToken] = useState(false);
  const [showAccountSid, setShowAccountSid] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive" | "suspended">("all");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  
  const [configForm, setConfigForm] = useState({
    accountSid: "",
    authToken: "",
    phoneNumber: ""
  });
  
  const [newNumber, setNewNumber] = useState({
    phoneNumber: "",
    friendlyName: "",
    projectId: "none",
    agentId: "none",
    monthlyFee: "",
    voiceEnabled: true,
    smsEnabled: false,
    mmsEnabled: false,
    faxEnabled: false,
    metadata: {
      city: "",
      state: "",
      country: "",
      timezone: "",
      carrier: "",
      numberType: "local",
      supportedLanguages: [],
      businessHours: {
        start: "09:00",
        end: "17:00",
        timezone: "UTC",
        days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
      },
      callRecording: false,
      voicemail: false,
      callTransfer: false,
      ivr: false
    }
  });

  // Fetch phone numbers
  const { data: phoneNumbers = [], isLoading } = useQuery<PhoneNumber[]>({
    queryKey: ["/api/phone-numbers"],
    queryFn: async () => {
      const response = await fetch("/api/phone-numbers");
      if (!response.ok) throw new Error("Failed to fetch phone numbers");
      return response.json();
    }
  });

  // Fetch projects for assignment
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Fetch agents for assignment
  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  // Fetch Twilio configuration status
  const { data: twilioConfig, isLoading: isLoadingConfig } = useQuery({
    queryKey: ["/api/twilio/config"],
    queryFn: async () => {
      const response = await fetch("/api/twilio/config");
      if (!response.ok) throw new Error("Failed to fetch Twilio config");
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Test Twilio connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/twilio/config");
      if (!response.ok) throw new Error("Failed to test connection");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.configured) {
        toast({
          title: "Connection Successful",
          description: "Twilio is properly configured and connected.",
        });
      } else {
        toast({
          title: "Not Configured",
          description: "Please configure your Twilio credentials first.",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Connection Test Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Update Twilio configuration mutation
  const updateConfigMutation = useMutation({
    mutationFn: async (data: typeof configForm) => {
      const response = await apiRequest("POST", "/api/twilio/config", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/twilio/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/phone-numbers"] });
      setIsConfigDialogOpen(false);
      setConfigForm({ accountSid: "", authToken: "", phoneNumber: "" });
      toast({
        title: "Configuration Updated",
        description: "Twilio configuration and webhooks have been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Configuration Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Add phone number mutation
  const addNumberMutation = useMutation({
    mutationFn: async (data: typeof newNumber) => {
      const requestData = {
        phoneNumber: data.phoneNumber,
        friendlyName: data.friendlyName,
        projectId: data.projectId === "none" ? null : data.projectId,
        agentId: data.agentId === "none" ? null : data.agentId,
        monthlyFee: data.monthlyFee || "0.00",
        voiceEnabled: data.voiceEnabled,
        smsEnabled: data.smsEnabled,
        mmsEnabled: data.mmsEnabled,
        faxEnabled: data.faxEnabled,
        metadata: data.metadata
      };
      const response = await apiRequest("POST", "/api/phone-numbers", requestData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/phone-numbers"] });
      setIsAddDialogOpen(false);
      setNewNumber({ 
        phoneNumber: "", 
        friendlyName: "", 
        projectId: "none",
        agentId: "none",
        monthlyFee: "",
        voiceEnabled: true,
        smsEnabled: false,
        mmsEnabled: false,
        faxEnabled: false,
        metadata: {
          city: "",
          state: "",
          country: "",
          timezone: "",
          carrier: "",
          numberType: "local",
          supportedLanguages: [],
          businessHours: {
            start: "09:00",
            end: "17:00",
            timezone: "UTC",
            days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
          },
          callRecording: false,
          voicemail: false,
          callTransfer: false,
          ivr: false
        }
      });
      toast({
        title: "Phone number added",
        description: "The phone number has been successfully added to your account.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error adding phone number",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Update phone number mutation
  const updateNumberMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PhoneNumber> }) => {
      const response = await apiRequest("PATCH", `/api/phone-numbers/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/phone-numbers"] });
      setIsEditDialogOpen(false);
      setSelectedNumber(null);
      toast({
        title: "Phone number updated",
        description: "The phone number has been successfully updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error updating phone number",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Delete phone number mutation
  const deleteNumberMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/phone-numbers/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/phone-numbers"] });
      toast({
        title: "Phone number deleted",
        description: "The phone number has been removed from your account.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error deleting phone number",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Quick agent assignment mutation
  const assignAgentMutation = useMutation({
    mutationFn: async ({ id, agentId }: { id: string; agentId: string | null }) => {
      const response = await apiRequest("PATCH", `/api/phone-numbers/${id}`, { agentId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/phone-numbers"] });
      toast({
        title: "Agent assigned",
        description: "The agent has been assigned to this phone number.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error assigning agent",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "inactive":
        return <XCircle className="h-4 w-4 text-gray-500" />;
      case "suspended":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return null;
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedWebhook(label);
      setTimeout(() => setCopiedWebhook(null), 2000);
      toast({
        title: "Copied!",
        description: `${label} copied to clipboard.`,
      });
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Could not copy to clipboard. Please copy manually.",
        variant: "destructive",
      });
    }
  };

  const toggleRowExpand = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  // Filter phone numbers
  const filteredNumbers = phoneNumbers.filter(number => {
    const matchesSearch = searchQuery === "" || 
      number.phoneNumber.includes(searchQuery) ||
      number.friendlyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      number.agentName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      number.projectName?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = filterStatus === "all" || number.status === filterStatus;
    const matchesProject = filterProject === "all" || number.projectId === filterProject;
    
    return matchesSearch && matchesStatus && matchesProject;
  });

  // Calculate stats
  const stats = {
    total: phoneNumbers.length,
    active: phoneNumbers.filter(n => n.status === "active").length,
    assigned: phoneNumbers.filter(n => n.agentId).length,
    withProjects: phoneNumbers.filter(n => n.projectId).length,
    monthlyCost: phoneNumbers.reduce((sum, n) => {
      const fee = typeof n.monthlyFee === 'string' ? parseFloat(n.monthlyFee) : n.monthlyFee;
      return sum + (fee || 0);
    }, 0)
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-phone-numbers-title">
            Phone Numbers
          </h1>
          <p className="text-muted-foreground">
            Manage your voice platform phone numbers and agent assignments
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-configure-twilio">
                <Settings2 className="h-4 w-4 mr-2" />
                Configure Twilio
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Twilio Configuration</DialogTitle>
                <DialogDescription>
                  Configure your Twilio account settings for voice services
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="accountSid">Account SID</Label>
                  <div className="flex gap-2">
                    <Input
                      id="accountSid"
                      type={showAccountSid ? "text" : "password"}
                      placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      value={configForm.accountSid}
                      onChange={(e) => setConfigForm({ ...configForm, accountSid: e.target.value })}
                      data-testid="input-account-sid"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowAccountSid(!showAccountSid)}
                    >
                      {showAccountSid ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="authToken">Auth Token</Label>
                  <div className="flex gap-2">
                    <Input
                      id="authToken"
                      type={showAuthToken ? "text" : "password"}
                      placeholder="Your Twilio Auth Token"
                      value={configForm.authToken}
                      onChange={(e) => setConfigForm({ ...configForm, authToken: e.target.value })}
                      data-testid="input-auth-token"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowAuthToken(!showAuthToken)}
                    >
                      {showAuthToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phoneNumber">Phone Number</Label>
                  <Input
                    id="phoneNumber"
                    placeholder="+1234567890"
                    value={configForm.phoneNumber}
                    onChange={(e) => setConfigForm({ ...configForm, phoneNumber: e.target.value })}
                    data-testid="input-config-phone-number"
                  />
                </div>
                
                {twilioConfig?.webhookUrls && (
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Link2 className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm font-medium">Webhook URLs</Label>
                    </div>
                    
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Voice URL:</span>
                        <div className="flex items-center gap-1">
                          <code className="bg-muted px-2 py-1 rounded" data-testid="text-voice-url">
                            {twilioConfig.webhookUrls.voice}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => copyToClipboard(twilioConfig.webhookUrls.voice, "Voice URL")}
                            data-testid="button-copy-voice-url"
                          >
                            {copiedWebhook === "Voice URL" ? (
                              <Check className="h-3 w-3 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Status URL:</span>
                        <div className="flex items-center gap-1">
                          <code className="bg-muted px-2 py-1 rounded" data-testid="text-status-url">
                            {twilioConfig.webhookUrls.status}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => copyToClipboard(twilioConfig.webhookUrls.status, "Status URL")}
                            data-testid="button-copy-status-url"
                          >
                            {copiedWebhook === "Status URL" ? (
                              <Check className="h-3 w-3 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsConfigDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => testConnectionMutation.mutate()}
                  disabled={testConnectionMutation.isPending}
                  variant="outline"
                  data-testid="button-test-connection"
                >
                  {testConnectionMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Test Connection
                </Button>
                <Button
                  onClick={() => updateConfigMutation.mutate(configForm)}
                  disabled={updateConfigMutation.isPending || (!configForm.accountSid && !configForm.authToken && !configForm.phoneNumber)}
                  data-testid="button-save-config"
                >
                  {updateConfigMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Configuration
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-phone-number">
                <Plus className="h-4 w-4 mr-2" />
                Add Phone Number
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Phone Number</DialogTitle>
                <DialogDescription>
                  Add a new phone number to your voice platform
                </DialogDescription>
              </DialogHeader>
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="basic">Basic Info</TabsTrigger>
                  <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
                  <TabsTrigger value="advanced">Advanced</TabsTrigger>
                </TabsList>
                
                <TabsContent value="basic" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      placeholder="+1234567890"
                      value={newNumber.phoneNumber}
                      onChange={(e) => setNewNumber({ ...newNumber, phoneNumber: e.target.value })}
                      data-testid="input-phone-number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Friendly Name</Label>
                    <Input
                      id="name"
                      placeholder="Main Support Line"
                      value={newNumber.friendlyName}
                      onChange={(e) => setNewNumber({ ...newNumber, friendlyName: e.target.value })}
                      data-testid="input-friendly-name"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="project">Project</Label>
                      <Select
                        value={newNumber.projectId}
                        onValueChange={(value) => setNewNumber({ ...newNumber, projectId: value })}
                      >
                        <SelectTrigger data-testid="select-project">
                          <SelectValue placeholder="Select a project" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {projects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="agent">Agent for Inbound</Label>
                      <Select
                        value={newNumber.agentId}
                        onValueChange={(value) => setNewNumber({ ...newNumber, agentId: value })}
                      >
                        <SelectTrigger data-testid="select-agent">
                          <SelectValue placeholder="Select an agent" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {agents.map((agent) => (
                            <SelectItem key={agent.id} value={agent.id}>
                              {agent.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fee">Monthly Fee ($)</Label>
                    <Input
                      id="fee"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={newNumber.monthlyFee}
                      onChange={(e) => setNewNumber({ ...newNumber, monthlyFee: e.target.value })}
                      data-testid="input-monthly-fee"
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="capabilities" className="space-y-4">
                  <div className="space-y-4">
                    <Label>Communication Capabilities</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <PhoneCall className="h-4 w-4" />
                          <Label htmlFor="voice" className="font-normal">Voice Calls</Label>
                        </div>
                        <Switch
                          id="voice"
                          checked={newNumber.voiceEnabled}
                          onCheckedChange={(checked) => setNewNumber({ ...newNumber, voiceEnabled: checked })}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" />
                          <Label htmlFor="sms" className="font-normal">SMS</Label>
                        </div>
                        <Switch
                          id="sms"
                          checked={newNumber.smsEnabled}
                          onCheckedChange={(checked) => setNewNumber({ ...newNumber, smsEnabled: checked })}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" />
                          <Label htmlFor="mms" className="font-normal">MMS</Label>
                        </div>
                        <Switch
                          id="mms"
                          checked={newNumber.mmsEnabled}
                          onCheckedChange={(checked) => setNewNumber({ ...newNumber, mmsEnabled: checked })}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4" />
                          <Label htmlFor="fax" className="font-normal">Fax</Label>
                        </div>
                        <Switch
                          id="fax"
                          checked={newNumber.faxEnabled}
                          onCheckedChange={(checked) => setNewNumber({ ...newNumber, faxEnabled: checked })}
                        />
                      </div>
                    </div>
                    
                    <Label>Advanced Features</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <Mic className="h-4 w-4" />
                          <Label htmlFor="recording" className="font-normal">Call Recording</Label>
                        </div>
                        <Switch
                          id="recording"
                          checked={newNumber.metadata.callRecording}
                          onCheckedChange={(checked) => setNewNumber({ 
                            ...newNumber, 
                            metadata: { ...newNumber.metadata, callRecording: checked }
                          })}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <Voicemail className="h-4 w-4" />
                          <Label htmlFor="voicemail" className="font-normal">Voicemail</Label>
                        </div>
                        <Switch
                          id="voicemail"
                          checked={newNumber.metadata.voicemail}
                          onCheckedChange={(checked) => setNewNumber({ 
                            ...newNumber, 
                            metadata: { ...newNumber.metadata, voicemail: checked }
                          })}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <PhoneOutgoing className="h-4 w-4" />
                          <Label htmlFor="transfer" className="font-normal">Call Transfer</Label>
                        </div>
                        <Switch
                          id="transfer"
                          checked={newNumber.metadata.callTransfer}
                          onCheckedChange={(checked) => setNewNumber({ 
                            ...newNumber, 
                            metadata: { ...newNumber.metadata, callTransfer: checked }
                          })}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4" />
                          <Label htmlFor="ivr" className="font-normal">IVR System</Label>
                        </div>
                        <Switch
                          id="ivr"
                          checked={newNumber.metadata.ivr}
                          onCheckedChange={(checked) => setNewNumber({ 
                            ...newNumber, 
                            metadata: { ...newNumber.metadata, ivr: checked }
                          })}
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="advanced" className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        placeholder="San Francisco"
                        value={newNumber.metadata.city}
                        onChange={(e) => setNewNumber({ 
                          ...newNumber, 
                          metadata: { ...newNumber.metadata, city: e.target.value } 
                        })}
                        data-testid="input-city"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">State</Label>
                      <Input
                        id="state"
                        placeholder="CA"
                        value={newNumber.metadata.state}
                        onChange={(e) => setNewNumber({ 
                          ...newNumber, 
                          metadata: { ...newNumber.metadata, state: e.target.value } 
                        })}
                        data-testid="input-state"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="country">Country</Label>
                      <Input
                        id="country"
                        placeholder="United States"
                        value={newNumber.metadata.country}
                        onChange={(e) => setNewNumber({ 
                          ...newNumber, 
                          metadata: { ...newNumber.metadata, country: e.target.value } 
                        })}
                        data-testid="input-country"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="timezone">Timezone</Label>
                      <Input
                        id="timezone"
                        placeholder="America/New_York"
                        value={newNumber.metadata.timezone}
                        onChange={(e) => setNewNumber({ 
                          ...newNumber, 
                          metadata: { ...newNumber.metadata, timezone: e.target.value } 
                        })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="carrier">Carrier</Label>
                      <Input
                        id="carrier"
                        placeholder="Twilio"
                        value={newNumber.metadata.carrier}
                        onChange={(e) => setNewNumber({ 
                          ...newNumber, 
                          metadata: { ...newNumber.metadata, carrier: e.target.value } 
                        })}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="numberType">Number Type</Label>
                    <Select
                      value={newNumber.metadata.numberType}
                      onValueChange={(value) => setNewNumber({ 
                        ...newNumber, 
                        metadata: { ...newNumber.metadata, numberType: value } 
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select number type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local">Local</SelectItem>
                        <SelectItem value="toll-free">Toll-Free</SelectItem>
                        <SelectItem value="mobile">Mobile</SelectItem>
                        <SelectItem value="national">National</SelectItem>
                        <SelectItem value="international">International</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Business Hours</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        placeholder="Start (09:00)"
                        value={newNumber.metadata.businessHours?.start}
                        onChange={(e) => setNewNumber({ 
                          ...newNumber, 
                          metadata: { 
                            ...newNumber.metadata, 
                            businessHours: {
                              ...newNumber.metadata.businessHours!,
                              start: e.target.value
                            }
                          } 
                        })}
                      />
                      <Input
                        placeholder="End (17:00)"
                        value={newNumber.metadata.businessHours?.end}
                        onChange={(e) => setNewNumber({ 
                          ...newNumber, 
                          metadata: { 
                            ...newNumber.metadata, 
                            businessHours: {
                              ...newNumber.metadata.businessHours!,
                              end: e.target.value
                            }
                          } 
                        })}
                      />
                      <Input
                        placeholder="Timezone"
                        value={newNumber.metadata.businessHours?.timezone}
                        onChange={(e) => setNewNumber({ 
                          ...newNumber, 
                          metadata: { 
                            ...newNumber.metadata, 
                            businessHours: {
                              ...newNumber.metadata.businessHours!,
                              timezone: e.target.value
                            }
                          } 
                        })}
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => addNumberMutation.mutate(newNumber)}
                  disabled={!newNumber.phoneNumber || addNumberMutation.isPending}
                  data-testid="button-confirm-add"
                >
                  {addNumberMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add Number
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Numbers</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-numbers">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              Across all projects
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-numbers">{stats.active}</div>
            <p className="text-xs text-muted-foreground">
              Ready for calls
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">With Agents</CardTitle>
            <Bot className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-assigned-numbers">{stats.assigned}</div>
            <p className="text-xs text-muted-foreground">
              Agent assigned
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">With Projects</CardTitle>
            <FolderKanban className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-project-numbers">{stats.withProjects}</div>
            <p className="text-xs text-muted-foreground">
              Project assigned
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-monthly-cost">
              ${stats.monthlyCost.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              Total monthly fees
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Phone Number Management</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search numbers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-64"
                  data-testid="input-search"
                />
              </div>
              <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
                <SelectTrigger className="w-32" data-testid="select-filter-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterProject} onValueChange={setFilterProject}>
                <SelectTrigger className="w-40" data-testid="select-filter-project">
                  <SelectValue placeholder="Project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map(project => (
                    <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : filteredNumbers.length === 0 ? (
            <div className="text-center py-8">
              <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">No phone numbers found</h3>
              <p className="text-muted-foreground">
                {searchQuery || filterStatus !== "all" || filterProject !== "all" 
                  ? "Try adjusting your filters"
                  : "Get started by adding a phone number"}
              </p>
            </div>
          ) : (
            <TooltipProvider>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30px]"></TableHead>
                    <TableHead>Phone Number</TableHead>
                    <TableHead>Name / Location</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Capabilities</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredNumbers.map((number) => {
                    const countryInfo = getCountryFromPhone(number.phoneNumber);
                    const timezone = getTimezoneForNumber(number.phoneNumber) || number.metadata?.timezone;
                    const numberType = detectNumberType(number.phoneNumber) || number.metadata?.numberType;
                    const isExpanded = expandedRows.has(number.id);
                    
                    return (
                      <>
                        <TableRow key={number.id} data-testid={`row-phone-${number.id}`}>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => toggleRowExpand(number.id)}
                            >
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {countryInfo && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <span className="text-xl" data-testid={`flag-${number.id}`}>
                                      {countryInfo.flag}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {countryInfo.name} ({countryInfo.dialCode})
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              <a 
                                href={getCallUrl(number.phoneNumber)}
                                className="hover:underline text-blue-600 dark:text-blue-400 flex items-center gap-1"
                                data-testid={`link-phone-${number.id}`}
                              >
                                {formatPhoneNumber(number.phoneNumber)}
                                <PhoneCall className="h-3 w-3" />
                              </a>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{number.friendlyName || 'Unnamed'}</div>
                              <div className="text-xs text-muted-foreground flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {countryInfo?.name || number.metadata?.country || number.region || 'Unknown'}
                                {(number.metadata?.city || number.metadata?.state) && (
                                  <span>
                                    {number.metadata?.city && `, ${number.metadata.city}`}
                                    {number.metadata?.state && `, ${number.metadata.state}`}
                                  </span>
                                )}
                              </div>
                              {numberType && (
                                <Badge variant="outline" className="text-xs">
                                  {numberType}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {number.projectId ? (
                              <div className="flex items-center gap-1">
                                <FolderKanban className="h-3 w-3" />
                                <span className="text-sm">{number.projectName || 'Unknown'}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">Unassigned</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={number.agentId || "none"}
                              onValueChange={(value) => {
                                assignAgentMutation.mutate({
                                  id: number.id,
                                  agentId: value === "none" ? null : value
                                });
                              }}
                            >
                              <SelectTrigger className="w-40" data-testid={`select-agent-${number.id}`}>
                                <SelectValue placeholder="Select agent">
                                  {number.agentId ? (
                                    <div className="flex items-center gap-1">
                                      <Bot className="h-3 w-3" />
                                      {number.agentName || 'Unknown'}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">No agent</span>
                                  )}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No agent</SelectItem>
                                {agents.map((agent) => (
                                  <SelectItem key={agent.id} value={agent.id}>
                                    <div className="flex items-center gap-1">
                                      <Bot className="h-3 w-3" />
                                      {agent.name}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {number.capabilities.voice && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="text-xs">
                                      <PhoneCall className="h-3 w-3" />
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>Voice calls enabled</TooltipContent>
                                </Tooltip>
                              )}
                              {number.capabilities.sms && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="text-xs">
                                      <MessageSquare className="h-3 w-3" />
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>SMS enabled</TooltipContent>
                                </Tooltip>
                              )}
                              {number.capabilities.mms && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="text-xs">
                                      MMS
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>MMS enabled</TooltipContent>
                                </Tooltip>
                              )}
                              {number.capabilities.fax && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="text-xs">
                                      FAX
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>Fax enabled</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            {number.metadata && (
                              <div className="flex gap-1 mt-1">
                                {number.metadata.callRecording && (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Badge variant="secondary" className="text-xs">
                                        <Mic className="h-3 w-3" />
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>Call recording enabled</TooltipContent>
                                  </Tooltip>
                                )}
                                {number.metadata.voicemail && (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Badge variant="secondary" className="text-xs">
                                        <Voicemail className="h-3 w-3" />
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>Voicemail enabled</TooltipContent>
                                  </Tooltip>
                                )}
                                {number.metadata.ivr && (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Badge variant="secondary" className="text-xs">
                                        IVR
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>IVR system enabled</TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(number.status)}
                              <span className="text-sm capitalize">{number.status}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              ${typeof number.monthlyFee === 'string' ? parseFloat(number.monthlyFee) : number.monthlyFee}/mo
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" data-testid={`button-actions-${number.id}`}>
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => window.open(getCallUrl(number.phoneNumber))}>
                                  <PhoneCall className="h-4 w-4 mr-2" />
                                  Call Number
                                </DropdownMenuItem>
                                {canSendSMS(number.phoneNumber, number.capabilities) && (
                                  <DropdownMenuItem onClick={() => window.open(getWhatsAppUrl(number.phoneNumber))}>
                                    <MessageSquare className="h-4 w-4 mr-2" />
                                    WhatsApp
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => copyToClipboard(number.phoneNumber, "Phone number")}>
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copy Number
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => {
                                  setSelectedNumber(number);
                                  setIsEditDialogOpen(true);
                                }}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit Details
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="text-destructive"
                                  onClick={() => {
                                    if (confirm(`Are you sure you want to delete ${number.phoneNumber}?`)) {
                                      deleteNumberMutation.mutate(number.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={9} className="p-0">
                              <div className="bg-muted/50 p-4 space-y-4">
                                <div className="grid grid-cols-4 gap-4">
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Total Calls</Label>
                                    <div className="flex items-center gap-1">
                                      <PhoneIncoming className="h-4 w-4" />
                                      <span className="font-medium">{number.totalCalls || 0}</span>
                                    </div>
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Total Minutes</Label>
                                    <div className="flex items-center gap-1">
                                      <Timer className="h-4 w-4" />
                                      <span className="font-medium">{number.totalMinutes || 0}</span>
                                    </div>
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Timezone</Label>
                                    <div className="flex items-center gap-1">
                                      <Clock className="h-4 w-4" />
                                      <span className="font-medium">{timezone || 'Unknown'}</span>
                                    </div>
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Last Used</Label>
                                    <div className="flex items-center gap-1">
                                      <Calendar className="h-4 w-4" />
                                      <span className="font-medium">
                                        {number.lastUsed ? new Date(number.lastUsed).toLocaleDateString() : 'Never'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                
                                {number.metadata?.businessHours && (
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Business Hours</Label>
                                    <div className="flex items-center gap-2 mt-1">
                                      <Clock className="h-4 w-4" />
                                      <span>
                                        {number.metadata.businessHours.start} - {number.metadata.businessHours.end} 
                                        ({number.metadata.businessHours.timezone})
                                      </span>
                                      <Badge variant="outline" className="text-xs">
                                        {number.metadata.businessHours.days?.join(', ')}
                                      </Badge>
                                    </div>
                                  </div>
                                )}
                                
                                {number.metadata?.supportedLanguages && number.metadata.supportedLanguages.length > 0 && (
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Supported Languages</Label>
                                    <div className="flex items-center gap-2 mt-1">
                                      <Languages className="h-4 w-4" />
                                      {number.metadata.supportedLanguages.map(lang => (
                                        <Badge key={lang} variant="secondary" className="text-xs">
                                          {lang}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                
                                <div className="grid grid-cols-2 gap-4">
                                  {number.voiceUrl && (
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Voice Webhook URL</Label>
                                      <code className="text-xs bg-muted p-1 rounded block mt-1">
                                        {number.voiceUrl}
                                      </code>
                                    </div>
                                  )}
                                  {number.smsUrl && (
                                    <div>
                                      <Label className="text-xs text-muted-foreground">SMS Webhook URL</Label>
                                      <code className="text-xs bg-muted p-1 rounded block mt-1">
                                        {number.smsUrl}
                                      </code>
                                    </div>
                                  )}
                                </div>
                                
                                <div className="flex items-center justify-between pt-2">
                                  <div className="text-xs text-muted-foreground">
                                    Created: {new Date(number.createdAt).toLocaleDateString()}
                                    {number.updatedAt && ` • Updated: ${new Date(number.updatedAt).toLocaleDateString()}`}
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedNumber(number);
                                      setIsEditDialogOpen(true);
                                    }}
                                  >
                                    <Settings2 className="h-3 w-3 mr-1" />
                                    Configure
                                  </Button>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      {selectedNumber && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Phone Number</DialogTitle>
              <DialogDescription>
                Update the details for {formatPhoneNumber(selectedNumber.phoneNumber)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Friendly Name</Label>
                <Input
                  id="edit-name"
                  value={selectedNumber.friendlyName || ''}
                  onChange={(e) => setSelectedNumber({ ...selectedNumber, friendlyName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-project">Project</Label>
                  <Select
                    value={selectedNumber.projectId || "none"}
                    onValueChange={(value) => setSelectedNumber({ 
                      ...selectedNumber, 
                      projectId: value === "none" ? null : value 
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-agent">Agent for Inbound</Label>
                  <Select
                    value={selectedNumber.agentId || "none"}
                    onValueChange={(value) => setSelectedNumber({ 
                      ...selectedNumber, 
                      agentId: value === "none" ? null : value 
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select an agent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-status">Status</Label>
                <Select
                  value={selectedNumber.status}
                  onValueChange={(value: any) => setSelectedNumber({ ...selectedNumber, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-fee">Monthly Fee ($)</Label>
                <Input
                  id="edit-fee"
                  type="number"
                  step="0.01"
                  value={selectedNumber.monthlyFee}
                  onChange={(e) => setSelectedNumber({ ...selectedNumber, monthlyFee: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => updateNumberMutation.mutate({ id: selectedNumber.id, data: selectedNumber })}
                disabled={updateNumberMutation.isPending}
              >
                {updateNumberMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}