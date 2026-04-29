import * as XLSX from "xlsx";
import type { TransactionRow } from "@/lib/types";

const isEmpty = (v: unknown): boolean =>
  v === "" || v === null || v === undefined;

function normalizeDate(v: unknown): string {
  if (isEmpty(v)) return "";
  if (v instanceof Date) {
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${m}/${d}/${v.getFullYear()}`;
  }
  if (typeof v === "string") return v.trim();
  const num = Number(v);
  if (!Number.isFinite(num)) return "";
  const base = new Date(Date.UTC(1899, 11, 30));
  const dt = new Date(base.getTime() + num * 86_400_000);
  return `${String(dt.getUTCMonth() + 1).padStart(2, "0")}/${String(dt.getUTCDate()).padStart(2, "0")}/${dt.getUTCFullYear()}`;
}

function normalizeMoney(v: unknown): string | number {
  if (isEmpty(v)) return "";
  const n = Number(v);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : String(v);
}

// Converts to a real number when the value is purely numeric (e.g. check numbers
// like "1001"), otherwise keeps as string. Prevents Excel "Number stored as text"
// green-triangle warnings in column D.
function normalizeNum(v: unknown): string | number {
  if (isEmpty(v)) return "";
  const s = String(v).trim();
  if (s === "") return "";
  const n = Number(s);
  return Number.isFinite(n) ? n : s;
}

// Past Due is always a whole-number count of days. Returns a number so Excel
// does not flag column G with "Number stored as text".
function normalizePastDue(v: unknown): number | "" {
  if (isEmpty(v)) return "";
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : "";
}

/**
 * QuickBooks AP Aging Detail XLS structure (individual company file):
 *
 *   Row 0  : [CompanyName, null, ...]         ← company name — col A only
 *   Row 1  : ["A/P Aging Detail", null, ...]  ← report title — skip
 *   Row 2  : ["All Dates", null, ...]          ← date range  — skip
 *   Row 3  : [null, ...]                       ← blank
 *   Row 4  : [null,"Date","Transaction Type","Num","Vendor","Due Date","Past Due","Amount","Open Balance"]
 *   Row 5+ : [AgingBucketLabel, null, ...]    ← skip  (e.g. "31 - 60 days past due")
 *           | [null, date, type, num, ...]    ← TRANSACTION ROW
 *           | ["Total for ...", ..., sum]     ← skip
 *   Last   : ["TOTAL", ..., sum]              ← skip
 *            [timestamp]                      ← skip
 *
 * Rule: any row where col A (index 0) is non-null is NOT a transaction row.
 */
export function parseExcelFile(buffer: Buffer): TransactionRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown[][];

  const out: TransactionRow[] = [];
  let companyName = "";
  let dateColIdx = -1;
  let companyNameFound = false;

  // Matches report-title rows that QuickBooks sometimes puts before the company
  // name: "A/P Aging Detail", "A/P Aging Detail - 12/02/2025", etc.
  const isReportTitle = (v: string) => /^a\/p aging/i.test(v);

  for (const rawRow of allRows) {
    const row = rawRow as unknown[];
    const nonEmpty = row.filter((v) => !isEmpty(v));
    if (nonEmpty.length === 0) continue;

    // ── Company name: first non-empty row whose col A is NOT a report title ──
    if (!companyNameFound) {
      if (!isEmpty(row[0])) {
        const val = String(row[0]).trim();
        if (!isReportTitle(val)) {
          companyName = val;
          companyNameFound = true;
        }
        // If it IS a report title, skip the row and keep looking
      }
      continue;
    }

    // ── Find the column-header row (col A null, col B = "Date") ─────────────
    if (dateColIdx === -1) {
      const dIdx = row.findIndex(
        (v) => typeof v === "string" && v.trim() === "Date"
      );
      if (dIdx !== -1 && nonEmpty.length >= 3) {
        dateColIdx = dIdx;
      }
      // All pre-header rows (titles, labels, blanks) are just skipped
      continue;
    }

    // ── Any row where col A is non-null = label / bucket / total → skip ─────
    if (!isEmpty(row[0])) continue;

    // ── Transaction row ──────────────────────────────────────────────────────
    const dc = dateColIdx;
    const dateVal  = row[dc];
    const amountV  = row[dc + 6];
    const openBalV = row[dc + 7];

    if (isEmpty(dateVal) && isEmpty(amountV)) continue;

    out.push({
      company:         companyName,
      date:            normalizeDate(dateVal),
      transactionType: String(row[dc + 1] ?? "").trim(),
      num:             normalizeNum(row[dc + 2]),
      vendor:          String(row[dc + 3] ?? "").trim(),
      dueDate:         normalizeDate(row[dc + 4]),
      pastDue:         normalizePastDue(row[dc + 5]),
      amount:          normalizeMoney(amountV),
      openBalance:     normalizeMoney(openBalV),
      bankBalance:              "",
      outstandingChecks:        "",
      currentAvailableBalance:  "",
      balanceAfterPaid:         "",
      note:                     "",
    });
  }

  return out;
}
