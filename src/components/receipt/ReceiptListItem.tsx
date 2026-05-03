"use client";

import {
  Car,
  Hotel,
  MapPin,
  Monitor,
  ShoppingBag,
  Train,
  Users,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  CATEGORY_CONFIG,
  type CategoryIconName,
  formatAmount,
  formatDate,
} from "@/lib/receipt-format";
import type { Receipt } from "@/lib/types";

const ICONS: Record<CategoryIconName, LucideIcon> = {
  Utensils,
  Car,
  Hotel,
  ShoppingBag,
  Monitor,
  Users,
  Train,
  MapPin,
};

type ReceiptListItemProps = {
  receipt: Receipt;
  onClick?: () => void;
};

export function ReceiptListItem({ receipt, onClick }: ReceiptListItemProps) {
  const config = CATEGORY_CONFIG[receipt.category];
  const Icon = ICONS[config.icon];
  const interactive = Boolean(onClick);

  return (
    <Card
      className={interactive ? "cursor-pointer hover:border-primary/30 transition-colors" : ""}
      onClick={onClick}
    >
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-sm truncate">
                {receipt.merchant_name ?? "Unknown merchant"}
              </p>
              <p className="font-semibold text-sm tabular-nums shrink-0">
                {formatAmount(receipt.total, receipt.currency)}
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 mt-1">
              <span className="text-xs text-muted-foreground">
                {formatDate(receipt.receipt_date)}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${config.badgeClass}`}
              >
                {config.label}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
