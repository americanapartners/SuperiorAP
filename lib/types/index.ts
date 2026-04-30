export interface Client {
  id: string;
  name: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface Report {
  id: string;
  report_name: string;
  report_date: string;
  file_url: string | null;
  status: string;  // 'processing' | 'completed' | 'failed' — kept as string to match DB
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Type guard used by components that need the status union
export function isReportStatus(s: string): s is 'processing' | 'completed' | 'failed' {
  return s === 'processing' || s === 'completed' || s === 'failed';
}

export interface ReportFile {
  id: string;
  report_id: string;
  file_name: string;
  file_size: number;
  uploaded_at: string;
}

export interface TransactionRow {
  company: string;
  date: string;
  transactionType: string;
  num: string | number;
  vendor: string;
  dueDate: string;
  pastDue: string | number;
  amount: string | number;
  openBalance: string | number;
  bankBalance: string | number;
  outstandingChecks: string | number;
  currentAvailableBalance: string | number;
  balanceAfterPaid: string | number;
  note: string;
}

export interface ProcessedData {
  transactions: TransactionRow[];
  totalsByCompany: Record<string, {
    amount: number;
    openBalance: number;
    bankBalance: number;
    outstandingChecks: number;
    currentAvailableBalance: number;
    balanceAfterPaid: number;
  }>;
}
