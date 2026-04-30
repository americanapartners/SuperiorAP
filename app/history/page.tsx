import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ReportHistory } from "@/components/history/report-history";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function HistoryPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "admin") redirect("/");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Report History</h1>
          <p className="text-muted-foreground mt-2">View and download previously generated master reports</p>
        </div>
        <ReportHistory />
      </div>
    </DashboardLayout>
  );
}
