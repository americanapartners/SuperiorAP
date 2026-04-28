import type { TransactionRow, ProcessedData } from "@/lib/types";

/**
 * Normalise a company name for fuzzy matching between the master client list
 * and names that come out of QuickBooks AP Aging exports, which can differ by:
 *   - Case                  ("JMS Holly Springs" vs "JMS HOLLY SPRINGS LLC")
 *   - Legal suffixes        ("... LLC", "... Inc")
 *   - Street abbreviations  ("Oak St" vs "Oak Street")
 *   - Missing street type   ("Broyles" vs "Broyles Street", "Airport" vs "Airport Blvd")
 */
function normKey(v: string): string {
  let s = String(v || "").trim().toLowerCase();

  // Strip trailing legal-entity suffixes
  s = s.replace(/\s+(llc|inc|corp|ltd|llp)\.?\s*$/, "");

  // Expand common street abbreviations so both sides use the same token
  // \b...\b + optional period — won't match mid-word (e.g. "st" inside "pleasant")
  s = s.replace(/\bst\.?\b/g,   "street");
  s = s.replace(/\bblvd\.?\b/g, "boulevard");
  s = s.replace(/\bave\.?\b/g,  "avenue");
  s = s.replace(/\bdr\.?\b/g,   "drive");
  s = s.replace(/\brd\.?\b/g,   "road");
  s = s.replace(/\bln\.?\b/g,   "lane");

  // Strip trailing street-type words so a name-only key ("Broyles", "Airport")
  // matches the same company when QuickBooks appends the street type.
  s = s.replace(/\s+(street|boulevard|avenue|drive|road|lane|way|court|circle|place)$/, "");

  return s.replace(/\s+/g, " ").trim();
}

const toNum = (v: unknown): number | "" => {
  if (v === undefined || v === null || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? n : "";
};

const emptyRow = (): TransactionRow => ({
  company: "", date: "", transactionType: "", num: "", vendor: "",
  dueDate: "", pastDue: "", amount: "", openBalance: "",
  bankBalance: "", outstandingChecks: "", currentAvailableBalance: "",
  balanceAfterPaid: "", note: "",
});

/**
 * Mirrors the n8n "Totals" node exactly:
 * - Groups transactions by company (case-insensitive match to masterCompanies)
 * - Emits in masterCompanies order
 * - Each company block: transaction rows → total row → 2 blank spacer rows
 * - Unknown companies appended at the end
 */
export function calculateTotals(
  transactions: TransactionRow[],
  masterCompanies: string[]
): ProcessedData {
  // Group by normalised company key
  const groups = new Map<string, { label: string; rows: TransactionRow[]; total: number }>();

  for (const tx of transactions) {
    const key = normKey(tx.company);
    if (!key || /total$/i.test(tx.company)) continue;
    if (!groups.has(key)) {
      groups.set(key, { label: tx.company, rows: [], total: 0 });
    }
    const g = groups.get(key)!;
    g.rows.push(tx);
    const amt = toNum(tx.amount);
    if (amt !== "") g.total += amt;
  }

  const totalsByCompany: ProcessedData["totalsByCompany"] = {};
  const orderedTransactions: TransactionRow[] = [];
  const emitted = new Set<string>();

  // Emit in master order
  for (const masterName of masterCompanies) {
    const key = normKey(masterName);
    const g = groups.get(key);

    // Always emit the company (with 0 total if no transactions)
    const total = g ? g.total : 0;
    totalsByCompany[masterName] = {
      amount: total,
      openBalance: 0,
      bankBalance: 0,
      outstandingChecks: 0,
      currentAvailableBalance: 0,
      balanceAfterPaid: 0,
    };

    if (g && g.rows.length > 0) {
      orderedTransactions.push(...g.rows);
    }

    // Total row
    orderedTransactions.push({
      ...emptyRow(),
      company: `${masterName} Total`,
      vendor: "TOTAL",
      amount: Number(total.toFixed(2)),
    });

    // 2 blank spacer rows (matches n8n output)
    orderedTransactions.push(emptyRow());
    orderedTransactions.push(emptyRow());

    emitted.add(key);
  }

  // Append unknown companies
  for (const [key, g] of groups.entries()) {
    if (emitted.has(key)) continue;
    const total = g.total;
    totalsByCompany[g.label] = {
      amount: total, openBalance: 0, bankBalance: 0,
      outstandingChecks: 0, currentAvailableBalance: 0, balanceAfterPaid: 0,
    };
    orderedTransactions.push(...g.rows);
    orderedTransactions.push({ ...emptyRow(), company: `${g.label} Total`, vendor: "TOTAL", amount: Number(total.toFixed(2)) });
    orderedTransactions.push(emptyRow());
    orderedTransactions.push(emptyRow());
  }

  return { transactions: orderedTransactions, totalsByCompany };
}
