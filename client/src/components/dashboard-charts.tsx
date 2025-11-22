import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";

interface CallVolumeChartProps {
  data: Array<{
    date: string;
    inbound: number;
    outbound: number;
  }>;
}

export function CallVolumeChart({ data }: CallVolumeChartProps) {
  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle>Call Volume Trend</CardTitle>
        <CardDescription>Inbound vs Outbound calls over time</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="inbound" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.1}/>
              </linearGradient>
              <linearGradient id="outbound" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0.1}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip />
            <Area 
              type="monotone" 
              dataKey="inbound" 
              stroke="hsl(var(--primary))" 
              fillOpacity={1} 
              fill="url(#inbound)" 
            />
            <Area 
              type="monotone" 
              dataKey="outbound" 
              stroke="hsl(var(--secondary))" 
              fillOpacity={1} 
              fill="url(#outbound)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

interface StatusDistributionProps {
  data: Array<{
    name: string;
    value: number;
    color: string;
  }>;
}

export function StatusDistributionChart({ data }: StatusDistributionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Call Outcomes</CardTitle>
        <CardDescription>Distribution of call results</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        <div className="mt-4 space-y-2">
          {data.map((status) => (
            <div key={status.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: status.color }} />
                <span>{status.name}</span>
              </div>
              <span className="font-medium">{status.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface HourlyActivityProps {
  data: Array<{
    hour: string;
    calls: number;
  }>;
}

export function HourlyActivityChart({ data }: HourlyActivityProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Hourly Activity</CardTitle>
        <CardDescription>Call distribution throughout the day</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="hour" 
              className="text-xs"
              interval={2}
            />
            <YAxis className="text-xs" />
            <Tooltip />
            <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}