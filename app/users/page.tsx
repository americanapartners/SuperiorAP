import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { UsersTable } from "@/components/users/users-table";

export default function UsersPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground mt-2">
            Invite users, manage roles, and deactivate accounts
          </p>
        </div>
        <UsersTable />
      </div>
    </DashboardLayout>
  );
}
