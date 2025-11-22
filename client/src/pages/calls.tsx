import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Phone,
  PhoneCall,
  PhoneOff,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneForwarded,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Pause,
  Play,
  Users,
  UserPlus,
  Clock,
  Calendar,
  Settings,
  ChevronDown,
  Search,
  Filter,
  Download,
  Upload,
  MessageSquare,
  Activity,
  AlertCircle,
  CheckCircle,
  XCircle,
  Timer,
  Hash,
  Voicemail,
  Forward,
  ArrowLeftRight,
  PhoneMissed,
  Headphones,
  Star,
  MoreVertical,
  Copy,
  RefreshCw,
  Zap,
  BarChart3,
  TrendingUp,
  TrendingDown
} from "lucide-react";
import type { Call, Agent } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

// Dial pad numbers
const dialPadNumbers = [
  { number: "1", letters: "" },
  { number: "2", letters: "ABC" },
  { number: "3", letters: "DEF" },
  { number: "4", letters: "GHI" },
  { number: "5", letters: "JKL" },
  { number: "6", letters: "MNO" },
  { number: "7", letters: "PQRS" },
  { number: "8", letters: "TUV" },
  { number: "9", letters: "WXYZ" },
  { number: "*", letters: "" },
  { number: "0", letters: "+" },
  { number: "#", letters: "" },
];

export default function CallsManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isCallActive, setIsCallActive] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [showDialPad, setShowDialPad] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferNumber, setTransferNumber] = useState("");
  const [showNewCallDialog, setShowNewCallDialog] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [scheduledNote, setScheduledNote] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDirection, setFilterDirection] = useState("all");
  const [agentStatus, setAgentStatus] = useState("available");
  const [isRecording, setIsRecording] = useState(false);
  const [businessHours, setBusinessHours] = useState({
    enabled: true,
    start: "09:00",
    end: "17:00",
    days: ["Mon", "Tue", "Wed", "Thu", "Fri"]
  });
  const [voicemailEnabled, setVoicemailEnabled] = useState(true);
  const [callForwarding, setCallForwarding] = useState({
    enabled: false,
    number: ""
  });
  const [doNotDisturb, setDoNotDisturb] = useState(false);
  const callIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch data
  const { data: calls = [], isLoading: isLoadingCalls } = useQuery<Call[]>({
    queryKey: ["/api/calls"],
  });

  const { data: agents = [], isLoading: isLoadingAgents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  // Active calls (simulated for now)
  const activeCalls = calls.filter(call => call.status === "in-progress");
  const queuedCalls = calls.filter(call => call.status === "queued");
  
  // Calculate metrics
  const todayCalls = calls.filter(call => {
    const callDate = new Date(call.createdAt);
    const today = new Date();
    return callDate.toDateString() === today.toDateString();
  });

  const completedCalls = todayCalls.filter(call => call.status === "completed");
  const avgDuration = completedCalls.length > 0
    ? Math.round(completedCalls.reduce((sum, call) => sum + (call.duration || 0), 0) / completedCalls.length)
    : 0;

  // Mutations
  const makeCallMutation = useMutation({
    mutationFn: async (data: { phoneNumber: string; agentId?: string }) => {
      const response = await apiRequest("POST", "/api/calls/outbound", data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Anruf gestartet",
        description: `Verbindung wird hergestellt zu ${phoneNumber}`,
      });
      setIsCallActive(true);
      startCallTimer();
      queryClient.invalidateQueries({ queryKey: ["/api/calls"] });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Anruf konnte nicht gestartet werden",
        variant: "destructive",
      });
    },
  });

  const endCallMutation = useMutation({
    mutationFn: async (callId: string) => {
      const response = await apiRequest("POST", `/api/calls/${callId}/end`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Anruf beendet",
        description: `Anrufdauer: ${Math.floor(callDuration / 60)}:${(callDuration % 60).toString().padStart(2, '0')}`,
      });
      setIsCallActive(false);
      stopCallTimer();
      setCallDuration(0);
      setIsMuted(false);
      setIsOnHold(false);
      queryClient.invalidateQueries({ queryKey: ["/api/calls"] });
    },
  });

  const transferCallMutation = useMutation({
    mutationFn: async (data: { callId: string; transferTo: string }) => {
      const response = await apiRequest("POST", `/api/calls/${data.callId}/transfer`, {
        transferTo: data.transferTo
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Anruf weitergeleitet",
        description: `Anruf wurde an ${transferNumber} weitergeleitet`,
      });
      setShowTransferDialog(false);
      setTransferNumber("");
    },
  });

  // Timer for call duration
  const startCallTimer = () => {
    callIntervalRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  };

  const stopCallTimer = () => {
    if (callIntervalRef.current) {
      clearInterval(callIntervalRef.current);
      callIntervalRef.current = null;
    }
  };

  // Dial pad input
  const handleDialPadClick = (digit: string) => {
    setPhoneNumber(prev => prev + digit);
  };

  const handleCall = () => {
    if (!phoneNumber) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie eine Telefonnummer ein",
        variant: "destructive",
      });
      return;
    }
    makeCallMutation.mutate({ 
      phoneNumber, 
      agentId: selectedAgent || undefined 
    });
  };

  const handleEndCall = () => {
    if (activeCalls.length > 0) {
      endCallMutation.mutate(activeCalls[0].id);
    }
  };

  const handleMute = () => {
    setIsMuted(!isMuted);
    toast({
      title: isMuted ? "Mikrofon aktiviert" : "Mikrofon stummgeschaltet",
    });
  };

  const handleHold = () => {
    setIsOnHold(!isOnHold);
    toast({
      title: isOnHold ? "Anruf fortgesetzt" : "Anruf gehalten",
    });
  };

  const handleTransfer = () => {
    if (!transferNumber) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie eine Nummer für die Weiterleitung ein",
        variant: "destructive",
      });
      return;
    }
    if (activeCalls.length > 0) {
      transferCallMutation.mutate({
        callId: activeCalls[0].id,
        transferTo: transferNumber
      });
    }
  };

  const scheduleCallMutation = useMutation({
    mutationFn: async (data: { phoneNumber: string; scheduledFor: string; note?: string }) => {
      const response = await apiRequest("POST", "/api/calls/schedule", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Anruf geplant",
        description: `Anruf wurde für ${scheduledDate} ${scheduledTime} geplant`,
      });
      setShowScheduleDialog(false);
      setScheduledDate("");
      setScheduledTime("");
      setScheduledNote("");
    },
  });

  const handleScheduleCall = () => {
    if (!phoneNumber || !scheduledDate || !scheduledTime) {
      toast({
        title: "Fehler",
        description: "Bitte füllen Sie alle Pflichtfelder aus",
        variant: "destructive",
      });
      return;
    }
    const scheduledFor = `${scheduledDate}T${scheduledTime}:00`;
    scheduleCallMutation.mutate({
      phoneNumber,
      scheduledFor,
      note: scheduledNote
    });
  };

  // Filter calls
  const filteredCalls = calls.filter(call => {
    const matchesSearch = !searchQuery || 
      call.phoneNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || call.status === filterStatus;
    const matchesDirection = filterDirection === "all" || call.direction === filterDirection;
    return matchesSearch && matchesStatus && matchesDirection;
  });

  // Update agent status
  const updateAgentStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      const response = await apiRequest("POST", "/api/agent/status", { status });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Status aktualisiert",
        description: `Ihr Status ist jetzt: ${agentStatus}`,
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500/10 text-green-700 dark:text-green-400";
      case "in-progress":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      case "queued":
        return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
      case "failed":
      case "no-answer":
        return "bg-red-500/10 text-red-700 dark:text-red-400";
      default:
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
    }
  };

  const getAgentStatusColor = (status: string) => {
    switch (status) {
      case "available":
        return "bg-green-500";
      case "busy":
        return "bg-yellow-500";
      case "away":
        return "bg-orange-500";
      case "offline":
        return "bg-gray-500";
      default:
        return "bg-gray-500";
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCallTimer();
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Call Center</h1>
          <p className="text-muted-foreground mt-1">
            Verwalten Sie Inbound- und Outbound-Anrufe
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* New Call Button */}
          <Button
            onClick={() => setShowNewCallDialog(true)}
            className="bg-primary text-primary-foreground"
            data-testid="button-new-call"
          >
            <Phone className="h-4 w-4 mr-2" />
            Neuer Anruf
          </Button>
          
          {/* Agent Status */}
          <Select
            value={agentStatus}
            onValueChange={(value) => {
              setAgentStatus(value);
              updateAgentStatusMutation.mutate(value);
            }}
          >
            <SelectTrigger className="w-[140px]">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${getAgentStatusColor(agentStatus)}`} />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="available">Verfügbar</SelectItem>
              <SelectItem value="busy">Beschäftigt</SelectItem>
              <SelectItem value="away">Abwesend</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={doNotDisturb ? "destructive" : "outline"}
            onClick={() => setDoNotDisturb(!doNotDisturb)}
            data-testid="button-dnd"
          >
            <PhoneOff className="h-4 w-4 mr-2" />
            {doNotDisturb ? "DND aktiv" : "DND"}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="dialer">Wähler</TabsTrigger>
          <TabsTrigger value="active">Aktive Anrufe</TabsTrigger>
          <TabsTrigger value="history">Verlauf</TabsTrigger>
          <TabsTrigger value="settings">Einstellungen</TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6">
          {/* Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Heutige Anrufe
                </CardTitle>
                <Phone className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{todayCalls.length}</div>
                <p className="text-xs text-muted-foreground">
                  {completedCalls.length} abgeschlossen
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Aktive Anrufe
                </CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activeCalls.length}</div>
                <p className="text-xs text-muted-foreground">
                  {queuedCalls.length} in Warteschlange
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Durchschn. Dauer
                </CardTitle>
                <Timer className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Math.floor(avgDuration / 60)}:{(avgDuration % 60).toString().padStart(2, '0')}
                </div>
                <p className="text-xs text-muted-foreground">
                  Minuten pro Anruf
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Erfolgsrate
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {todayCalls.length > 0 
                    ? Math.round((completedCalls.length / todayCalls.length) * 100) 
                    : 0}%
                </div>
                <p className="text-xs text-muted-foreground">
                  Erfolgreich verbunden
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Active Calls Queue */}
          <Card>
            <CardHeader>
              <CardTitle>Anruf-Warteschlange</CardTitle>
              <CardDescription>
                Eingehende Anrufe warten auf Bearbeitung
              </CardDescription>
            </CardHeader>
            <CardContent>
              {queuedCalls.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <PhoneIncoming className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Keine Anrufe in der Warteschlange</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {queuedCalls.slice(0, 5).map((call) => (
                    <div key={call.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <PhoneIncoming className="h-4 w-4 text-blue-500" />
                        <div>
                          <p className="font-medium">{call.phoneNumber}</p>
                          <p className="text-sm text-muted-foreground">
                            Wartezeit: {formatDistanceToNow(new Date(call.createdAt))}
                          </p>
                        </div>
                      </div>
                      <Button size="sm" variant="default">
                        Annehmen
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Letzte Aktivitäten</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredCalls.slice(0, 5).map((call) => (
                  <div key={call.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {call.direction === "inbound" ? (
                        <PhoneIncoming className="h-4 w-4 text-green-500" />
                      ) : (
                        <PhoneOutgoing className="h-4 w-4 text-blue-500" />
                      )}
                      <div>
                        <p className="font-medium">{call.phoneNumber}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(call.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <Badge className={getStatusColor(call.status)}>
                      {call.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Dialer Tab */}
        <TabsContent value="dialer" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Dial Pad */}
            <Card>
              <CardHeader>
                <CardTitle>Telefon-Wähler</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Telefonnummer</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="+49 123 456789"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="font-mono text-lg"
                      data-testid="input-phone-number"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setPhoneNumber("")}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Agent Selection */}
                <div className="space-y-2">
                  <Label>Agent auswählen (optional)</Label>
                  <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                    <SelectTrigger>
                      <SelectValue placeholder="Automatische Zuweisung" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Automatische Zuweisung</SelectItem>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Dial Pad Grid */}
                {showDialPad && (
                  <div className="grid grid-cols-3 gap-2 mt-4">
                    {dialPadNumbers.map((item) => (
                      <Button
                        key={item.number}
                        variant="outline"
                        className="h-14 text-lg font-semibold"
                        onClick={() => handleDialPadClick(item.number)}
                      >
                        <div className="text-center">
                          <div>{item.number}</div>
                          {item.letters && (
                            <div className="text-xs text-muted-foreground">{item.letters}</div>
                          )}
                        </div>
                      </Button>
                    ))}
                  </div>
                )}

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowDialPad(!showDialPad)}
                >
                  <Hash className="h-4 w-4 mr-2" />
                  {showDialPad ? "Wähltastatur ausblenden" : "Wähltastatur anzeigen"}
                </Button>

                {/* Call Actions */}
                <div className="flex gap-2">
                  {!isCallActive ? (
                    <>
                      <Button
                        className="flex-1"
                        onClick={handleCall}
                        disabled={!phoneNumber}
                        data-testid="button-call"
                      >
                        <Phone className="h-4 w-4 mr-2" />
                        Anrufen
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowScheduleDialog(true)}
                        disabled={!phoneNumber}
                      >
                        <Calendar className="h-4 w-4 mr-2" />
                        Planen
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="destructive"
                        className="flex-1"
                        onClick={handleEndCall}
                      >
                        <PhoneOff className="h-4 w-4 mr-2" />
                        Beenden
                      </Button>
                      <Button
                        variant={isMuted ? "secondary" : "outline"}
                        size="icon"
                        onClick={handleMute}
                      >
                        {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant={isOnHold ? "secondary" : "outline"}
                        size="icon"
                        onClick={handleHold}
                      >
                        {isOnHold ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                      </Button>
                    </>
                  )}
                </div>

                {/* Active Call Info */}
                {isCallActive && (
                  <Card className="bg-blue-500/10">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <PhoneCall className="h-5 w-5 text-blue-500" />
                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                          </div>
                          <div>
                            <p className="font-medium">{phoneNumber}</p>
                            <p className="text-sm text-muted-foreground">
                              Dauer: {Math.floor(callDuration / 60)}:{(callDuration % 60).toString().padStart(2, '0')}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowTransferDialog(true)}
                          >
                            <ArrowLeftRight className="h-3 w-3 mr-1" />
                            Transfer
                          </Button>
                          <Button
                            size="sm"
                            variant={isRecording ? "destructive" : "outline"}
                            onClick={() => setIsRecording(!isRecording)}
                          >
                            {isRecording ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>

            {/* Quick Contacts / Speed Dial */}
            <Card>
              <CardHeader>
                <CardTitle>Schnellwahl</CardTitle>
                <CardDescription>
                  Häufig kontaktierte Nummern
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { name: "Support Hotline", number: "+49 800 123456", icon: Headphones },
                    { name: "Verkaufsabteilung", number: "+49 30 987654", icon: TrendingUp },
                    { name: "Technischer Support", number: "+49 40 111222", icon: Settings },
                    { name: "Notfall-Hotline", number: "+49 110", icon: AlertCircle },
                  ].map((contact) => (
                    <div
                      key={contact.number}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                      onClick={() => {
                        setPhoneNumber(contact.number);
                        handleCall();
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <contact.icon className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{contact.name}</p>
                          <p className="text-sm text-muted-foreground font-mono">{contact.number}</p>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost">
                        <Phone className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Active Calls Tab */}
        <TabsContent value="active" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Aktive Anrufe & Konferenzen</CardTitle>
              <CardDescription>
                Verwalten Sie laufende Gespräche und Konferenzschaltungen
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeCalls.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <PhoneOff className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Keine aktiven Anrufe</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeCalls.map((call) => (
                    <Card key={call.id} className="border-l-4 border-l-green-500">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="relative">
                              <PhoneCall className="h-8 w-8 text-green-500" />
                              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                            </div>
                            <div>
                              <p className="font-semibold text-lg">{call.phoneNumber}</p>
                              <p className="text-sm text-muted-foreground">
                                Agent: {call.agentId ? agents.find(a => a.id === call.agentId)?.name : "Nicht zugewiesen"}
                              </p>
                              <div className="flex items-center gap-4 mt-1">
                                <span className="text-sm">
                                  Dauer: {call.duration ? `${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, '0')}` : "00:00"}
                                </span>
                                {call.recording && (
                                  <Badge variant="outline" className="text-xs">
                                    <Volume2 className="h-3 w-3 mr-1" />
                                    Aufzeichnung
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline">
                              <UserPlus className="h-4 w-4 mr-1" />
                              Konferenz
                            </Button>
                            <Button size="sm" variant="outline">
                              <ArrowLeftRight className="h-4 w-4 mr-1" />
                              Transfer
                            </Button>
                            <Button size="sm" variant="outline">
                              <MessageSquare className="h-4 w-4 mr-1" />
                              Flüstern
                            </Button>
                            <Button size="sm" variant="destructive">
                              <PhoneOff className="h-4 w-4 mr-1" />
                              Beenden
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Call Queue */}
          <Card>
            <CardHeader>
              <CardTitle>Anruf-Warteschlange</CardTitle>
              <CardDescription>
                {queuedCalls.length} Anrufe warten auf Bearbeitung
              </CardDescription>
            </CardHeader>
            <CardContent>
              {queuedCalls.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Keine wartenden Anrufe</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {queuedCalls.map((call, index) => (
                    <div key={call.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-medium">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium">{call.phoneNumber}</p>
                          <p className="text-sm text-muted-foreground">
                            Wartezeit: {formatDistanceToNow(new Date(call.createdAt))}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="default">
                          Annehmen
                        </Button>
                        <Button size="sm" variant="outline">
                          Ablehnen
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-6">
          {/* Search and Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Suche nach Telefonnummer..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    data-testid="input-search-history"
                  />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Status</SelectItem>
                    <SelectItem value="completed">Abgeschlossen</SelectItem>
                    <SelectItem value="no-answer">Keine Antwort</SelectItem>
                    <SelectItem value="failed">Fehlgeschlagen</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterDirection} onValueChange={setFilterDirection}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Richtungen</SelectItem>
                    <SelectItem value="inbound">Eingehend</SelectItem>
                    <SelectItem value="outbound">Ausgehend</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Call History Table */}
          <Card>
            <CardHeader>
              <CardTitle>Anrufverlauf</CardTitle>
              <CardDescription>
                {filteredCalls.length} Anrufe gefunden
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingCalls ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : filteredCalls.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Phone className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Keine Anrufe gefunden</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredCalls.map((call) => (
                    <div key={call.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
                          {call.direction === "inbound" ? (
                            <PhoneIncoming className="h-5 w-5 text-green-500" />
                          ) : (
                            <PhoneOutgoing className="h-5 w-5 text-blue-500" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{call.phoneNumber}</p>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span>{new Date(call.createdAt).toLocaleDateString()}</span>
                            <span>{new Date(call.createdAt).toLocaleTimeString()}</span>
                            {call.duration && (
                              <span>
                                {Math.floor(call.duration / 60)}:{(call.duration % 60).toString().padStart(2, '0')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge className={getStatusColor(call.status)}>
                          {call.status}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Phone className="h-4 w-4 mr-2" />
                              Zurückrufen
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <MessageSquare className="h-4 w-4 mr-2" />
                              Transkript anzeigen
                            </DropdownMenuItem>
                            {call.recording && (
                              <DropdownMenuItem>
                                <Volume2 className="h-4 w-4 mr-2" />
                                Aufzeichnung abspielen
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>
                              <Star className="h-4 w-4 mr-2" />
                              Markieren
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive">
                              <XCircle className="h-4 w-4 mr-2" />
                              Löschen
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          {/* Business Hours */}
          <Card>
            <CardHeader>
              <CardTitle>Geschäftszeiten</CardTitle>
              <CardDescription>
                Konfigurieren Sie Ihre Verfügbarkeitszeiten
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="business-hours">Geschäftszeiten aktivieren</Label>
                <Switch
                  id="business-hours"
                  checked={businessHours.enabled}
                  onCheckedChange={(checked) => 
                    setBusinessHours({ ...businessHours, enabled: checked })
                  }
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Startzeit</Label>
                  <Input
                    type="time"
                    value={businessHours.start}
                    onChange={(e) => 
                      setBusinessHours({ ...businessHours, start: e.target.value })
                    }
                    disabled={!businessHours.enabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Endzeit</Label>
                  <Input
                    type="time"
                    value={businessHours.end}
                    onChange={(e) => 
                      setBusinessHours({ ...businessHours, end: e.target.value })
                    }
                    disabled={!businessHours.enabled}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Arbeitstage</Label>
                <div className="flex gap-2">
                  {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((day) => (
                    <Button
                      key={day}
                      variant={businessHours.days.includes(day) ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        const newDays = businessHours.days.includes(day)
                          ? businessHours.days.filter(d => d !== day)
                          : [...businessHours.days, day];
                        setBusinessHours({ ...businessHours, days: newDays });
                      }}
                      disabled={!businessHours.enabled}
                    >
                      {day}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Voicemail Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Anrufbeantworter</CardTitle>
              <CardDescription>
                Konfigurieren Sie Ihre Voicemail-Einstellungen
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="voicemail">Anrufbeantworter aktivieren</Label>
                <Switch
                  id="voicemail"
                  checked={voicemailEnabled}
                  onCheckedChange={setVoicemailEnabled}
                />
              </div>
              
              {voicemailEnabled && (
                <>
                  <div className="space-y-2">
                    <Label>Begrüßungsnachricht</Label>
                    <Textarea
                      placeholder="Guten Tag, Sie haben die Voicemail von... erreicht"
                      className="min-h-[100px]"
                    />
                  </div>
                  <Button variant="outline" className="w-full">
                    <Mic className="h-4 w-4 mr-2" />
                    Nachricht aufnehmen
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Call Forwarding */}
          <Card>
            <CardHeader>
              <CardTitle>Anrufweiterleitung</CardTitle>
              <CardDescription>
                Leiten Sie Anrufe an eine andere Nummer weiter
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="forwarding">Weiterleitung aktivieren</Label>
                <Switch
                  id="forwarding"
                  checked={callForwarding.enabled}
                  onCheckedChange={(checked) => 
                    setCallForwarding({ ...callForwarding, enabled: checked })
                  }
                />
              </div>
              
              {callForwarding.enabled && (
                <div className="space-y-2">
                  <Label>Weiterleitungsnummer</Label>
                  <Input
                    placeholder="+49 123 456789"
                    value={callForwarding.number}
                    onChange={(e) => 
                      setCallForwarding({ ...callForwarding, number: e.target.value })
                    }
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recording Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Aufzeichnungseinstellungen</CardTitle>
              <CardDescription>
                Konfigurieren Sie die Anrufaufzeichnung
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Alle Anrufe aufzeichnen</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatisch alle ein- und ausgehenden Anrufe aufzeichnen
                    </p>
                  </div>
                  <Switch />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Transkription aktivieren</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatische Transkription mit AI
                    </p>
                  </div>
                  <Switch />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Compliance-Modus</Label>
                    <p className="text-sm text-muted-foreground">
                      Ansage vor Aufzeichnungsbeginn
                    </p>
                  </div>
                  <Switch />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Transfer Dialog */}
      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anruf weiterleiten</DialogTitle>
            <DialogDescription>
              Leiten Sie den aktiven Anruf an eine andere Nummer weiter
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Ziel-Telefonnummer</Label>
              <Input
                placeholder="+49 123 456789"
                value={transferNumber}
                onChange={(e) => setTransferNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Transfer-Typ</Label>
              <Select defaultValue="blind">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blind">Blind Transfer</SelectItem>
                  <SelectItem value="attended">Attended Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferDialog(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleTransfer}>
              Weiterleiten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Call Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anruf planen</DialogTitle>
            <DialogDescription>
              Planen Sie einen Anruf für später
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Telefonnummer</Label>
              <Input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+49 123 456789"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Datum</Label>
                <Input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Uhrzeit</Label>
                <Input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notiz (optional)</Label>
              <Textarea
                placeholder="Grund für den Anruf..."
                value={scheduledNote}
                onChange={(e) => setScheduledNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleScheduleCall}>
              Planen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Call Dialog */}
      <Dialog open={showNewCallDialog} onOpenChange={setShowNewCallDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neuer Anruf</DialogTitle>
            <DialogDescription>
              Starten Sie einen ausgehenden Anruf
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Telefonnummer</Label>
              <Input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+49 123 456789"
                data-testid="input-phone-number"
              />
            </div>
            <div className="space-y-2">
              <Label>Agent auswählen (optional)</Label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger data-testid="select-agent">
                  <SelectValue placeholder="Automatische Zuweisung" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automatische Zuweisung</SelectItem>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowNewCallDialog(false)}
              data-testid="button-cancel"
            >
              Abbrechen
            </Button>
            <Button 
              onClick={() => {
                handleOutboundCall();
                setShowNewCallDialog(false);
              }}
              data-testid="button-start-call"
            >
              Anruf starten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}