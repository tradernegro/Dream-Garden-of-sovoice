import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, Search, Filter } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { Call } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";

export default function CallHistory() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: calls, isLoading } = useQuery<Call[]>({
    queryKey: ["/api/calls"],
  });

  const filteredCalls = calls?.filter(call =>
    call.phoneNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    call.status.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500/10 text-green-700 dark:text-green-400";
      case "in-progress":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      case "failed":
      case "no-answer":
        return "bg-red-500/10 text-red-700 dark:text-red-400";
      default:
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
    }
  };

  const getDirectionBadge = (direction: string) => {
    return direction === "inbound" 
      ? "Inbound"
      : "Outbound";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-call-history-title">Call History</h1>
          <p className="text-muted-foreground mt-1">
            View and manage all your call records
          </p>
        </div>
        <Button data-testid="button-new-call">
          <Phone className="h-4 w-4 mr-2" />
          New Call
        </Button>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by phone number or status..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-calls"
              />
            </div>
            <Button variant="outline" data-testid="button-filter">
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Calls Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Calls ({filteredCalls.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center justify-between py-3">
                  <Skeleton className="h-10 w-40" />
                  <Skeleton className="h-6 w-24" />
                </div>
              ))}
            </div>
          ) : filteredCalls.length === 0 ? (
            <div className="text-center py-12">
              <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
              <h3 className="text-lg font-medium mb-1">
                {searchQuery ? "No calls found" : "No calls yet"}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {searchQuery 
                  ? "Try adjusting your search query"
                  : "Start making calls with your AI assistant"
                }
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-sm text-muted-foreground">
                    <th className="text-left py-3 px-2 font-medium">Phone Number</th>
                    <th className="text-left py-3 px-2 font-medium">Direction</th>
                    <th className="text-left py-3 px-2 font-medium">Status</th>
                    <th className="text-left py-3 px-2 font-medium">Duration</th>
                    <th className="text-left py-3 px-2 font-medium">Date & Time</th>
                    <th className="text-left py-3 px-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCalls.map((call) => (
                    <tr 
                      key={call.id} 
                      className="border-b last:border-0 hover-elevate"
                      data-testid={`call-row-${call.id}`}
                    >
                      <td className="py-3 px-2">
                        <span className="font-mono text-sm font-medium">{call.phoneNumber}</span>
                      </td>
                      <td className="py-3 px-2">
                        <Badge variant="outline" className="capitalize">
                          {getDirectionBadge(call.direction)}
                        </Badge>
                      </td>
                      <td className="py-3 px-2">
                        <Badge variant="secondary" className={getStatusColor(call.status)}>
                          {call.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-sm text-muted-foreground">
                        {call.duration 
                          ? `${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, '0')}`
                          : "—"
                        }
                      </td>
                      <td className="py-3 px-2 text-sm text-muted-foreground">
                        {new Date(call.createdAt).toLocaleDateString()} {new Date(call.createdAt).toLocaleTimeString()}
                      </td>
                      <td className="py-3 px-2">
                        <Link href={`/calls/${call.id}`}>
                          <Button variant="ghost" size="sm" data-testid={`button-view-call-${call.id}`}>
                            View
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
