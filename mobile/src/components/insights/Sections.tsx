// The Insights screen below the chart: where the money goes (one stacked
// bar + a row per category), the top merchants, the findings, the VAT on
// the receipts and what isn't in the numbers. Hairline cards, no shadow;
// mint only for the VAT panel (DESIGN.md); amounts in Geist Mono.

import { StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import type { AnalyticsCategory, AnalyticsInsight, AnalyticsMerchant } from "@/lib/mobile/types";
import { fill, locale, s } from "../../i18n";
import { formatMoney } from "../../lib/format";
import {
  categoryColor,
  changeText,
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

function detailLine(count: number, share: number | null, current: number, previous: number | null): string {
  const parts = [plural(count, s.insights.receiptsOne, s.insights.receiptsOther)];
  if (share != null) parts.push(shareText(share, locale));
  const change = changeText(current, previous, locale);
  if (change) parts.push(change);
  return parts.join(" · ");
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
  const shown = a.categories.filter((c) => c.count > 0);
  if (shown.length === 0) return null;
  const withAmount = shown.filter((c) => c.amount > 0);
  return (
    <View>
      <SectionTitle>{s.insights.whereTitle}</SectionTitle>
      {withAmount.length > 0 ? (
        <View style={styles.stack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {withAmount.map((c) => (
            <View key={c.category} style={{ flex: Math.max(c.share, 0.01), backgroundColor: categoryColor(c.category, scheme) }} />
          ))}
        </View>
      ) : null}
      <View style={styles.card}>
        {shown.map((c, i) => {
          const detail = detailLine(c.count, c.amount > 0 ? c.share : null, c.amount, c.previous);
          const name = s.categories[c.category];
          return (
            <Row
              key={c.category}
              first={i === 0}
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

export function Merchants({ a, onOpen }: { a: ReadyAnalytics; onOpen: (m: AnalyticsMerchant) => void }) {
  const styles = useStyles();
  const colors = useColors();
  if (a.merchants.length === 0) return null;
  return (
    <View>
      <SectionTitle>{s.insights.merchantsTitle}</SectionTitle>
      <View style={styles.card}>
        {a.merchants.map((m, i) => {
          const detail = detailLine(m.count, null, m.amount, m.previous);
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
  const v = a.vat;
  if (v.total === 0 && v.withoutVat === 0 && v.foreign === 0) return null;
  return (
    <View>
      <SectionTitle>{s.insights.vatTitle}</SectionTitle>
      <View style={styles.vat}>
        <Leader label={s.insights.vatTotal} amount={v.total} currency={a.currency} strong />
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
      </View>
    </View>
  );
}

export function Quality({
  a,
  onOpen,
}: {
  a: ReadyAnalytics;
  onOpen: (which: "missing_amount" | "unconverted") => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const q = a.quality;
  const items: { key: string; text: string; open?: () => void }[] = [];
  if (q.missingAmount > 0)
    items.push({
      key: "m",
      text: plural(q.missingAmount, s.insights.qualityMissingOne, s.insights.qualityMissingOther),
      open: () => onOpen("missing_amount"),
    });
  if (q.unconverted > 0)
    items.push({
      key: "u",
      text: plural(q.unconverted, s.insights.qualityUnconvertedOne, s.insights.qualityUnconvertedOther),
      open: () => onOpen("unconverted"),
    });
  if (q.undated > 0) items.push({ key: "d", text: plural(q.undated, s.insights.qualityUndatedOne, s.insights.qualityUndatedOther) });
  if (items.length === 0) return null;
  return (
    <View>
      <SectionTitle>{s.insights.qualityTitle}</SectionTitle>
      <View style={styles.card}>
        {items.map((it, i) =>
          it.open ? (
            <PressableScale
              key={it.key}
              scaleTo={0.99}
              onPress={it.open}
              accessibilityRole="button"
              style={[styles.qualityRow, i > 0 && styles.divider]}
            >
              <Text variant="body" style={styles.middle}>
                {it.text}
              </Text>
              <Chevron />
            </PressableScale>
          ) : (
            <View key={it.key} style={[styles.qualityRow, i > 0 && styles.divider]}>
              <Text variant="body" color={colors.inkMuted} style={styles.middle}>
                {it.text}
              </Text>
            </View>
          ),
        )}
      </View>
    </View>
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
  stack: {
    flexDirection: "row",
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
    marginHorizontal: space.lg,
    marginBottom: space.md,
    gap: 2,
  },
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
    padding: space.lg,
    gap: space.sm,
  },
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
  qualityRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52, paddingVertical: 10, paddingHorizontal: 14 },
}));
