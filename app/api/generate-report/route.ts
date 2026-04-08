import { NextRequest, NextResponse } from "next/server";
import { generateMasterReport } from "@/lib/excel/generator";
import type { TransactionRow } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transactions, reportName } = body as {
      transactions: TransactionRow[];
      reportName: string;
    };

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json(
        { error: "Invalid transactions data" },
        { status: 400 }
      );
    }

    const excelBuffer = await generateMasterReport(transactions, reportName);

    const safeFileName = `${reportName.replace(/[^a-zA-Z0-9_\-. ]/g, "_")}.xlsx`;

    return new NextResponse(new Uint8Array(excelBuffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeFileName}"`,
      },
    });
  } catch (error) {
    console.error("Error generating report:", error);
    return NextResponse.json(
      { error: "Failed to generate report" },
      { status: 500 }
    );
  }
}
