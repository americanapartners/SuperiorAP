import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user: caller } } = await supabase.auth.getUser();
    if (!caller || caller.app_metadata?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json() as { role?: "admin" | "user"; is_active?: boolean };

    const profileUpdate: ProfileUpdate = {};
    if (body.role !== undefined) profileUpdate.role = body.role;
    if (body.is_active !== undefined) profileUpdate.is_active = body.is_active;

    if (Object.keys(profileUpdate).length > 0) {
      const { error } = await supabase.from("profiles").update(profileUpdate).eq("id", id);
      if (error) throw error;
    }

    // Sync role into app_metadata JWT claim
    if (body.role !== undefined) {
      const adminClient = createSupabaseAdminClient();
      const { error } = await adminClient.auth.admin.updateUserById(id, {
        app_metadata: { role: body.role },
      });
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user: caller } } = await supabase.auth.getUser();
    if (!caller || caller.app_metadata?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    if (id === caller.id) {
      return NextResponse.json(
        { error: "You cannot remove your own account." },
        { status: 400 }
      );
    }

    const adminClient = createSupabaseAdminClient();
    const { error } = await adminClient.auth.admin.deleteUser(id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing user:", error);
    return NextResponse.json({ error: "Failed to remove user" }, { status: 500 });
  }
}
