// =============================================================================
// MOCK DATA — This simulates what would come from Open Banking APIs (Tink/Bridge)
// and the company's employee database. In the real product, this data
// would be pulled from real bank connections and stored in PostgreSQL.
// =============================================================================

export type TransactionStatus =
  | "receipt_needed" // Transaction detected, waiting for receipt photo
  | "receipt_uploaded" // Employee uploaded receipt, pending match
  | "complete" // Receipt matched and expense submitted
  | "flagged" // Policy violation or missing receipt past deadline
  | "approved" // Manager approved the expense
  | "rejected"; // Manager rejected the expense

export type ExpenseCategory =
  | "meals"
  | "transport"
  | "accommodation"
  | "office_supplies"
  | "software"
  | "client_entertainment"
  | "travel"
  | "other";

export interface Transaction {
  id: string;
  employeeId: string;
  merchantName: string;
  merchantCategory: ExpenseCategory;
  amount: number;
  currency: string;
  date: string; // ISO date
  time: string; // HH:mm
  status: TransactionStatus;
  receiptUrl?: string;
  captureTimeMinutes?: number; // How fast the receipt was captured
  notes?: string;
  policyViolation?: string;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  avatarInitials: string;
  totalExpensesThisMonth: number;
  receiptComplianceRate: number; // 0-100%
  pendingReceipts: number;
}

export interface CompanyStats {
  totalExpensesThisMonth: number;
  totalTransactions: number;
  receiptsCaptured: number;
  averageCaptureTimeMinutes: number;
  complianceRate: number;
  pendingApprovals: number;
}

// --- Employees ---

export const employees: Employee[] = [
  {
    id: "emp-1",
    name: "Marie Dupont",
    email: "marie.dupont@acme.fr",
    role: "Sales Manager",
    department: "Sales",
    avatarInitials: "MD",
    totalExpensesThisMonth: 1847.5,
    receiptComplianceRate: 94,
    pendingReceipts: 1,
  },
  {
    id: "emp-2",
    name: "Thomas Bernard",
    email: "thomas.bernard@acme.fr",
    role: "Software Engineer",
    department: "Engineering",
    avatarInitials: "TB",
    totalExpensesThisMonth: 423.8,
    receiptComplianceRate: 100,
    pendingReceipts: 0,
  },
  {
    id: "emp-3",
    name: "Sophie Laurent",
    email: "sophie.laurent@acme.fr",
    role: "Account Executive",
    department: "Sales",
    avatarInitials: "SL",
    totalExpensesThisMonth: 2156.3,
    receiptComplianceRate: 78,
    pendingReceipts: 4,
  },
  {
    id: "emp-4",
    name: "Lucas Martin",
    email: "lucas.martin@acme.fr",
    role: "Product Designer",
    department: "Design",
    avatarInitials: "LM",
    totalExpensesThisMonth: 312.0,
    receiptComplianceRate: 100,
    pendingReceipts: 0,
  },
  {
    id: "emp-5",
    name: "Emma Petit",
    email: "emma.petit@acme.fr",
    role: "Marketing Lead",
    department: "Marketing",
    avatarInitials: "EP",
    totalExpensesThisMonth: 1523.75,
    receiptComplianceRate: 87,
    pendingReceipts: 2,
  },
];

// --- Transactions ---

export const transactions: Transaction[] = [
  // Marie Dupont
  {
    id: "txn-1",
    employeeId: "emp-1",
    merchantName: "Restaurant Le Petit Cler",
    merchantCategory: "meals",
    amount: 67.5,
    currency: "EUR",
    date: "2026-04-04",
    time: "12:45",
    status: "receipt_needed",
    policyViolation: undefined,
  },
  {
    id: "txn-2",
    employeeId: "emp-1",
    merchantName: "SNCF Voyages",
    merchantCategory: "travel",
    amount: 234.0,
    currency: "EUR",
    date: "2026-04-03",
    time: "08:12",
    status: "complete",
    captureTimeMinutes: 3,
  },
  {
    id: "txn-3",
    employeeId: "emp-1",
    merchantName: "Novotel Paris Bercy",
    merchantCategory: "accommodation",
    amount: 189.0,
    currency: "EUR",
    date: "2026-04-03",
    time: "18:30",
    status: "approved",
    captureTimeMinutes: 7,
  },
  {
    id: "txn-4",
    employeeId: "emp-1",
    merchantName: "Uber",
    merchantCategory: "transport",
    amount: 23.4,
    currency: "EUR",
    date: "2026-04-02",
    time: "09:15",
    status: "complete",
    captureTimeMinutes: 1,
    notes: "Email receipt auto-captured",
  },
  // Thomas Bernard
  {
    id: "txn-5",
    employeeId: "emp-2",
    merchantName: "Amazon Business",
    merchantCategory: "office_supplies",
    amount: 89.99,
    currency: "EUR",
    date: "2026-04-04",
    time: "14:22",
    status: "complete",
    captureTimeMinutes: 2,
  },
  {
    id: "txn-6",
    employeeId: "emp-2",
    merchantName: "GitHub",
    merchantCategory: "software",
    amount: 21.0,
    currency: "EUR",
    date: "2026-04-01",
    time: "00:00",
    status: "complete",
    captureTimeMinutes: 0,
    notes: "Recurring subscription — auto-matched",
  },
  // Sophie Laurent
  {
    id: "txn-7",
    employeeId: "emp-3",
    merchantName: "La Table de Marcel",
    merchantCategory: "client_entertainment",
    amount: 187.5,
    currency: "EUR",
    date: "2026-04-04",
    time: "13:15",
    status: "receipt_needed",
    policyViolation: "Amount exceeds EUR 150 meal limit",
  },
  {
    id: "txn-8",
    employeeId: "emp-3",
    merchantName: "Eurostar",
    merchantCategory: "travel",
    amount: 312.0,
    currency: "EUR",
    date: "2026-04-03",
    time: "06:45",
    status: "complete",
    captureTimeMinutes: 5,
  },
  {
    id: "txn-9",
    employeeId: "emp-3",
    merchantName: "The Hoxton Hotel",
    merchantCategory: "accommodation",
    amount: 245.0,
    currency: "EUR",
    date: "2026-04-03",
    time: "15:00",
    status: "flagged",
    policyViolation: "Receipt missing — 48h deadline passed",
  },
  {
    id: "txn-10",
    employeeId: "emp-3",
    merchantName: "Black Cab London",
    merchantCategory: "transport",
    amount: 34.8,
    currency: "EUR",
    date: "2026-04-03",
    time: "19:20",
    status: "receipt_needed",
  },
  {
    id: "txn-11",
    employeeId: "emp-3",
    merchantName: "Starbucks Covent Garden",
    merchantCategory: "meals",
    amount: 8.5,
    currency: "EUR",
    date: "2026-04-03",
    time: "10:05",
    status: "complete",
    captureTimeMinutes: 2,
  },
  // Lucas Martin
  {
    id: "txn-12",
    employeeId: "emp-4",
    merchantName: "Figma",
    merchantCategory: "software",
    amount: 15.0,
    currency: "EUR",
    date: "2026-04-01",
    time: "00:00",
    status: "complete",
    captureTimeMinutes: 0,
    notes: "Recurring subscription — auto-matched",
  },
  {
    id: "txn-13",
    employeeId: "emp-4",
    merchantName: "FNAC",
    merchantCategory: "office_supplies",
    amount: 49.99,
    currency: "EUR",
    date: "2026-04-02",
    time: "16:40",
    status: "complete",
    captureTimeMinutes: 4,
  },
  // Emma Petit
  {
    id: "txn-14",
    employeeId: "emp-5",
    merchantName: "Google Ads",
    merchantCategory: "software",
    amount: 850.0,
    currency: "EUR",
    date: "2026-04-01",
    time: "00:00",
    status: "approved",
    captureTimeMinutes: 0,
    notes: "Recurring — auto-matched",
  },
  {
    id: "txn-15",
    employeeId: "emp-5",
    merchantName: "WeWork La Fayette",
    merchantCategory: "other",
    amount: 45.0,
    currency: "EUR",
    date: "2026-04-04",
    time: "09:00",
    status: "receipt_needed",
  },
  {
    id: "txn-16",
    employeeId: "emp-5",
    merchantName: "Deliveroo",
    merchantCategory: "meals",
    amount: 28.75,
    currency: "EUR",
    date: "2026-04-04",
    time: "12:30",
    status: "receipt_needed",
  },
];

// --- Helper functions ---

export function getEmployeeById(id: string): Employee | undefined {
  return employees.find((e) => e.id === id);
}

export function getTransactionsForEmployee(employeeId: string): Transaction[] {
  return transactions.filter((t) => t.employeeId === employeeId);
}

export function getCompanyStats(): CompanyStats {
  const completedOrApproved = transactions.filter(
    (t) => t.status === "complete" || t.status === "approved"
  );
  const withCaptureTime = completedOrApproved.filter(
    (t) => t.captureTimeMinutes !== undefined
  );
  const avgCapture =
    withCaptureTime.length > 0
      ? withCaptureTime.reduce((sum, t) => sum + (t.captureTimeMinutes ?? 0), 0) /
        withCaptureTime.length
      : 0;

  return {
    totalExpensesThisMonth: transactions.reduce((sum, t) => sum + t.amount, 0),
    totalTransactions: transactions.length,
    receiptsCaptured: completedOrApproved.length,
    averageCaptureTimeMinutes: Math.round(avgCapture * 10) / 10,
    complianceRate: Math.round(
      (completedOrApproved.length / transactions.length) * 100
    ),
    pendingApprovals: transactions.filter((t) => t.status === "complete").length,
  };
}

export const categoryLabels: Record<ExpenseCategory, string> = {
  meals: "Meals & Dining",
  transport: "Transport",
  accommodation: "Accommodation",
  office_supplies: "Office Supplies",
  software: "Software & SaaS",
  client_entertainment: "Client Entertainment",
  travel: "Travel",
  other: "Other",
};

export const statusLabels: Record<TransactionStatus, string> = {
  receipt_needed: "Receipt Needed",
  receipt_uploaded: "Processing",
  complete: "Complete",
  flagged: "Flagged",
  approved: "Approved",
  rejected: "Rejected",
};

export const statusColors: Record<TransactionStatus, string> = {
  receipt_needed: "bg-amber-100 text-amber-800",
  receipt_uploaded: "bg-blue-100 text-blue-800",
  complete: "bg-emerald-100 text-emerald-800",
  flagged: "bg-red-100 text-red-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
};
