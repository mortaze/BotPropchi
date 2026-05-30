// src/components/charts/DashboardCharts.tsx
"use client";
import { Card, CardHeader, CardContent } from "@/components/ui";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LineChart, Line, Legend,
} from "recharts";

// Mock data — در production از API واقعی بگیرید
const growthData = [
  { day: "شنبه", users: 12, referrals: 4 },
  { day: "یکشنبه", users: 18, referrals: 7 },
  { day: "دوشنبه", users: 25, referrals: 10 },
  { day: "سه‌شنبه", users: 20, referrals: 6 },
  { day: "چهارشنبه", users: 35, referrals: 15 },
  { day: "پنجشنبه", users: 28, referrals: 9 },
  { day: "جمعه", users: 42, referrals: 18 },
];

const clickData = [
  { name: "FTMO", clicks: 234 },
  { name: "MyForexFunds", clicks: 189 },
  { name: "FundedNext", clicks: 156 },
  { name: "TopStepTrader", clicks: 98 },
  { name: "سایر", clicks: 67 },
];

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
  color: "hsl(var(--foreground))",
};

export default function DashboardCharts() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* رشد کاربران */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <h3 className="font-semibold text-foreground text-sm">رشد کاربران و رفرال‌ها (۷ روز اخیر)</h3>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={growthData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorReferrals" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend formatter={(v) => v === "users" ? "کاربران جدید" : "رفرال‌ها"} />
              <Area type="monotone" dataKey="users" stroke="hsl(var(--chart-1))" fill="url(#colorUsers)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="referrals" stroke="hsl(var(--chart-2))" fill="url(#colorReferrals)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* کلیک‌های افیلیت */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-foreground text-sm">کلیک افیلیت بر اساس پراپ فرم</h3>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={clickData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={90} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="clicks" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}