import { NextRequest, NextResponse } from "next/server";
import { parseExcelFile } from "@/lib/excel/parser";
import { calculateTotals } from "@/lib/excel/processor";
import { isSupabaseConfigured, localStore } from "@/lib/local-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    // Get ordered client list (local store or Supabase)
    let masterCompanies: string[];
    if (!isSupabaseConfigured()) {
      const clients = await localStore.getClients();
      masterCompanies = clients.map((c) => c.name);
    } else {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("clients")
        .select("name")
        .order("display_order", { ascending: true });
      if (error) throw error;
      masterCompanies = (data as { name: string }[]).map((c) => c.name);
    }

    // Parse all uploaded files
    const allTransactions = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const transactions = parseExcelFile(buffer);
      allTransactions.push(...transactions);
    }

    // Calculate totals and order by master company list
    const processedData = calculateTotals(allTransactions, masterCompanies);

    return NextResponse.json({
      success: true,
      transactions: processedData.transactions,
      totalsByCompany: processedData.totalsByCompany,
    });
  } catch (error) {
    console.error("Error parsing files:", error);
    return NextResponse.json({ error: "Failed to parse files" }, { status: 500 });
  }
}
