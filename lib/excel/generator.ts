import ExcelJS from "exceljs";
import type { TransactionRow } from "@/lib/types";

// Column definitions matching the exact widths from the reference output
const COLS = [
  { header: "Company",                   width: 22.63 },
  { header: "Date",                      width: 12.63 },
  { header: "Transaction Type",          width: 15.13 },
  { header: "Num",                       width: 16.38 },
  { header: "Vendor",                    width: 40.13 },
  { header: "Due Date",                  width: 12.63 },
  { header: "Past Due",                  width: 8.88  },
  { header: "Amount",                    width: 13.88 },
  { header: "Bank Balance",              width: 13.88 },  // I — user enters after export
  { header: "Outstanding Checks",        width: 16.38 },  // J — user enters after export
  { header: "Current Available Balance", width: 20.13 },  // K — formula: =I-J
  { header: "Balance after paid",        width: 23.88 },  // L — formula: =K-H
  { header: "Note",                      width: 12.63 },  // M
] as const;

const CURRENCY = "$#,##0.00";
const GOLD     = "FFB9965A";
const WHITE    = "FFFFFFFF";
const CREAM    = "FFF4F1EB";

export async function generateMasterReport(
  transactions: TransactionRow[],
  reportName: string
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Sheet 1");

  // Set column widths (no key/header — we write headers manually to row 3)
  ws.columns = COLS.map((c) => ({ width: c.width }));

  // ── Row 1: Title merged A1:E1 ─────────────────────────────────────────────
  const now = new Date();
  const ds = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}`;
  ws.getRow(1).getCell(1).value = `A/P Aging Detail - ${ds}`;
  ws.mergeCells("A1:E1");

  // ── Row 2: empty ──────────────────────────────────────────────────────────

  // ── Row 3: Header row ─────────────────────────────────────────────────────
  const hdrRow = ws.getRow(3);
  hdrRow.height = 20;
  COLS.forEach((col, i) => {
    const cell = hdrRow.getCell(i + 1);
    cell.value = col.header;
    cell.font      = { bold: true, color: { argb: WHITE } };
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  // ── Row 4: empty ──────────────────────────────────────────────────────────

  // ── Data rows start at Excel row 5 ────────────────────────────────────────
  let r = 5;
  let grandTotal = 0;

  for (const tx of transactions) {
    const row = ws.getRow(r);

    if (tx.vendor === "TOTAL") {
      // Company total row
      row.getCell(1).value = tx.company;

      const amt = typeof tx.amount === "number" ? tx.amount : Number(tx.amount) || 0;
      grandTotal += amt;
      const amtCell = row.getCell(8);
      amtCell.value  = amt;
      amtCell.numFmt = CURRENCY;

      // K (col 11) = Current Available Balance = Bank Balance (I) − Outstanding Checks (J)
      // result: 0 because I and J are blank until user fills them in
      const kCell = row.getCell(11);
      kCell.value  = { formula: `I${r}-J${r}`, result: 0 };
      kCell.numFmt = CURRENCY;

      // L (col 12) = Balance after paid = Current Available Balance (K) − Amount (H)
      // result: 0 − amt = −amt (K is 0 until Bank Balance / Outstanding Checks are entered)
      const lCell = row.getCell(12);
      lCell.value  = { formula: `K${r}-H${r}`, result: -amt };
      lCell.numFmt = CURRENCY;

      // Style every cell in the total row
      for (let c = 1; c <= COLS.length; c++) {
        const cell = row.getCell(c);
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CREAM } };
      }
    } else {
      // Regular transaction row (or blank spacer — leave empty cells as-is)
      if (tx.company || tx.date || tx.vendor || tx.transactionType) {
        row.getCell(1).value  = tx.company          || null;
        row.getCell(2).value  = tx.date             || null;
        row.getCell(3).value  = tx.transactionType  || null;
        row.getCell(4).value  = tx.num              || null;
        row.getCell(5).value  = tx.vendor           || null;
        row.getCell(6).value  = tx.dueDate          || null;
        row.getCell(7).value  = tx.pastDue          || null;
        row.getCell(13).value = tx.note             || null;  // Note now at M (col 13)

        if (tx.amount !== "" && tx.amount !== null && tx.amount !== undefined) {
          const v = typeof tx.amount === "number" ? tx.amount : Number(tx.amount);
          if (Number.isFinite(v)) { row.getCell(8).value = v; row.getCell(8).numFmt = CURRENCY; }
        }
      }
    }

    r++;
  }

  // ── Grand total row (after all data) ──────────────────────────────────────
  const totalLabelCell = ws.getRow(r).getCell(11);
  totalLabelCell.value = "TOTAL";
  totalLabelCell.font  = { bold: true };

  const totalFormulaCell = ws.getRow(r).getCell(12);
  totalFormulaCell.value  = { formula: `SUMIF(A:A,"*Total*",L:L)`, result: -grandTotal };
  totalFormulaCell.numFmt = CURRENCY;
  totalFormulaCell.font   = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
