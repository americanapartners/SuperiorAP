import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
    const body = await request.json() as {
      full_name?: string;
      email?: string;
      password?: string;
      role?: string;       // typed as string so runtime guard below is not a no-op
      is_active?: boolean;
    };

    // Self-role guard — self-PATCH for full_name/email/password is allowed; role on self is not
    if (body.role !== undefined && id === caller.id) {
      return NextResponse.json({ error: "You cannot change your own role." }, { status: 400 });
    }

    // Role validation
    if (body.role !== undefined && !["admin", "user"].includes(body.role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }

    // Field updates are sequential with no transaction. If a field's second write
    // (e.g. user_metadata sync after profiles update) fails, the outer catch returns
    // 500 but the first write has already been committed. This is an accepted
    // eventual-consistency trade-off for a low-traffic admin tool.
    const adminClient = createSupabaseAdminClient();

    // full_name — write to profiles, then sync to user_metadata
    if (body.full_name !== undefined) {
      if (typeof body.full_name !== "string") {
        return NextResponse.json({ error: "Invalid full_name." }, { status: 400 });
      }
      const trimmedName = body.full_name.trim();
      if (trimmedName === "") {
        return NextResponse.json({ error: "Full name cannot be empty." }, { status: 400 });
      }
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: trimmedName })
        .eq("id", id);
      if (error) throw error;

      const { error: authErr } = await adminClient.auth.admin.updateUserById(id, {
        user_metadata: { full_name: trimmedName },
      });
      if (authErr) throw authErr;
    }

    // email — server-side domain validation, then update auth record
    if (body.email !== undefined) {
      if (typeof body.email !== "string") {
        return NextResponse.json({ error: "Invalid email." }, { status: 400 });
      }
      const domain = body.email.split("@")[1]?.toLowerCase();
      if (!["americanapartners.com", "nonzeroai.com"].includes(domain ?? "")) {
        return NextResponse.json({ error: "Domain not allowed" }, { status: 400 });
      }
      const { error } = await adminClient.auth.admin.updateUserById(id, {
        email: body.email.trim().toLowerCase(),
      });
      if (error) throw error;
    }

    // password — minimum 8 characters, then update auth record
    if (body.password !== undefined) {
      if (typeof body.password !== "string") {
        return NextResponse.json({ error: "Invalid password." }, { status: 400 });
      }
      if (body.password.length < 8) {
        return NextResponse.json(
          { error: "Password must be at least 8 characters." },
          { status: 400 }
        );
      }
      const { error } = await adminClient.auth.admin.updateUserById(id, {
        password: body.password,
      });
      if (error) throw error;
    }

    // role — update profiles table, then sync app_metadata JWT claim
    if (body.role !== undefined) {
      const { error } = await supabase
        .from("profiles")
        .update({ role: body.role as "admin" | "user" })
        .eq("id", id);
      if (error) throw error;

      const { error: authErr } = await adminClient.auth.admin.updateUserById(id, {
        app_metadata: { role: body.role },
      });
      if (authErr) throw authErr;
    }

    // is_active — update profiles table
    if (body.is_active !== undefined) {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: body.is_active })
        .eq("id", id);
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
