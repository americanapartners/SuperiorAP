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

    const { email, password, full_name, role } = await request.json() as {
      email: string;
      password: string;
      full_name?: string;
      role: "admin" | "user";
    };

    if (!email?.trim() || !password || !role) {
      return NextResponse.json({ error: "email, password, and role are required" }, { status: 400 });
    }

    const domain = email.split("@")[1]?.toLowerCase();
    if (!["americanapartners.com", "nonzeroai.com"].includes(domain)) {
      return NextResponse.json({ error: "Domain not allowed" }, { status: 400 });
    }

    const adminClient = createSupabaseAdminClient();
    const { data, error } = await adminClient.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name ?? "" },
      app_metadata: { role },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, userId: data.user.id }, { status: 201 });
  } catch (error) {
    console.error("Error creating user:", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
