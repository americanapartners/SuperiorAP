import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, localStore } from "@/lib/local-store";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      const data = await localStore.getClients();
      return NextResponse.json(data);
    }

    const { data, error } = await supabaseServer
      .from("clients")
      .select("*")
      .order("display_order", { ascending: true });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching clients:", error);
    return NextResponse.json(
      { error: "Failed to fetch clients" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, display_order } = body;

    if (!name || display_order === undefined) {
      return NextResponse.json(
        { error: "Name and display_order are required" },
        { status: 400 }
      );
    }

    if (!isSupabaseConfigured()) {
      const data = await localStore.createClient(name, display_order);
      return NextResponse.json(data, { status: 201 });
    }

    const { data, error } = await supabaseServer
      .from("clients")
      .insert([{ name, display_order }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Error creating client:", error);
    return NextResponse.json(
      { error: "Failed to create client" },
      { status: 500 }
    );
  }
}
