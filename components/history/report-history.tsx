"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Loader2, FileSpreadsheet, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { Report } from "@/lib/types";
import { isReportStatus } from "@/lib/types";

interface ReportWithFiles extends Report {
  report_files: Array<{ id: string; file_name: string; file_size: number }>;
}

export function ReportHistory() {
  const [reports, setReports] = useState<ReportWithFiles[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => { fetchReports(); }, []);

  const fetchReports = async () => {
    try {
      const res = await fetch("/api/reports");
      if (!res.ok) throw new Error();
      setReports(await res.json());
    } catch { toast.error("Failed to load report history"); }
    finally { setIsLoading(false); }
  };

  const handleDownload = async (reportId: string, reportName: string) => {
    setDownloadingId(reportId);
    try {
      const res = await fetch(`/api/reports/${reportId}/download`);
      if (!res.ok) throw new Error();
      const { url, name } = await res.json();
      const link = document.createElement("a");
      link.href = url;
      link.download = `${name}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Download started");
    } catch { toast.error("Failed to download report"); }
    finally { setDownloadingId(null); }
  };

  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  const formatBytes = (b: number) =>
    b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

  const statusBadge = (status: string) => {
    const safeStatus = isReportStatus(status) ? status : "processing";
    const cls = {
      completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      processing: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls[safeStatus]}`}>
        {safeStatus.charAt(0).toUpperCase() + safeStatus.slice(1)}
      </span>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Report History</CardTitle>
        <CardDescription>View and download previously generated master reports</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Report Name</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  <div className="flex flex-col items-center gap-2">
                    <FileSpreadsheet className="h-12 w-12 text-muted-foreground/50" />
                    <p>No reports generated yet</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              reports.flatMap((report) => {
                const rows = [
                  <TableRow key={report.id}>
                    <TableCell>
                      {report.report_files?.length > 0 && (
                        <button onClick={() => toggleExpand(report.id)} className="text-muted-foreground hover:text-foreground">
                          {expandedIds.has(report.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{report.report_name}</TableCell>
                    <TableCell>{report.report_date}</TableCell>
                    <TableCell>{statusBadge(report.status)}</TableCell>
                    <TableCell>{formatDate(report.created_at)}</TableCell>
                    <TableCell className="text-right">
                      {report.status === "completed" && report.file_url && (
                        <Button variant="ghost" size="sm" disabled={downloadingId === report.id}
                          onClick={() => handleDownload(report.id, report.report_name)}>
                          {downloadingId === report.id
                            ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            : <Download className="h-4 w-4 mr-2" />}
                          Download
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>,
                ];
                if (expandedIds.has(report.id) && report.report_files?.length > 0) {
                  rows.push(
                    <TableRow key={`${report.id}-files`} className="bg-muted/30">
                      <TableCell />
                      <TableCell colSpan={5} className="py-2">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Source files:</p>
                        <ul className="space-y-0.5">
                          {report.report_files.map((f) => (
                            <li key={f.id} className="text-xs text-muted-foreground flex gap-3">
                              <span>{f.file_name}</span>
                              <span className="text-muted-foreground/60">{formatBytes(f.file_size)}</span>
                            </li>
                          ))}
                        </ul>
                      </TableCell>
                    </TableRow>
                  );
                }
                return rows;
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
