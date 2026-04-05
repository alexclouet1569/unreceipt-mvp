"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Receipt,
  ArrowLeft,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Users,
  Euro,
  FileCheck,
  Download,
  Smartphone,
  X,
} from "lucide-react";
import {
  transactions,
  employees,
  getCompanyStats,
  getTransactionsForEmployee,
  statusColors,
  statusLabels,
  categoryLabels,
} from "@/lib/mock-data";

export default function FinanceDashboardPage() {
  const stats = getCompanyStats();
  const [selectedTab, setSelectedTab] = useState("overview");

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Receipt className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm">UnReceipt</span>
            <Badge variant="secondary" className="text-xs">
              Finance
            </Badge>
          </div>
          <Link href="/demo/employee">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
              <Smartphone className="w-3.5 h-3.5" />
              Employee
            </Button>
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold">Expense Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              ACME Corp &middot; April 2026
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2 w-fit">
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="py-5 px-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Euro className="w-4 h-4 text-primary" />
                </div>
                <span className="text-xs text-muted-foreground font-medium">
                  Total Spend
                </span>
              </div>
              <p className="text-2xl font-bold">
                {stats.totalExpensesThisMonth.toFixed(0)}&euro;
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.totalTransactions} transactions
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5 px-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <FileCheck className="w-4 h-4 text-emerald-700" />
                </div>
                <span className="text-xs text-muted-foreground font-medium">
                  Compliance
                </span>
              </div>
              <p className="text-2xl font-bold">{stats.complianceRate}%</p>
              <Progress value={stats.complianceRate} className="mt-2 h-1.5" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5 px-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-blue-700" />
                </div>
                <span className="text-xs text-muted-foreground font-medium">
                  Avg. Capture
                </span>
              </div>
              <p className="text-2xl font-bold">
                {stats.averageCaptureTimeMinutes} min
              </p>
              <p className="text-xs text-primary mt-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                vs. industry 5-14 days
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5 px-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                </div>
                <span className="text-xs text-muted-foreground font-medium">
                  Pending
                </span>
              </div>
              <p className="text-2xl font-bold">{stats.pendingApprovals}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Awaiting approval
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList>
            <TabsTrigger value="overview">Team Overview</TabsTrigger>
            <TabsTrigger value="expenses">All Expenses</TabsTrigger>
            <TabsTrigger value="flagged">Flagged</TabsTrigger>
          </TabsList>

          {/* Team Overview */}
          <TabsContent value="overview" className="mt-6">
            <div className="space-y-3">
              {employees.map((emp) => {
                const empTxns = getTransactionsForEmployee(emp.id);
                const total = empTxns.reduce((sum, t) => sum + t.amount, 0);
                const needsAction = empTxns.filter(
                  (t) =>
                    t.status === "receipt_needed" || t.status === "flagged"
                ).length;

                return (
                  <Card key={emp.id}>
                    <CardContent className="py-4 px-5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                          {emp.avatarInitials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm">{emp.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {emp.role} &middot; {emp.department}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-sm">
                                {total.toFixed(0)}&euro;
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {empTxns.length} expenses
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 mt-2">
                            <div className="flex items-center gap-1.5 flex-1">
                              <Progress
                                value={emp.receiptComplianceRate}
                                className="h-1.5 flex-1"
                              />
                              <span className="text-xs text-muted-foreground w-8">
                                {emp.receiptComplianceRate}%
                              </span>
                            </div>
                            {needsAction > 0 && (
                              <Badge
                                variant="secondary"
                                className="bg-amber-100 text-amber-800 text-xs"
                              >
                                {needsAction} pending
                              </Badge>
                            )}
                            {needsAction === 0 && (
                              <Badge
                                variant="secondary"
                                className="bg-emerald-100 text-emerald-800 text-xs"
                              >
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Complete
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* All Expenses */}
          <TabsContent value="expenses" className="mt-6">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left text-xs font-medium text-muted-foreground py-3 px-4">
                          Employee
                        </th>
                        <th className="text-left text-xs font-medium text-muted-foreground py-3 px-4">
                          Merchant
                        </th>
                        <th className="text-left text-xs font-medium text-muted-foreground py-3 px-4">
                          Category
                        </th>
                        <th className="text-right text-xs font-medium text-muted-foreground py-3 px-4">
                          Amount
                        </th>
                        <th className="text-left text-xs font-medium text-muted-foreground py-3 px-4">
                          Date
                        </th>
                        <th className="text-left text-xs font-medium text-muted-foreground py-3 px-4">
                          Status
                        </th>
                        <th className="text-center text-xs font-medium text-muted-foreground py-3 px-4">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((txn) => {
                        const emp = employees.find(
                          (e) => e.id === txn.employeeId
                        );
                        return (
                          <tr
                            key={txn.id}
                            className="border-b border-border last:border-0 hover:bg-muted/30"
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold">
                                  {emp?.avatarInitials}
                                </div>
                                <span className="text-sm">
                                  {emp?.name}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-sm">
                              {txn.merchantName}
                            </td>
                            <td className="py-3 px-4 text-xs text-muted-foreground">
                              {categoryLabels[txn.merchantCategory]}
                            </td>
                            <td className="py-3 px-4 text-sm font-medium text-right tabular-nums">
                              {txn.amount.toFixed(2)}&euro;
                            </td>
                            <td className="py-3 px-4 text-xs text-muted-foreground">
                              {txn.date}
                            </td>
                            <td className="py-3 px-4">
                              <Badge
                                variant="secondary"
                                className={`text-xs ${statusColors[txn.status]}`}
                              >
                                {statusLabels[txn.status]}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-center">
                              {(txn.status === "complete") && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs h-7 text-primary"
                                >
                                  Approve
                                </Button>
                              )}
                              {txn.status === "flagged" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs h-7 text-amber-600"
                                >
                                  Remind
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Flagged */}
          <TabsContent value="flagged" className="mt-6">
            <div className="space-y-3">
              {transactions
                .filter(
                  (t) =>
                    t.status === "flagged" || t.policyViolation
                )
                .map((txn) => {
                  const emp = employees.find(
                    (e) => e.id === txn.employeeId
                  );
                  return (
                    <Card
                      key={txn.id}
                      className="border-destructive/20"
                    >
                      <CardContent className="py-4 px-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5">
                              <AlertTriangle className="w-4 h-4 text-destructive" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">
                                {txn.merchantName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {emp?.name} &middot; {txn.date}
                              </p>
                              {txn.policyViolation && (
                                <p className="text-xs text-destructive mt-1">
                                  {txn.policyViolation}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-semibold text-sm">
                              {txn.amount.toFixed(2)}&euro;
                            </p>
                            <div className="flex gap-1 mt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7"
                              >
                                Remind
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs h-7 text-destructive"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              {transactions.filter(
                (t) => t.status === "flagged" || t.policyViolation
              ).length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-primary" />
                  <p className="text-sm">No flagged expenses. Looking good!</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Demo note */}
        <div className="mt-12 text-center">
          <Separator className="mb-6" />
          <p className="text-xs text-muted-foreground">
            This is a prototype with mock data.{" "}
            <Link href="/#waitlist" className="text-primary hover:underline">
              Join the waitlist
            </Link>{" "}
            for the real thing.
          </p>
        </div>
      </div>
    </div>
  );
}
