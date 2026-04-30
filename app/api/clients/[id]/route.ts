import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, localStore } from "@/lib/local-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, display_order } = body;

    if (!isSupabaseConfigured()) {
      const data = await localStore.updateClient(id, name, display_order);
      if (!data) {
        return NextResponse.json({ error: "Client not found" }, { status: 404 });
      }
      return NextResponse.json(data);
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("clients")
      .update({ name, display_order })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error updating client:", error);
    return NextResponse.json(
      { error: "Failed to update client" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isSupabaseConfigured()) {
      const ok = await localStore.deleteClient(id);
      if (!ok) {
        return NextResponse.json({ error: "Client not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("clients")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting client:", error);
    return NextResponse.json(
      { error: "Failed to delete client" },
      { status: 500 }
    );
  }
}
