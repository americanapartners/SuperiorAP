import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { UsersTable } from "@/components/users/users-table";

export default function UsersPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-2">Manage users and application preferences</p>
        </div>
        <UsersTable />
      </div>
    </DashboardLayout>
  );
}
