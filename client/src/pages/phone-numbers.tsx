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
  FolderKanban
} from "lucide-react";
import type { Project } from "@shared/schema";

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
  const [selectedNumber, setSelectedNumber] = useState<PhoneNumber | null>(null);
  const [newNumber, setNewNumber] = useState({
    phoneNumber: "",
    friendlyName: "",
    projectId: ""
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

  // Add phone number mutation
  const addNumberMutation = useMutation({
    mutationFn: async (data: typeof newNumber) => {
      const response = await apiRequest("POST", "/api/phone-numbers", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/phone-numbers"] });
      setIsAddDialogOpen(false);
      setNewNumber({ phoneNumber: "", friendlyName: "", projectId: "" });
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
      const response = await apiRequest("PATCH", `/api/phone-numbers/${id}`, { projectId });
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
    // Format US numbers
    if (number.startsWith("+1") && number.length === 12) {
      return `${number.slice(0, 2)} (${number.slice(2, 5)}) ${number.slice(5, 8)}-${number.slice(8)}`;
    }
    return number;
  };

  // Calculate stats
  const stats = {
    total: phoneNumbers.length,
    active: phoneNumbers.filter(n => n.status === "active").length,
    assigned: phoneNumbers.filter(n => n.projectId).length,
    monthlyCost: phoneNumbers.reduce((sum, n) => sum + (n.monthlyFee || 0), 0)
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
                    <SelectItem value="">None</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                    <TableCell className="font-mono">
                      {formatPhoneNumber(number.phoneNumber)}
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
                            <SelectItem value="">Unassigned</SelectItem>
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
                      <div className="flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {number.region || "Unknown"}
                      </div>
                    </TableCell>
                    <TableCell>
                      ${number.monthlyFee?.toFixed(2) || "0.00"}
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
    </div>
  );
}