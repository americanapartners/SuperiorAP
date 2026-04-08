import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ClientsTable } from "@/components/clients/clients-table";

export default function ClientsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground mt-2">
            Manage your client list and display order for reports
          </p>
        </div>
        <ClientsTable />
      </div>
    </DashboardLayout>
  );
}
