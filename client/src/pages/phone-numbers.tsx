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
  Info,
  MapPin,
  Clock,
  Edit2
} from "lucide-react";
import type { Project } from "@shared/schema";
import { FiFlag } from 'react-icons/fi';
import { FaFlagUsa } from 'react-icons/fa';
import { GiSwitzerlandFlag } from 'react-icons/gi';
import { 
  MdFlag, 
  MdOutlineFlag,
  MdFlagCircle 
} from 'react-icons/md';

interface PhoneNumber {
  id: string;
  phoneNumber: string;
  friendlyName: string;
  projectId: string | null;
  projectName?: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
    fax: boolean;
  };
  status: "active" | "inactive" | "suspended";
  monthlyFee: number;
  currency: string;
  region: string;
  countryCode: string;
  voiceUrl?: string;
  smsUrl?: string;
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
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [showAuthToken, setShowAuthToken] = useState(false);
  const [showAccountSid, setShowAccountSid] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState({
    accountSid: "",
    authToken: "",
    phoneNumber: ""
  });
  const [newNumber, setNewNumber] = useState({
    phoneNumber: "",
    friendlyName: "",
    projectId: "none", // Default to "none" which converts to null
    monthlyFee: "",
    voiceEnabled: true,
    smsEnabled: false,
    mmsEnabled: false,
    faxEnabled: false,
    metadata: {
      city: "",
      state: "",
      country: ""
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
        monthlyFee: data.monthlyFee || "0.00", // Keep as string for decimal type
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
        projectId: "none", // Reset to "none" which converts to null
        monthlyFee: "",
        voiceEnabled: true,
        smsEnabled: false,
        mmsEnabled: false,
        faxEnabled: false,
        metadata: {
          city: "",
          state: "",
          country: ""
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

  // Update phone number assignment
  const updateAssignmentMutation = useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string | null }) => {
      const requestProjectId = projectId === "none" ? null : projectId;
      const response = await apiRequest("PATCH", `/api/phone-numbers/${id}`, { projectId: requestProjectId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/phone-numbers"] });
      toast({
        title: "Assignment updated",
        description: "Phone number assignment has been updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error updating assignment",
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

  const formatPhoneNumber = (number: string) => {
    // Clean the number of any non-digits except the leading +
    const cleaned = number.replace(/[^\d+]/g, '');
    
    // Format US/Canada numbers (+1)
    if (cleaned.startsWith("+1")) {
      const digits = cleaned.slice(2); // Remove +1
      if (digits.length === 10) {
        return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
      }
      return cleaned; // Return as-is if not 10 digits
    }
    
    // Format Swiss numbers (+41)
    if (cleaned.startsWith("+41")) {
      const digits = cleaned.slice(3); // Remove +41
      if (digits.length === 9) {
        // Format: +41 xx xxx xx xx
        return `+41 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7)}`;
      }
      return cleaned;
    }
    
    // Format UK numbers (+44)
    if (cleaned.startsWith("+44")) {
      const digits = cleaned.slice(3); // Remove +44
      if (digits.length === 10) {
        return `+44 ${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
      }
      return cleaned;
    }
    
    // Format German numbers (+49)
    if (cleaned.startsWith("+49")) {
      const digits = cleaned.slice(3);
      if (digits.length >= 10) {
        return `+49 ${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
      }
      return cleaned;
    }
    
    // Format French numbers (+33)
    if (cleaned.startsWith("+33")) {
      const digits = cleaned.slice(3);
      if (digits.length === 9) {
        return `+33 ${digits[0]} ${digits.slice(1, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7)}`;
      }
      return cleaned;
    }
    
    // For other numbers, try to format with spaces
    if (cleaned.startsWith("+") && cleaned.length > 10) {
      // Generic formatting: country code + groups of 3-4 digits
      const countryCodeMatch = cleaned.match(/^\+(\d{1,3})/);
      if (countryCodeMatch) {
        const countryCode = countryCodeMatch[1];
        const remaining = cleaned.slice(countryCode.length + 1);
        const formatted = remaining.match(/.{1,4}/g)?.join(' ') || remaining;
        return `+${countryCode} ${formatted}`;
      }
    }
    
    return cleaned;
  };

  // Get country flag component based on phone number prefix
  const getCountryFlag = (phoneNumber: string) => {
    const cleaned = phoneNumber.replace(/[^\d+]/g, '');
    
    if (cleaned.startsWith("+1")) {
      return <span title="USA/Canada">🇺🇸</span>;
    } else if (cleaned.startsWith("+41")) {
      return <span title="Switzerland">🇨🇭</span>;
    } else if (cleaned.startsWith("+44")) {
      return <span title="United Kingdom">🇬🇧</span>;
    } else if (cleaned.startsWith("+49")) {
      return <span title="Germany">🇩🇪</span>;
    } else if (cleaned.startsWith("+33")) {
      return <span title="France">🇫🇷</span>;
    } else if (cleaned.startsWith("+39")) {
      return <span title="Italy">🇮🇹</span>;
    } else if (cleaned.startsWith("+34")) {
      return <span title="Spain">🇪🇸</span>;
    } else if (cleaned.startsWith("+31")) {
      return <span title="Netherlands">🇳🇱</span>;
    } else if (cleaned.startsWith("+32")) {
      return <span title="Belgium">🇧🇪</span>;
    } else if (cleaned.startsWith("+43")) {
      return <span title="Austria">🇦🇹</span>;
    } else if (cleaned.startsWith("+46")) {
      return <span title="Sweden">🇸🇪</span>;
    } else if (cleaned.startsWith("+47")) {
      return <span title="Norway">🇳🇴</span>;
    } else if (cleaned.startsWith("+45")) {
      return <span title="Denmark">🇩🇰</span>;
    } else if (cleaned.startsWith("+358")) {
      return <span title="Finland">🇫🇮</span>;
    } else if (cleaned.startsWith("+81")) {
      return <span title="Japan">🇯🇵</span>;
    } else if (cleaned.startsWith("+86")) {
      return <span title="China">🇨🇳</span>;
    } else if (cleaned.startsWith("+91")) {
      return <span title="India">🇮🇳</span>;
    } else if (cleaned.startsWith("+61")) {
      return <span title="Australia">🇦🇺</span>;
    } else if (cleaned.startsWith("+64")) {
      return <span title="New Zealand">🇳🇿</span>;
    } else if (cleaned.startsWith("+27")) {
      return <span title="South Africa">🇿🇦</span>;
    } else if (cleaned.startsWith("+52")) {
      return <span title="Mexico">🇲🇽</span>;
    } else if (cleaned.startsWith("+55")) {
      return <span title="Brazil">🇧🇷</span>;
    } else if (cleaned.startsWith("+54")) {
      return <span title="Argentina">🇦🇷</span>;
    } else {
      return <Globe className="h-4 w-4 text-muted-foreground" />;
    }
  };
  
  // Get country name based on phone number prefix
  const getCountryName = (phoneNumber: string) => {
    const cleaned = phoneNumber.replace(/[^\d+]/g, '');
    
    if (cleaned.startsWith("+1")) return "USA/Canada";
    if (cleaned.startsWith("+41")) return "Switzerland";
    if (cleaned.startsWith("+44")) return "United Kingdom";
    if (cleaned.startsWith("+49")) return "Germany";
    if (cleaned.startsWith("+33")) return "France";
    if (cleaned.startsWith("+39")) return "Italy";
    if (cleaned.startsWith("+34")) return "Spain";
    if (cleaned.startsWith("+31")) return "Netherlands";
    if (cleaned.startsWith("+32")) return "Belgium";
    if (cleaned.startsWith("+43")) return "Austria";
    if (cleaned.startsWith("+46")) return "Sweden";
    if (cleaned.startsWith("+47")) return "Norway";
    if (cleaned.startsWith("+45")) return "Denmark";
    if (cleaned.startsWith("+358")) return "Finland";
    if (cleaned.startsWith("+81")) return "Japan";
    if (cleaned.startsWith("+86")) return "China";
    if (cleaned.startsWith("+91")) return "India";
    if (cleaned.startsWith("+61")) return "Australia";
    if (cleaned.startsWith("+64")) return "New Zealand";
    if (cleaned.startsWith("+27")) return "South Africa";
    if (cleaned.startsWith("+52")) return "Mexico";
    if (cleaned.startsWith("+55")) return "Brazil";
    if (cleaned.startsWith("+54")) return "Argentina";
    
    return "Unknown";
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

  // Calculate stats
  const stats = {
    total: phoneNumbers.length,
    active: phoneNumbers.filter(n => n.status === "active").length,
    assigned: phoneNumbers.filter(n => n.projectId).length,
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
            Manage your Twilio phone numbers and project assignments
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-phone-number">
              <Plus className="h-4 w-4 mr-2" />
              Add Phone Number
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Phone Number</DialogTitle>
              <DialogDescription>
                Add a new Twilio phone number to your account
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
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
              <div className="space-y-2">
                <Label htmlFor="project">Assign to Project (Optional)</Label>
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
                <Label>Capabilities</Label>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="voice"
                      checked={newNumber.voiceEnabled}
                      onChange={(e) => setNewNumber({ ...newNumber, voiceEnabled: e.target.checked })}
                      className="rounded border-gray-300"
                      data-testid="checkbox-voice"
                    />
                    <Label htmlFor="voice" className="font-normal">Voice</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="sms"
                      checked={newNumber.smsEnabled}
                      onChange={(e) => setNewNumber({ ...newNumber, smsEnabled: e.target.checked })}
                      className="rounded border-gray-300"
                      data-testid="checkbox-sms"
                    />
                    <Label htmlFor="sms" className="font-normal">SMS</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="mms"
                      checked={newNumber.mmsEnabled}
                      onChange={(e) => setNewNumber({ ...newNumber, mmsEnabled: e.target.checked })}
                      className="rounded border-gray-300"
                      data-testid="checkbox-mms"
                    />
                    <Label htmlFor="mms" className="font-normal">MMS</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="fax"
                      checked={newNumber.faxEnabled}
                      onChange={(e) => setNewNumber({ ...newNumber, faxEnabled: e.target.checked })}
                      className="rounded border-gray-300"
                      data-testid="checkbox-fax"
                    />
                    <Label htmlFor="fax" className="font-normal">Fax</Label>
                  </div>
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
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    placeholder="San Francisco"
                    value={newNumber.metadata.city}
                    onChange={(e) => setNewNumber({ ...newNumber, metadata: { ...newNumber.metadata, city: e.target.value } })}
                    data-testid="input-city"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    placeholder="CA"
                    value={newNumber.metadata.state}
                    onChange={(e) => setNewNumber({ ...newNumber, metadata: { ...newNumber.metadata, state: e.target.value } })}
                    data-testid="input-state"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    placeholder="United States"
                    value={newNumber.metadata.country}
                    onChange={(e) => setNewNumber({ ...newNumber, metadata: { ...newNumber.metadata, country: e.target.value } })}
                    data-testid="input-country"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => addNumberMutation.mutate(newNumber)}
                disabled={!newNumber.phoneNumber || addNumberMutation.isPending}
                data-testid="button-confirm-add"
              >
                Add Number
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Twilio Configuration Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-orange-500" />
            <div>
              <CardTitle>Twilio Configuration</CardTitle>
              <CardDescription>Manage your Twilio account settings and webhooks</CardDescription>
            </div>
          </div>
          <Badge 
            className={twilioConfig?.configured ? "bg-orange-500/10 text-orange-500" : "bg-muted text-muted-foreground"}
            data-testid="badge-twilio-status"
          >
            {isLoadingConfig ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Checking...
              </>
            ) : twilioConfig?.configured ? (
              <>
                <CheckCircle className="h-3 w-3 mr-1" />
                Configured
              </>
            ) : (
              <>
                <XCircle className="h-3 w-3 mr-1" />
                Not Configured
              </>
            )}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Configuration Status */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Account SID</Label>
              <div className="flex items-center gap-2">
                {twilioConfig?.hasAccountSid ? (
                  <Badge variant="secondary" className="font-mono text-xs">
                    <Shield className="h-3 w-3 mr-1" />
                    Configured
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">Not Set</Badge>
                )}
              </div>
            </div>
            
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Auth Token</Label>
              <div className="flex items-center gap-2">
                {twilioConfig?.hasAuthToken ? (
                  <Badge variant="secondary" className="font-mono text-xs">
                    <Shield className="h-3 w-3 mr-1" />
                    Configured
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">Not Set</Badge>
                )}
              </div>
            </div>
            
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Phone Number</Label>
              <div className="flex items-center gap-2">
                {twilioConfig?.fullPhoneNumber ? (
                  <Badge variant="secondary" className="font-mono text-xs">
                    <Phone className="h-3 w-3 mr-1" />
                    {twilioConfig.phoneNumber}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">Not Set</Badge>
                )}
              </div>
            </div>
          </div>

          {/* Webhook URLs */}
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
                
                {twilioConfig.webhookUrls.stream && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Stream URL:</span>
                    <div className="flex items-center gap-1">
                      <code className="bg-muted px-2 py-1 rounded" data-testid="text-stream-url">
                        {twilioConfig.webhookUrls.stream}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => copyToClipboard(twilioConfig.webhookUrls.stream, "Stream URL")}
                        data-testid="button-copy-stream-url"
                      >
                        {copiedWebhook === "Stream URL" ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              
              <p className="text-xs text-muted-foreground mt-2">
                These URLs are automatically configured when you save your Twilio credentials.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => testConnectionMutation.mutate()}
              disabled={testConnectionMutation.isPending || !twilioConfig?.configured}
              data-testid="button-test-connection"
            >
              {testConnectionMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4 mr-2" />
              )}
              Test Connection
            </Button>
            
            <Button
              size="sm"
              onClick={() => setIsConfigDialogOpen(true)}
              data-testid="button-configure-twilio"
            >
              <Settings2 className="h-4 w-4 mr-2" />
              Configure Twilio
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Numbers</CardTitle>
            <Smartphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Numbers</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-active">{stats.active}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assigned to Projects</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-assigned">{stats.assigned}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-cost">
              ${stats.monthlyCost.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Phone Numbers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Phone Numbers</CardTitle>
          <CardDescription>
            All your Twilio phone numbers and their current assignments
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Loading phone numbers...</p>
            </div>
          ) : phoneNumbers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Phone className="h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">No phone numbers found</p>
              <Button 
                variant="outline" 
                onClick={() => setIsAddDialogOpen(true)}
                data-testid="button-add-first-number"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Number
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Friendly Name</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Capabilities</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Monthly Fee</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {phoneNumbers.map((number) => (
                  <TableRow key={number.id} data-testid={`row-phone-${number.id}`}>
                    <TableCell>
                      <Button
                        variant="ghost"
                        className="font-mono hover:bg-accent/50 justify-start p-2"
                        onClick={() => {
                          setSelectedNumber(number);
                          setIsDetailDialogOpen(true);
                        }}
                        data-testid={`button-phone-${number.id}`}
                      >
                        <div className="flex items-center gap-2">
                          {getCountryFlag(number.phoneNumber)}
                          <span className="text-sm">{formatPhoneNumber(number.phoneNumber)}</span>
                        </div>
                      </Button>
                    </TableCell>
                    <TableCell>{number.friendlyName || "-"}</TableCell>
                    <TableCell>
                      {number.projectId ? (
                        <Select
                          value={number.projectId}
                          onValueChange={(value) => 
                            updateAssignmentMutation.mutate({ 
                              id: number.id, 
                              projectId: value || null 
                            })
                          }
                        >
                          <SelectTrigger className="w-[180px]" data-testid={`select-project-${number.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Unassigned</SelectItem>
                            {projects.map((project) => (
                              <SelectItem key={project.id} value={project.id}>
                                {project.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="secondary">Unassigned</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(number.status)}
                        <span className="capitalize">{number.status}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {number.capabilities?.voice && (
                          <Badge variant="outline" className="text-xs">
                            <Phone className="h-3 w-3 mr-1" />
                            Voice
                          </Badge>
                        )}
                        {number.capabilities?.sms && (
                          <Badge variant="outline" className="text-xs">SMS</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getCountryFlag(number.phoneNumber)}
                        <span className="text-sm">{getCountryName(number.phoneNumber)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      ${typeof number.monthlyFee === 'number' 
                        ? number.monthlyFee.toFixed(2) 
                        : (parseFloat(number.monthlyFee || '0') || 0).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {number.lastUsed ? (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {new Date(number.lastUsed).toLocaleDateString()}
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteNumberMutation.mutate(number.id)}
                        disabled={deleteNumberMutation.isPending}
                        data-testid={`button-delete-${number.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Usage Details */}
      {selectedNumber && (
        <Card>
          <CardHeader>
            <CardTitle>Usage Details: {formatPhoneNumber(selectedNumber.phoneNumber)}</CardTitle>
            <CardDescription>
              Detailed usage statistics and configuration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>Total Calls</Label>
                <div className="flex items-center gap-2">
                  <PhoneOutgoing className="h-4 w-4" />
                  <span className="text-xl font-semibold">{selectedNumber.totalCalls || 0}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Total Minutes</Label>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  <span className="text-xl font-semibold">{selectedNumber.totalMinutes || 0}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Created</Label>
                <p className="text-sm text-muted-foreground">
                  {new Date(selectedNumber.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Voice URL</Label>
                <p className="text-sm text-muted-foreground font-mono">
                  {selectedNumber.voiceUrl || "Not configured"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Twilio Configuration Dialog */}
      <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Configure Twilio</DialogTitle>
            <DialogDescription>
              Enter your Twilio credentials to enable phone call functionality. These credentials will be securely stored and used to configure webhooks automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="account-sid">
                Account SID
                <span className="text-xs text-muted-foreground ml-2">
                  Found in your Twilio Console
                </span>
              </Label>
              <div className="relative">
                <Input
                  id="account-sid"
                  type={showAccountSid ? "text" : "password"}
                  placeholder="AC..."
                  value={configForm.accountSid}
                  onChange={(e) => setConfigForm({ ...configForm, accountSid: e.target.value })}
                  className="pr-10 font-mono"
                  data-testid="input-account-sid"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowAccountSid(!showAccountSid)}
                  data-testid="button-toggle-account-sid"
                >
                  {showAccountSid ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="auth-token">
                Auth Token
                <span className="text-xs text-muted-foreground ml-2">
                  Keep this secret and secure
                </span>
              </Label>
              <div className="relative">
                <Input
                  id="auth-token"
                  type={showAuthToken ? "text" : "password"}
                  placeholder="••••••••••••••••"
                  value={configForm.authToken}
                  onChange={(e) => setConfigForm({ ...configForm, authToken: e.target.value })}
                  className="pr-10 font-mono"
                  data-testid="input-auth-token"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowAuthToken(!showAuthToken)}
                  data-testid="button-toggle-auth-token"
                >
                  {showAuthToken ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone-number">
                Twilio Phone Number
                <span className="text-xs text-muted-foreground ml-2">
                  The phone number to use for calls
                </span>
              </Label>
              <Input
                id="phone-number"
                type="tel"
                placeholder="+1234567890"
                value={configForm.phoneNumber}
                onChange={(e) => setConfigForm({ ...configForm, phoneNumber: e.target.value })}
                className="font-mono"
                data-testid="input-phone-number-config"
              />
              <p className="text-xs text-muted-foreground">
                Include the country code (e.g., +1 for US)
              </p>
            </div>

            <div className="rounded-lg border bg-muted/50 p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                <span className="text-sm font-medium">Important</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Saving these credentials will automatically configure your Twilio phone number with the correct webhook URLs for handling calls. Make sure the phone number is active in your Twilio account.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsConfigDialogOpen(false);
                setConfigForm({ accountSid: "", authToken: "", phoneNumber: "" });
                setShowAccountSid(false);
                setShowAuthToken(false);
              }}
              data-testid="button-cancel-config"
            >
              Cancel
            </Button>
            <Button
              onClick={() => updateConfigMutation.mutate(configForm)}
              disabled={
                updateConfigMutation.isPending ||
                !configForm.accountSid ||
                !configForm.authToken ||
                !configForm.phoneNumber
              }
              data-testid="button-save-config"
            >
              {updateConfigMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Configuring...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Save & Configure
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phone Number Detail Modal */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Phone className="h-5 w-5 text-primary" />
              Phone Number Details
            </DialogTitle>
            <DialogDescription>
              Complete information and management options for this phone number
            </DialogDescription>
          </DialogHeader>
          
          {selectedNumber && (
            <div className="space-y-6">
              {/* Phone Number Header */}
              <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="text-3xl">{getCountryFlag(selectedNumber.phoneNumber)}</div>
                <div className="flex-1">
                  <div className="font-mono text-xl font-semibold">
                    {formatPhoneNumber(selectedNumber.phoneNumber)}
                  </div>
                  {selectedNumber.friendlyName && (
                    <div className="text-sm text-muted-foreground mt-1">
                      {selectedNumber.friendlyName}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(selectedNumber.status)}
                  <Badge 
                    variant={selectedNumber.status === 'active' ? 'default' : 'secondary'}
                    className="capitalize"
                  >
                    {selectedNumber.status}
                  </Badge>
                </div>
              </div>

              {/* Basic Information */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Region</Label>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{getCountryName(selectedNumber.phoneNumber)}</span>
                    {selectedNumber.region && (
                      <span className="text-sm text-muted-foreground">
                        ({selectedNumber.region})
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Monthly Fee</Label>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">
                      ${typeof selectedNumber.monthlyFee === 'number' 
                        ? selectedNumber.monthlyFee.toFixed(2) 
                        : (parseFloat(selectedNumber.monthlyFee || '0') || 0).toFixed(2)} {selectedNumber.currency || 'USD'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Capabilities */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Capabilities</Label>
                <div className="flex flex-wrap gap-2">
                  {selectedNumber.capabilities?.voice && (
                    <Badge variant="outline">
                      <Phone className="h-3 w-3 mr-1" />
                      Voice Calls
                    </Badge>
                  )}
                  {selectedNumber.capabilities?.sms && (
                    <Badge variant="outline">
                      <Smartphone className="h-3 w-3 mr-1" />
                      SMS
                    </Badge>
                  )}
                  {selectedNumber.capabilities?.mms && (
                    <Badge variant="outline">MMS</Badge>
                  )}
                  {selectedNumber.capabilities?.fax && (
                    <Badge variant="outline">Fax</Badge>
                  )}
                </div>
              </div>

              {/* Project Assignment */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Project Assignment</Label>
                <div className="flex items-center gap-2">
                  <FolderKanban className="h-4 w-4 text-muted-foreground" />
                  {selectedNumber.projectId ? (
                    <Select
                      value={selectedNumber.projectId}
                      onValueChange={(value) => {
                        updateAssignmentMutation.mutate({ 
                          id: selectedNumber.id, 
                          projectId: value === "none" ? null : value 
                        });
                        setSelectedNumber({
                          ...selectedNumber,
                          projectId: value === "none" ? null : value
                        });
                      }}
                    >
                      <SelectTrigger className="w-[250px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <>
                      <Badge variant="secondary">Not assigned to any project</Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Auto-select first project if available
                          if (projects.length > 0) {
                            updateAssignmentMutation.mutate({
                              id: selectedNumber.id,
                              projectId: projects[0].id
                            });
                            setSelectedNumber({
                              ...selectedNumber,
                              projectId: projects[0].id
                            });
                          }
                        }}
                        disabled={projects.length === 0}
                      >
                        Assign to Project
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Usage Statistics */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Usage Statistics</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <PhoneOutgoing className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-2xl font-bold">{selectedNumber.totalCalls || 0}</div>
                          <p className="text-xs text-muted-foreground">Total Calls</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-2xl font-bold">{selectedNumber.totalMinutes || 0}</div>
                          <p className="text-xs text-muted-foreground">Total Minutes</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-semibold">
                            {selectedNumber.lastUsed 
                              ? new Date(selectedNumber.lastUsed).toLocaleDateString()
                              : "Never"}
                          </div>
                          <p className="text-xs text-muted-foreground">Last Used</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-semibold">
                            {selectedNumber.createdAt 
                              ? new Date(selectedNumber.createdAt).toLocaleDateString()
                              : "Unknown"}
                          </div>
                          <p className="text-xs text-muted-foreground">Created</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Webhook URLs */}
              {(selectedNumber.voiceUrl || selectedNumber.smsUrl) && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Configured Webhooks</Label>
                  <div className="space-y-2 text-xs">
                    {selectedNumber.voiceUrl && (
                      <div className="flex items-center justify-between gap-2 p-2 bg-muted/50 rounded">
                        <div className="flex items-center gap-2">
                          <Phone className="h-3 w-3" />
                          <span className="text-muted-foreground">Voice URL:</span>
                        </div>
                        <code className="text-xs">{selectedNumber.voiceUrl}</code>
                      </div>
                    )}
                    {selectedNumber.smsUrl && (
                      <div className="flex items-center justify-between gap-2 p-2 bg-muted/50 rounded">
                        <div className="flex items-center gap-2">
                          <Smartphone className="h-3 w-3" />
                          <span className="text-muted-foreground">SMS URL:</span>
                        </div>
                        <code className="text-xs">{selectedNumber.smsUrl}</code>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Additional Information */}
              <div className="border-t pt-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Number ID:</span>
                    <span className="ml-2 font-mono text-xs">{selectedNumber.id}</span>
                  </div>
                  {selectedNumber.countryCode && (
                    <div>
                      <span className="text-muted-foreground">Country Code:</span>
                      <span className="ml-2">{selectedNumber.countryCode}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
              Close
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedNumber) {
                  deleteNumberMutation.mutate(selectedNumber.id);
                  setIsDetailDialogOpen(false);
                }
              }}
              disabled={deleteNumberMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Number
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}