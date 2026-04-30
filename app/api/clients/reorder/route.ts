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

    const results = await Promise.all(
      orderedIds.map((id, index) =>
        supabase.from("clients").update({ display_order: index + 1 }).eq("id", id)
      )
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error reordering clients:", error);
    return NextResponse.json({ error: "Failed to reorder clients" }, { status: 500 });
  }
}
