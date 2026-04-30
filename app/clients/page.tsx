import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ClientsTable } from "@/components/clients/clients-table";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ClientsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAdmin = user?.app_metadata?.role === "admin";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground mt-2">
            {isAdmin ? "Manage your client list and display order for reports" : "Client list and report display order"}
          </p>
        </div>
        <ClientsTable isAdmin={isAdmin} />
      </div>
    </DashboardLayout>
  );
}
