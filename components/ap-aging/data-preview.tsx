"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Mail, Search } from "lucide-react";
import type { TransactionRow } from "@/lib/types";

interface DataPreviewProps {
  transactions: TransactionRow[];
  onTransactionsChange: (transactions: TransactionRow[]) => void;
  onExport: () => void;
  onEmail: () => void;
  isExporting: boolean;
}

const HEADERS = [
  "Company","Date","Transaction Type","Num","Vendor","Due Date",
  "Past Due","Amount","Open Balance","Bank Balance","Outstanding Checks",
  "Current Available Balance","Balance after paid","Note",
];

function fmtCurrency(value: string | number | null | undefined): string {
  if (value === "" || value === null || value === undefined) return "";
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(num)) return "";
  return "$" + num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isBlankRow(tx: TransactionRow): boolean {
  return (
    !tx.company && !tx.date && !tx.vendor && !tx.transactionType && !tx.num &&
    tx.amount === "" && tx.openBalance === ""
  );
}

export function DataPreview({ transactions, onExport, onEmail, isExporting }: DataPreviewProps) {
  const [search, setSearch] = useState("");

  const dataRows = useMemo(
    () => transactions.filter((tx) => tx.vendor !== "TOTAL" && !isBlankRow(tx)),
    [transactions]
  );

  const totalAmount = useMemo(
    () => dataRows.reduce((sum, tx) => {
      const n = typeof tx.amount === "number" ? tx.amount : parseFloat(String(tx.amount));
      return sum + (isNaN(n) ? 0 : n);
    }, 0),
    [dataRows]
  );

  const companiesCount = useMemo(
    () => new Set(dataRows.filter((tx) => tx.company).map((tx) => tx.company)).size,
    [dataRows]
  );

  const visible = useMemo(() => {
    if (!search) return transactions;
    const term = search.toLowerCase();
    return transactions.filter((tx) => {
      if (isBlankRow(tx) || tx.vendor === "TOTAL") return false;
      return (
        tx.company.toLowerCase().includes(term) ||
        tx.vendor.toLowerCase().includes(term) ||
        tx.date.toLowerCase().includes(term) ||
        tx.transactionType.toLowerCase().includes(term)
      );
    });
  }, [transactions, search]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Transactions</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{dataRows.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Clients</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{companiesCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Amount</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmtCurrency(totalAmount)}</div></CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search company, vendor, date, type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={onExport} disabled={isExporting}>
            <Download className="mr-2 h-4 w-4" />
            Export to Excel
          </Button>
          <Button onClick={onEmail} variant="outline" disabled={isExporting}>
            <Mail className="mr-2 h-4 w-4" />
            Email Report
          </Button>
        </div>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-auto max-h-[600px]">
          <table className="text-xs border-collapse" style={{ minWidth: "1800px", width: "100%" }}>
            <thead className="sticky top-0 z-10">
              <tr>
                {HEADERS.map((h) => (
                  <th
                    key={h}
                    className="px-2 py-2 text-center font-bold text-white whitespace-nowrap border-r last:border-r-0"
                    style={{ backgroundColor: "#B9965A", borderColor: "#a07840" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((tx, i) => {
                const isTotalRow = tx.vendor === "TOTAL";
                const blank = isBlankRow(tx);
                if (blank) {
                  return (
                    <tr key={i} className="h-4 border-b border-gray-100">
                      {HEADERS.map((_, ci) => (
                        <td key={ci} className="border-r border-gray-100 last:border-r-0" />
                      ))}
                    </tr>
                  );
                }
                return (
                  <tr
                    key={i}
                    className={"border-b " + (isTotalRow ? "" : "hover:bg-gray-50")}
                    style={isTotalRow ? { backgroundColor: "#f4f1eb" } : undefined}
                  >
                    <td className={"px-2 py-1.5 border-r border-gray-200 whitespace-nowrap" + (isTotalRow ? " font-semibold" : "")}>
                      {tx.company}
                    </td>
                    <td className="px-2 py-1.5 border-r border-gray-200 whitespace-nowrap">{isTotalRow ? "" : tx.date}</td>
                    <td className="px-2 py-1.5 border-r border-gray-200 whitespace-nowrap">{isTotalRow ? "" : tx.transactionType}</td>
                    <td className="px-2 py-1.5 border-r border-gray-200 whitespace-nowrap">{isTotalRow ? "" : tx.num}</td>
                    <td className="px-2 py-1.5 border-r border-gray-200">{isTotalRow ? "" : tx.vendor}</td>
                    <td className="px-2 py-1.5 border-r border-gray-200 whitespace-nowrap">{isTotalRow ? "" : tx.dueDate}</td>
                    <td className="px-2 py-1.5 border-r border-gray-200 text-right">{isTotalRow ? "" : tx.pastDue}</td>
                    <td className={"px-2 py-1.5 border-r border-gray-200 text-right" + (isTotalRow ? " font-semibold" : "")}>
                      {fmtCurrency(tx.amount)}
                    </td>
                    <td className="px-2 py-1.5 border-r border-gray-200 text-right"></td>
                    <td className="px-2 py-1.5 border-r border-gray-200 text-right text-gray-400">&mdash;</td>
                    <td className="px-2 py-1.5 border-r border-gray-200 text-right">
                      {isTotalRow ? fmtCurrency(0) : ""}
                    </td>
                    <td className={"px-2 py-1.5 border-r border-gray-200 text-right" + (isTotalRow ? " font-semibold" : "")}>
                      {isTotalRow ? fmtCurrency(-(typeof tx.amount === "number" ? tx.amount : parseFloat(String(tx.amount)) || 0)) : ""}
                    </td>
                    <td className="px-2 py-1.5 border-r border-gray-200 text-right">
                    </td>
                    <td className="px-2 py-1.5 last:border-r-0">{tx.note}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 z-10">
              <tr style={{ backgroundColor: "#f4f1eb" }}>
                {HEADERS.map((_, ci) => {
                  if (ci === 10) return <td key={ci} className="px-2 py-2 border-r border-gray-300 font-bold text-right whitespace-nowrap">TOTAL</td>;
                  if (ci === 11) return <td key={ci} className="px-2 py-2 border-r border-gray-300 font-bold text-right whitespace-nowrap">{fmtCurrency(-totalAmount)}</td>;
                  return <td key={ci} className="px-2 py-2 border-r border-gray-300 last:border-r-0" />;
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Formula columns (Outstanding Checks, Current Available Balance) calculate automatically in the exported file once Bank Balance is entered.
      </p>
    </div>
  );
}
