import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.app_metadata?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, is_active, created_at, invited_by")
      .order("created_at", { ascending: true });
    if (error) throw error;

    const adminClient = createSupabaseAdminClient();
    const { data: authUsers } = await adminClient.auth.admin.listUsers();
    const emailMap = new Map(authUsers.users.map((u) => [u.id, u.email]));

    const result = (data ?? []).map((p) => ({ ...p, email: emailMap.get(p.id) ?? "" }));
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user: caller } } = await supabase.auth.getUser();
    if (!caller || caller.app_metadata?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { email } = await request.json() as { email: string };
    if (!email?.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const adminClient = createSupabaseAdminClient();
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email.trim());
    if (error) throw error;

    await supabase.from("profiles").update({ invited_by: caller.id }).eq("id", data.user.id);

    return NextResponse.json({ success: true, userId: data.user.id }, { status: 201 });
  } catch (error) {
    console.error("Error inviting user:", error);
    return NextResponse.json({ error: "Failed to invite user" }, { status: 500 });
  }
}
