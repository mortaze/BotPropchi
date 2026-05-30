"use client";

import { Card, CardContent, CardHeader } from "@/components/ui";

export default function DashboardCharts() {
  return (
    <Card>
      <CardHeader><h3 className="font-semibold text-foreground text-sm">نمودارها</h3></CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">برای جلوگیری از داده ساختگی، نمودارها فقط پس از اضافه‌شدن endpoint آماری زمانی در backend فعال می‌شوند.</p>
      </CardContent>
    </Card>
  );
}
