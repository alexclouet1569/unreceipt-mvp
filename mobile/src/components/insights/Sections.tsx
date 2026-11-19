// The Analysis screen under the summary: by category (a donut + a row per
// category), the top merchants, the highlights, the VAT on the receipts
// (closed until asked) and the receipts in no period. Hairline cards, no
// shadow; mint only for the VAT panel (DESIGN.md); amounts in Geist Mono.

import { useState } from "react";
import { View } from "react-native";
import { SymbolView } from "expo-symbols";
import type { AnalyticsCategory, AnalyticsInsight, AnalyticsMerchant } from "@/lib/mobile/types";
import { fill, locale, s } from "../../i18n";
import { formatMoney } from "../../lib/format";
import {
  categoryColor,
  fillParts,
  insightFilter,
  insightText,
  partsText,
  percentText,
  plural,
  shareText,
  type ReadyAnalytics,
} from "../../lib/insights";
import { getMerchantColor, getMerchantInitials } from "../../lib/merchant";
import { fonts, radius, space, makeStyles, useColors, useScheme } from "../../theme";
import { Money } from "../Money";
import { PressableScale } from "../PressableScale";
import { Text } from "../Text";
import { Donut } from "./Charts";
import { Parts } from "./Parts";

export function SectionTitle({ children }: { children: string }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <Text variant="micro" color={colors.inkMuted} accessibilityRole="header" style={styles.sectionTitle}>
      {children}
    </Text>
  );
}

function Chevron() {
  const colors = useColors();
  return <SymbolView name="chevron.right" size={12} weight="semibold" tintColor={colors.inkFaint} />;
}

/** One row of a hairline card: what, how much, a second line, a chevron. */
function Row({
  first,
  left,
  title,
  detail,
  amount,
  currency,
  onPress,
  label,
}: {
  first: boolean;
  left: React.ReactNode;
  title: string;
  detail: string;
  amount: number;
  currency: string;
  onPress: () => void;
  label: string;
}) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <PressableScale
      scaleTo={0.99}
      unstable_pressDelay={60}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.row, !first && styles.divider]}
    >
      {left}
      <View style={styles.middle}>
        <Text variant="merchant" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" color={colors.inkMuted} numberOfLines={2}>
          {detail}
        </Text>
      </View>
      <Money amount={amount} currency={currency} size="row" />
      <Chevron />
    </PressableScale>
  );
}

/** "42 % · 3 receipts" under a category's or a merchant's name. */
function detailLine(count: number, share: number | null): string {
  const receipts = plural(count, s.insights.receiptsOne, s.insights.receiptsOther);
  return share != null && share > 0 ? `${shareText(share, locale)} · ${receipts}` : receipts;
}

export function Categories({
  a,
  onOpen,
}: {
  a: ReadyAnalytics;
  onOpen: (c: AnalyticsCategory) => void;
}) {
  const scheme = useScheme();
  const styles = useStyles();
  const [selected, setSelected] = useState<string | null>(null);
  const shown = a.categories.filter((c) => c.count > 0);
  if (shown.length === 0) return null;
  const withAmount = shown.filter((c) => c.amount > 0);
  const picked = withAmount.find((c) => c.category === selected) ?? null;
  return (
    <View>
      <SectionTitle>{s.insights.whereTitle}</SectionTitle>
      <View style={styles.card}>
        {withAmount.length > 0 ? (
          <View style={styles.donutWrap}>
            <Donut
              slices={withAmount.map((c) => ({ key: c.category, share: c.share, color: categoryColor(c.category, scheme) }))}
              amount={picked ? picked.amount : a.total.amount}
              currency={a.currency}
              caption={
                picked
                  ? `${s.categories[picked.category]} · ${shareText(picked.share, locale)}`
                  : plural(withAmount.length, s.insights.categoriesOne, s.insights.categoriesOther)
              }
              selected={picked?.category ?? null}
              onSelect={setSelected}
            />
          </View>
        ) : null}
        {shown.map((c, i) => {
          const detail = detailLine(c.count, c.amount > 0 ? c.share : null);
          const name = s.categories[c.category];
          return (
            <Row
              key={c.category}
              first={i === 0 && withAmount.length === 0}
              left={<View style={[styles.dot, { backgroundColor: categoryColor(c.category, scheme) }]} />}
              title={name}
              detail={detail}
              amount={c.amount}
              currency={a.currency}
              onPress={() => onOpen(c)}
              label={`${name}, ${formatMoney(c.amount, a.currency, locale)}, ${detail}`}
            />
          );
        })}
      </View>
    </View>
  );
}

/** Top merchants shown before "Show more" (all of them when only one more would hide). */
const MERCHANTS_SHOWN = 5;

export function Merchants({ a, onOpen }: { a: ReadyAnalytics; onOpen: (m: AnalyticsMerchant) => void }) {
  const styles = useStyles();
  const colors = useColors();
  const [all, setAll] = useState(false);
  if (a.merchants.length === 0) return null;
  const more = a.merchants.length > MERCHANTS_SHOWN + 1 ? a.merchants.length - MERCHANTS_SHOWN : 0;
  const list = all || more === 0 ? a.merchants : a.merchants.slice(0, MERCHANTS_SHOWN);
  return (
    <View>
      <SectionTitle>{s.insights.merchantsTitle}</SectionTitle>
      <View style={styles.card}>
        {list.map((m, i) => {
          // Answers cached before merchants carried a share: worked out here.
          const share = m.share ?? (a.total.amount > 0 ? m.amount / a.total.amount : 0);
          const detail = detailLine(m.count, share);
          return (
            <Row
              key={m.key}
              first={i === 0}
              left={
                <View style={[styles.block, { backgroundColor: getMerchantColor(m.name) }]}>
                  <Text style={styles.initials} color={colors.white}>
                    {getMerchantInitials(m.name)}
                  </Text>
                </View>
              }
              title={m.name}
              detail={detail}
              amount={m.amount}
              currency={a.currency}
              onPress={() => onOpen(m)}
              label={`${m.name}, ${formatMoney(m.amount, a.currency, locale)}, ${detail}`}
            />
          );
        })}
        {more > 0 ? (
          <PressableScale
            scaleTo={0.99}
            onPress={() => setAll((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: all }}
            style={[styles.more, styles.divider]}
          >
            <Text variant="caption" color={colors.ink} style={styles.moreText}>
              {all ? s.insights.showFewer : fill(s.insights.showMore, { count: more })}
            </Text>
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}

const FINDING_ICON: Record<AnalyticsInsight["kind"], string> = {
  duplicates: "doc.on.doc",
  category_up: "arrow.up.right",
  recurring: "arrow.triangle.2.circlepath",
  new_merchant: "sparkle",
  largest: "chart.bar",
  representation: "person.2",
};

export function Findings({
  a,
  onOpen,
}: {
  a: ReadyAnalytics;
  onOpen: (i: AnalyticsInsight) => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  if (a.insights.length === 0) return null;
  return (
    <View>
      <SectionTitle>{s.insights.findingsTitle}</SectionTitle>
      <View style={styles.findings}>
        {a.insights.map((i, n) => {
          const t = insightText(i, a.currency, locale, s);
          // Duplicates ask for something: honey, as every "needs you" in the app.
          const attention = i.kind === "duplicates";
          const opens = insightFilter(i) != null;
          return (
            <PressableScale
              key={`${i.kind}-${n}`}
              scaleTo={opens ? 0.985 : 1}
              disabled={!opens}
              onPress={() => onOpen(i)}
              accessibilityRole={opens ? "button" : "text"}
              accessibilityLabel={`${t.title}. ${partsText(t.body)}`}
              style={[styles.finding, attention && styles.findingAttention]}
            >
              <View style={styles.findingIcon}>
                <SymbolView
                  name={FINDING_ICON[i.kind] as "sparkle"}
                  size={16}
                  weight="semibold"
                  tintColor={attention ? colors.attentionDeep : colors.ink}
                />
              </View>
              <View style={styles.middle}>
                <Text variant="merchant" color={attention ? colors.attentionDeep : colors.ink}>
                  {t.title}
                </Text>
                <Parts parts={t.body} />
              </View>
              {opens ? <Chevron /> : null}
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

function Leader({ label, amount, currency, strong = false }: { label: string; amount: number; currency: string; strong?: boolean }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.leader} accessible accessibilityLabel={`${label}: ${formatMoney(amount, currency, locale)}`}>
      <Text variant={strong ? "merchant" : "caption"} color={strong ? colors.ink : colors.inkMuted} style={styles.leaderLabel}>
        {label}
      </Text>
      <Money amount={amount} currency={currency} size="row" />
    </View>
  );
}

const rateText = (rate: number | null) =>
  rate == null ? s.insights.vatRateUnknown : fill(s.insights.vatRate, { rate: percentText(rate, locale) });

export function VatPanel({ a, onToCheck }: { a: ReadyAnalytics; onToCheck: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  // Closed until asked: one line with the total, the detail on a tap.
  const [open, setOpen] = useState(false);
  const v = a.vat;
  if (v.total === 0 && v.withoutVat === 0 && v.foreign === 0) return null;
  return (
    <View>
      <SectionTitle>{s.insights.vatSection}</SectionTitle>
      <View style={[styles.vat, open && styles.vatOpen]}>
        <PressableScale
          scaleTo={0.99}
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${s.insights.vatTitle}: ${formatMoney(v.total, a.currency, locale)}`}
          style={styles.vatHead}
        >
          <Text variant="merchant" style={styles.leaderLabel}>
            {s.insights.vatTitle}
          </Text>
          <Money amount={v.total} currency={a.currency} size="row" />
          <SymbolView name={open ? "chevron.down" : "chevron.right"} size={12} weight="semibold" tintColor={colors.inkMuted} />
        </PressableScale>
        {open ? (
          <>
        {v.rates.map((r) => (
          <View key={String(r.rate)} style={styles.rateRow}>
            <Leader label={rateText(r.rate)} amount={r.vat} currency={a.currency} />
            {r.net != null ? (
              <Parts
                parts={fillParts(s.insights.vatNet, {}, { amount: formatMoney(r.net, a.currency, locale) })}
                amountColor={colors.inkMuted}
                style={styles.net}
              />
            ) : null}
          </View>
        ))}
        {v.mode === "se" ? (
          <View style={styles.vatSplit}>
            {v.swedish != null ? <Leader label={s.insights.vatSwedish} amount={v.swedish} currency={a.currency} /> : null}
            {v.representation ? <Leader label={s.insights.vatRepresentation} amount={v.representation} currency={a.currency} /> : null}
            {v.toCheck && v.toCheck.count > 0 ? (
              <PressableScale
                scaleTo={0.99}
                onPress={onToCheck}
                accessibilityRole="button"
                accessibilityLabel={`${s.insights.vatToCheck} (${v.toCheck.count}): ${formatMoney(v.toCheck.amount, a.currency, locale)}`}
                style={styles.toCheck}
              >
                <View style={styles.leader} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                  <Text variant="caption" color={colors.ink} style={styles.leaderLabel}>
                    {`${s.insights.vatToCheck} (${v.toCheck.count})`}
                  </Text>
                  <Money amount={v.toCheck.amount} currency={a.currency} size="row" />
                  <Chevron />
                </View>
              </PressableScale>
            ) : null}
          </View>
        ) : null}
        <Text variant="caption" color={colors.inkMuted} style={styles.vatNote}>
          {v.mode === "se" ? s.insights.vatNoteSe : s.insights.vatNoteOther}
        </Text>
        {v.withoutVat > 0 ? (
          <Text variant="caption" color={colors.inkMuted}>
            {plural(v.withoutVat, s.insights.vatWithoutOne, s.insights.vatWithoutOther)}
          </Text>
        ) : null}
        {v.foreign > 0 ? (
          <Text variant="caption" color={colors.inkMuted}>
            {plural(v.foreign, s.insights.vatForeignOne, s.insights.vatForeignOther)}
          </Text>
        ) : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

/** Receipts without a date are in no period: said once, under everything. */
export function Undated({ a }: { a: ReadyAnalytics }) {
  const styles = useStyles();
  const colors = useColors();
  if (a.quality.undated === 0) return null;
  return (
    <Text variant="caption" color={colors.inkMuted} style={styles.undated}>
      {plural(a.quality.undated, s.insights.qualityUndatedOne, s.insights.qualityUndatedOther)}
    </Text>
  );
}

const useStyles = makeStyles((colors) => ({
  sectionTitle: { marginHorizontal: space.lg, marginTop: space.xl, marginBottom: space.sm },
  card: {
    marginHorizontal: space.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 60, paddingVertical: 10, paddingHorizontal: 14 },
  divider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  middle: { flex: 1, gap: 2 },
  donutWrap: { paddingVertical: space.lg, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  more: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  moreText: { fontFamily: fonts.semibold },
  dot: { width: 12, height: 12, borderRadius: 6 },
  block: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  initials: { fontFamily: fonts.bold, fontSize: 13 },
  findings: { marginHorizontal: space.lg, gap: space.sm },
  finding: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  findingAttention: { borderLeftWidth: 3, borderLeftColor: colors.attention },
  findingIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  vat: {
    marginHorizontal: space.lg,
    backgroundColor: colors.brandTint,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  vatOpen: { paddingBottom: space.lg },
  vatHead: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52 },
  leader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md },
  leaderLabel: { flexShrink: 1 },
  rateRow: { gap: 0 },
  net: { textAlign: "right" },
  vatSplit: {
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.attentionMint,
    paddingTop: space.sm,
    marginTop: space.xs,
  },
  toCheck: { minHeight: 44, justifyContent: "center" },
  vatNote: { marginTop: space.xs },
  undated: { marginHorizontal: space.lg, marginTop: space.xl },
}));
