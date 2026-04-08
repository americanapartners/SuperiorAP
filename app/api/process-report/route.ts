import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { parseExcelFile } from "@/lib/excel/parser";
import { calculateTotals } from "@/lib/excel/processor";
import { generateMasterReport } from "@/lib/excel/generator";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const reportName = formData.get("reportName") as string;
    const email = formData.get("email") as string;

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "No files provided" },
        { status: 400 }
      );
    }

    const { data: clientsData, error: clientsError } = await supabaseServer
      .from("clients")
      .select("name")
      .order("display_order", { ascending: true });

    if (clientsError) throw clientsError;

    const masterCompanies = clientsData.map((c) => c.name);

    const { data: report, error: reportError } = await supabaseServer
      .from("reports")
      .insert([
        {
          report_name: reportName,
          report_date: new Date().toISOString().split("T")[0],
          status: "processing",
        },
      ])
      .select()
      .single();

    if (reportError) throw reportError;

    let allTransactions: any[] = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const transactions = await parseExcelFile(buffer);
      allTransactions = allTransactions.concat(transactions);

      await supabaseServer.from("report_files").insert([
        {
          report_id: report.id,
          file_name: file.name,
          file_size: file.size,
        },
      ]);
    }

    const processedData = calculateTotals(allTransactions, masterCompanies);

    const excelBuffer = await generateMasterReport(
      processedData.transactions,
      reportName
    );

    const fileName = `${reportName.replace(/\s+/g, "_")}.xlsx`;
    const base64Data = excelBuffer.toString("base64");
    const downloadUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64Data}`;

    await supabaseServer
      .from("reports")
      .update({
        status: "completed",
        file_url: downloadUrl,
      })
      .eq("id", report.id);

    return NextResponse.json({
      success: true,
      reportId: report.id,
      downloadUrl,
      fileName,
    });
  } catch (error) {
    console.error("Error processing report:", error);
    return NextResponse.json(
      { error: "Failed to process report" },
      { status: 500 }
    );
  }
}
