import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.app_metadata?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { orderedIds } = await request.json() as { orderedIds: string[] };
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json({ error: "orderedIds array required" }, { status: 400 });
    }

    const updates = orderedIds.map((id, index) => ({
      id,
      display_order: index + 1,
    }));

    // Partial upsert — only updating display_order; name is preserved by ON CONFLICT DO UPDATE
    // Cast required because generated types enforce all non-nullable columns on insert path
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase
      .from("clients")
      .upsert(updates as any, { onConflict: "id" });
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error reordering clients:", error);
    return NextResponse.json({ error: "Failed to reorder clients" }, { status: 500 });
  }
}
