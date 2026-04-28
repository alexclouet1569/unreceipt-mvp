import { describe, expect, it } from "vitest";
import {
  employees,
  getCompanyStats,
  getEmployeeById,
  getTransactionsForEmployee,
  transactions,
} from "@/lib/mock-data";

describe("mock-data helpers", () => {
  it("getEmployeeById returns the employee or undefined", () => {
    expect(getEmployeeById("emp-1")?.name).toBe("Marie Dupont");
    expect(getEmployeeById("does-not-exist")).toBeUndefined();
  });

  it("getTransactionsForEmployee filters by employeeId", () => {
    const ids = new Set(employees.map((e) => e.id));
    for (const id of ids) {
      const txns = getTransactionsForEmployee(id);
      for (const txn of txns) {
        expect(txn.employeeId).toBe(id);
      }
    }
  });

  it("getCompanyStats sums the dataset and never divides by zero", () => {
    const stats = getCompanyStats();
    const sum = transactions.reduce((acc, t) => acc + t.amount, 0);
    expect(stats.totalExpensesThisMonth).toBeCloseTo(sum, 2);
    expect(stats.totalTransactions).toBe(transactions.length);
    expect(stats.complianceRate).toBeGreaterThanOrEqual(0);
    expect(stats.complianceRate).toBeLessThanOrEqual(100);
  });
});
