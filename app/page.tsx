import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { FileUpload } from "@/components/ap-aging/file-upload";

export default function Home() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AP Aging Detail Report</h1>
          <p className="text-muted-foreground mt-2">
            Upload your AP aging reports to generate the master detail report
          </p>
        </div>
        <FileUpload />
      </div>
    </DashboardLayout>
  );
}
