import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ReportHistory } from "@/components/history/report-history";

export default function HistoryPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Report History</h1>
          <p className="text-muted-foreground mt-2">
            View and download previously generated master reports
          </p>
        </div>
        <ReportHistory />
      </div>
    </DashboardLayout>
  );
}
