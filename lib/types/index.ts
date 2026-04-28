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
  status: 'processing' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
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
