import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar as CalendarIcon, Clock, Mail, Phone, Building, Plus, Edit, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, isSameMonth, isSameDay, isToday, addDays } from "date-fns";
import { de } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import type { Appointment } from "@shared/schema";

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const { toast } = useToast();

  // Fetch appointments for current month
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  
  const { data: appointments = [], isLoading } = useQuery<Appointment[]>({
    queryKey: ['/api/appointments', monthStart.toISOString(), monthEnd.toISOString()],
    queryFn: async () => {
      const response = await fetch(`/api/appointments?startDate=${monthStart.toISOString()}&endDate=${monthEnd.toISOString()}`);
      if (!response.ok) throw new Error('Failed to fetch appointments');
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Get appointments for selected date
  const selectedDateAppointments = selectedDate
    ? appointments.filter(apt => isSameDay(new Date(apt.startTime), selectedDate))
    : [];

  // Create appointment mutation
  const createAppointmentMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/appointments'] });
      setIsDialogOpen(false);
      setEditingAppointment(null);
      toast({
        title: "Termin erstellt",
        description: "Der Termin wurde erfolgreich erstellt und eine Bestätigung wurde gesendet.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Fehler",
        description: error.message || "Der Termin konnte nicht erstellt werden.",
        variant: "destructive",
      });
    },
  });

  // Update appointment mutation
  const updateAppointmentMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      return apiRequest(`/api/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/appointments'] });
      setIsDialogOpen(false);
      setEditingAppointment(null);
      toast({
        title: "Termin aktualisiert",
        description: "Der Termin wurde erfolgreich aktualisiert.",
      });
    },
  });

  // Delete appointment mutation
  const deleteAppointmentMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/appointments/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/appointments'] });
      toast({
        title: "Termin gelöscht",
        description: "Der Termin wurde erfolgreich gelöscht.",
      });
    },
  });

  // Generate calendar days
  const generateCalendarDays = () => {
    const start = startOfWeek(monthStart, { locale: de });
    const end = endOfWeek(monthEnd, { locale: de });
    const days = [];
    let day = start;

    while (day <= end) {
      days.push(day);
      day = addDays(day, 1);
    }

    return days;
  };

  const calendarDays = generateCalendarDays();

  // Handle appointment form submit
  const handleAppointmentSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const appointmentData = {
      customerName: formData.get('customerName'),
      customerEmail: formData.get('customerEmail'),
      customerPhone: formData.get('customerPhone') || undefined,
      customerCompany: formData.get('customerCompany') || undefined,
      title: formData.get('title'),
      description: formData.get('description') || undefined,
      location: formData.get('location') || undefined,
      startTime: new Date(formData.get('date') + 'T' + formData.get('startTime')),
      endTime: new Date(formData.get('date') + 'T' + formData.get('endTime')),
      type: formData.get('type'),
    };

    if (editingAppointment) {
      updateAppointmentMutation.mutate({ id: editingAppointment.id, ...appointmentData });
    } else {
      createAppointmentMutation.mutate(appointmentData);
    }
  };

  // Get appointments count for a specific day
  const getAppointmentsCountForDay = (day: Date) => {
    return appointments.filter(apt => isSameDay(new Date(apt.startTime), day)).length;
  };

  // Navigate months
  const goToPreviousMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const goToNextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(new Date());
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-title">Terminkalender</h1>
          <p className="text-muted-foreground">Verwalten Sie Ihre Termine und Meetings</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-appointment" onClick={() => setEditingAppointment(null)}>
              <Plus className="h-4 w-4 mr-2" />
              Neuer Termin
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingAppointment ? 'Termin bearbeiten' : 'Neuen Termin erstellen'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAppointmentSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="customerName">Name *</Label>
                    <Input
                      id="customerName"
                      name="customerName"
                      defaultValue={editingAppointment?.customerName}
                      required
                      data-testid="input-customer-name"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="customerEmail">E-Mail *</Label>
                    <Input
                      id="customerEmail"
                      name="customerEmail"
                      type="email"
                      defaultValue={editingAppointment?.customerEmail}
                      required
                      data-testid="input-customer-email"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="customerPhone">Telefon</Label>
                    <Input
                      id="customerPhone"
                      name="customerPhone"
                      defaultValue={editingAppointment?.customerPhone || ''}
                      data-testid="input-customer-phone"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="customerCompany">Firma</Label>
                    <Input
                      id="customerCompany"
                      name="customerCompany"
                      defaultValue={editingAppointment?.customerCompany || ''}
                      data-testid="input-customer-company"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="title">Titel *</Label>
                  <Input
                    id="title"
                    name="title"
                    defaultValue={editingAppointment?.title}
                    required
                    data-testid="input-title"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Beschreibung</Label>
                  <Textarea
                    id="description"
                    name="description"
                    defaultValue={editingAppointment?.description || ''}
                    data-testid="input-description"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="date">Datum *</Label>
                    <Input
                      id="date"
                      name="date"
                      type="date"
                      defaultValue={editingAppointment ? format(new Date(editingAppointment.startTime), 'yyyy-MM-dd') : (selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'))}
                      required
                      data-testid="input-date"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="startTime">Start *</Label>
                    <Input
                      id="startTime"
                      name="startTime"
                      type="time"
                      defaultValue={editingAppointment ? format(new Date(editingAppointment.startTime), 'HH:mm') : '10:00'}
                      required
                      data-testid="input-start-time"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="endTime">Ende *</Label>
                    <Input
                      id="endTime"
                      name="endTime"
                      type="time"
                      defaultValue={editingAppointment ? format(new Date(editingAppointment.endTime), 'HH:mm') : '11:00'}
                      required
                      data-testid="input-end-time"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="type">Typ</Label>
                    <Select name="type" defaultValue={editingAppointment?.type || 'meeting'}>
                      <SelectTrigger id="type" data-testid="select-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="meeting">Meeting</SelectItem>
                        <SelectItem value="call">Anruf</SelectItem>
                        <SelectItem value="demo">Demo</SelectItem>
                        <SelectItem value="consultation">Beratung</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="location">Ort/Medium</Label>
                    <Input
                      id="location"
                      name="location"
                      placeholder="z.B. Telefon, Zoom, Büro"
                      defaultValue={editingAppointment?.location || ''}
                      data-testid="input-location"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" data-testid="button-save-appointment">
                  {editingAppointment ? 'Speichern' : 'Termin erstellen'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-xl">
                {format(currentDate, 'MMMM yyyy', { locale: de })}
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={goToPreviousMonth} data-testid="button-prev-month">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={goToToday} data-testid="button-today">
                  Heute
                </Button>
                <Button variant="outline" size="sm" onClick={goToNextMonth} data-testid="button-next-month">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1">
              {/* Weekday headers */}
              {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((day) => (
                <div key={day} className="text-center text-sm font-medium py-2">
                  {day}
                </div>
              ))}
              
              {/* Calendar days */}
              {calendarDays.map((day, index) => {
                const appointmentCount = getAppointmentsCountForDay(day);
                const isCurrentMonth = isSameMonth(day, currentDate);
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const isCurrentDay = isToday(day);
                
                return (
                  <div
                    key={index}
                    onClick={() => setSelectedDate(day)}
                    className={`
                      p-2 min-h-[80px] border rounded-md cursor-pointer transition-colors
                      ${!isCurrentMonth ? 'text-muted-foreground bg-muted/10' : ''}
                      ${isSelected ? 'bg-primary/10 border-primary' : ''}
                      ${isCurrentDay ? 'bg-accent' : ''}
                      hover:bg-accent/50
                    `}
                    data-testid={`calendar-day-${format(day, 'yyyy-MM-dd')}`}
                  >
                    <div className="font-medium">{format(day, 'd')}</div>
                    {appointmentCount > 0 && (
                      <div className="mt-1">
                        <Badge variant="secondary" className="text-xs">
                          {appointmentCount} {appointmentCount === 1 ? 'Termin' : 'Termine'}
                        </Badge>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Selected Day Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {selectedDate ? format(selectedDate, 'EEEE, d. MMMM yyyy', { locale: de }) : 'Tag auswählen'}
            </CardTitle>
            <CardDescription>
              {selectedDate && selectedDateAppointments.length > 0
                ? `${selectedDateAppointments.length} ${selectedDateAppointments.length === 1 ? 'Termin' : 'Termine'}`
                : 'Keine Termine'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedDate && selectedDateAppointments.length > 0 ? (
              <div className="space-y-3">
                {selectedDateAppointments
                  .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                  .map((appointment) => (
                    <Card key={appointment.id} className="p-3">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-medium" data-testid={`appointment-title-${appointment.id}`}>
                            {appointment.title}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            <Clock className="inline h-3 w-3 mr-1" />
                            {format(new Date(appointment.startTime), 'HH:mm')} - {format(new Date(appointment.endTime), 'HH:mm')}
                          </div>
                          <div className="text-sm mt-2 space-y-1">
                            <div>
                              <Mail className="inline h-3 w-3 mr-1" />
                              {appointment.customerEmail}
                            </div>
                            {appointment.customerPhone && (
                              <div>
                                <Phone className="inline h-3 w-3 mr-1" />
                                {appointment.customerPhone}
                              </div>
                            )}
                            {appointment.customerCompany && (
                              <div>
                                <Building className="inline h-3 w-3 mr-1" />
                                {appointment.customerCompany}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditingAppointment(appointment);
                              setIsDialogOpen(true);
                            }}
                            data-testid={`button-edit-${appointment.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              if (confirm('Möchten Sie diesen Termin wirklich löschen?')) {
                                deleteAppointmentMutation.mutate(appointment.id);
                              }
                            }}
                            data-testid={`button-delete-${appointment.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                {selectedDate ? 'Keine Termine an diesem Tag' : 'Wählen Sie einen Tag aus dem Kalender'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}