"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileSpreadsheet, X, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { DataPreview } from "./data-preview";
import type { TransactionRow } from "@/lib/types";

interface UploadedFile {
  file: File;
  id: string;
}

export function FileUpload() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [reportName, setReportName] = useState(`Master AP Aging Detail ${new Date().toISOString().split('T')[0]}`);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedData, setProcessedData] = useState<TransactionRow[] | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const saved = sessionStorage.getItem("nrt-processed-data");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (processedData) {
      sessionStorage.setItem("nrt-processed-data", JSON.stringify(processedData));
    } else {
      sessionStorage.removeItem("nrt-processed-data");
    }
  }, [processedData]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    const newFiles: UploadedFile[] = Array.from(selectedFiles).map((file) => ({
      file,
      id: Math.random().toString(36).substring(7),
    }));

    setFiles((prev) => [...prev, ...newFiles]);
    toast.success(`${newFiles.length} file(s) added`);
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    toast.info("File removed");
  }, []);

  const handleProcessFiles = async (e: React.FormEvent) => {
    e.preventDefault();

    if (files.length === 0) {
      toast.error("Please upload at least one file");
      return;
    }

    setIsProcessing(true);

    try {
      const formData = new FormData();
      files.forEach(({ file }) => {
        formData.append("files", file);
      });

      const response = await fetch("/api/parse-files", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to process files");
      }

      const data = await response.json();
      setProcessedData(data.transactions);
      toast.success("Files processed! Review the data below.");
    } catch (error) {
      console.error("Error processing files:", error);
      toast.error("Failed to process files. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = async () => {
    if (!processedData) return;

    setIsExporting(true);

    try {
      const response = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactions: processedData,
          reportName,
          sourceFiles: files.map(({ file }) => ({ name: file.name, size: file.size })),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate report");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${reportName}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("Report downloaded successfully!");
    } catch (error) {
      console.error("Error exporting report:", error);
      toast.error("Failed to export report. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleReset = () => {
    setProcessedData(null);
    setFiles([]);
    setReportName(`Master AP Aging Detail ${new Date().toISOString().split('T')[0]}`);
    sessionStorage.removeItem("nrt-processed-data");
  };

  if (processedData) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Review Data</h2>
            <p className="text-muted-foreground">
              Make any necessary edits before exporting
            </p>
          </div>
          <Button variant="outline" onClick={handleReset}>
            Start Over
          </Button>
        </div>
        <DataPreview
          transactions={processedData}
          onTransactionsChange={setProcessedData}
          onExport={handleExport}
isExporting={isExporting}
        />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload AP Aging Reports</CardTitle>
        <CardDescription>
          Drop your Excel (.xls, .xlsx) or CSV files to begin the automation
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleProcessFiles} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="files">Reports</Label>
            <div className="flex items-center gap-4">
              <Input
                id="files"
                type="file"
                accept=".xls,.xlsx,.csv"
                multiple
                onChange={handleFileChange}
                disabled={isProcessing}
                className="cursor-pointer"
              />
              <Upload className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              <Label>Uploaded Files ({files.length})</Label>
              <div className="space-y-2">
                {files.map(({ file, id }) => (
                  <div
                    key={id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="text-sm font-medium">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(file.size / 1024).toFixed(2)} KB
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(id)}
                      disabled={isProcessing}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reportName">Master AP Aging Report Name</Label>
            <Input
              id="reportName"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              placeholder="Master AP Aging Detail 2026-04-07"
              required
              disabled={isProcessing}
            />
          </div>

          <div className="flex gap-4">
            <Button type="submit" disabled={isProcessing || files.length === 0}>
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Process Files
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
