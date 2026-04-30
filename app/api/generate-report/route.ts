import { NextRequest, NextResponse } from "next/server";
import { generateMasterReport } from "@/lib/excel/generator";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { TransactionRow } from "@/lib/types";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { transactions, reportName, sourceFiles } = body as {
    transactions: TransactionRow[];
    reportName: string;
    sourceFiles?: Array<{ name: string; size: number }>;
  };

  if (!transactions || !Array.isArray(transactions)) {
    return NextResponse.json({ error: "Invalid transactions data" }, { status: 400 });
  }

  // Create report row — status: processing
  const { data: reportRow, error: insertError } = await supabase
    .from("reports")
    .insert({
      report_name: reportName,
      report_date: new Date().toISOString().split("T")[0],
      status: "processing",
    })
    .select()
    .single();

  if (insertError || !reportRow) {
    return NextResponse.json({ error: "Failed to create report record" }, { status: 500 });
  }

  const reportId = reportRow.id;

  if (sourceFiles && sourceFiles.length > 0) {
    await supabase.from("report_files").insert(
      sourceFiles.map((f) => ({ report_id: reportId, file_name: f.name, file_size: f.size }))
    );
  }

  try {
    const excelBuffer = await generateMasterReport(transactions, reportName);

    const adminClient = createSupabaseAdminClient();
    const storagePath = `${user.id}/${reportId}.xlsx`;
    const { error: uploadError } = await adminClient.storage
      .from("reports")
      .upload(storagePath, new Uint8Array(excelBuffer), {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });
    if (uploadError) throw uploadError;

    await supabase
      .from("reports")
      .update({ status: "completed", file_url: storagePath })
      .eq("id", reportId);

    const safeFileName = `${reportName.replace(/[^a-zA-Z0-9_\-. ]/g, "_")}.xlsx`;
    return new NextResponse(new Uint8Array(excelBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeFileName}"`,
      },
    });
  } catch (error) {
    console.error("Error generating report:", error);
    await supabase.from("reports").update({ status: "failed" }).eq("id", reportId);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
