// One client's month on the Clients tab (accounting firm staff): the
// month's receipts the firm may see (a mailbox receipt only once the owner
// confirmed it), what needs checking, the Monday reminder's state and
// "Send a reminder now". A receipt opens the Receipts tab's own screen in
// this tab, where the accountant completes or corrects it (no Delete: only
// the owner deletes). GET /api/mobile/firm/clients/<orgId>, the same loaders
// as the website's client page.

import { useCallback, useEffect, useState } from "react";
import { AccessibilityInfo, Alert, RefreshControl, ScrollView, View } from "react-native";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import type { MobileFirmClientMonth, MobileReceipt } from "@/lib/mobile/types";
import { Button } from "../../../../components/Button";
import { Group, Row, Section, SectionNote } from "../../../../components/Grouped";
import { PeriodHeader } from "../../../../components/insights/PeriodHeader";
import { ReceiptRow } from "../../../../components/ReceiptRow";
import { ReceiptSkeleton } from "../../../../components/Skeleton";
import { Text } from "../../../../components/Text";
import { fill, locale, s } from "../../../../i18n";
import { ApiError, getFirmClientMonth, sendClientReminder } from "../../../../lib/api";
import { dayMonthYear } from "../../../../lib/format";
import { currentMonth, monthTitle, shiftMonth } from "../../../../lib/firmMonth";
import { useHome } from "../../../../lib/HomeProvider";
import { space, makeStyles, useColors } from "../../../../theme";

const labelOf = (month: string) => monthTitle(month, locale);

export default function ClientMonth() {
  const styles = useStyles();
  const colors = useColors();
  const { orgId, name } = useLocalSearchParams<{ orgId: string; name?: string }>();
  const { extra, rememberReceipts } = useHome();
  const [month, setMonth] = useState(() => currentMonth());
  const [data, setData] = useState<MobileFirmClientMonth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await getFirmClientMonth(orgId, month);
      // The receipts open, change and confirm like any other (HomeProvider's
      // extra), never counted in the user's own list.
      rememberReceipts(res.receipts);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError && err.kind === "offline" ? s.common.unreachable : s.firm.clientLoadFailed);
    } finally {
      setRefreshing(false);
    }
  }, [orgId, month, rememberReceipts]);

  // On first open, on a month change, and back from a receipt (it may be complete now).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(error);
  }, [error]);

  const clientName = data?.clientName ?? name ?? s.firm.title;
  // No future months: nothing can be printed in them yet (as Insights).
  const atCurrent = month >= currentMonth();
  // The phone's copy when a receipt was just edited here, else the server's.
  const receipts: MobileReceipt[] =
    data?.month === month ? data.receipts.map((r) => extra.find((e) => e.id === r.id) ?? r) : [];
  const toCheck = receipts.filter((r) => r.status === "pending_review").length;
  const ready = receipts.filter((r) => r.status === "verified" && !r.exportedAt).length;
  const exported = receipts.filter((r) => r.exportedAt).length;

  const remind = async () => {
    if (sending || !data) return;
    setSending(true);
    try {
      const res = await sendClientReminder(orgId);
      if (res.status === 200) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(fill(s.firm.remindSent, { client: clientName }));
        void load();
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        res.status === 429
          ? fill(s.firm.remindTooMany, { client: clientName })
          : res.error === "nothing_to_ask"
            ? s.firm.remindNothing
            : res.error === "opted_out"
              ? fill(s.firm.weeklyOptedOut, { client: clientName })
              : res.error === "no_recipient"
                ? fill(s.firm.remindNoRecipient, { client: clientName })
                : s.firm.remindFailed,
      );
    } catch (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(err instanceof ApiError && err.kind === "offline" ? s.common.unreachable : s.firm.remindFailed);
    } finally {
      setSending(false);
    }
  };

  const reminderText = data
    ? data.reminders.clientOptedOut
      ? fill(s.firm.weeklyOptedOut, { client: clientName })
      : `${data.reminders.weekly ? s.firm.weeklyOn : s.firm.weeklyOff}.${
          data.reminders.lastSentAt
            ? ` ${fill(s.firm.lastReminded, { date: dayMonthYear(new Date(data.reminders.lastSentAt), locale) })}`
            : ""
        }`
    : null;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing && data != null} onRefresh={() => void load()} tintColor={colors.inkMuted} />}
    >
      <Stack.Screen options={{ title: clientName }} />

      <PeriodHeader
        title={labelOf(month)}
        onPrevious={() => {
          const next = shiftMonth(month, -1);
          setMonth(next);
          AccessibilityInfo.announceForAccessibility(labelOf(next));
        }}
        onNext={
          atCurrent
            ? null
            : () => {
                const next = shiftMonth(month, 1);
                setMonth(next);
                AccessibilityInfo.announceForAccessibility(labelOf(next));
              }
        }
      />

      {error ? (
        <Text variant="caption" color={colors.attentionDeep} style={styles.pad}>
          {error}
        </Text>
      ) : null}

      {data?.month === month ? (
        <View style={styles.pad}>
          <Group>
            <Row first label={s.firm.toCheck} value={String(toCheck)} />
            <Row label={s.firm.ready} value={String(ready)} />
            <Row label={s.firm.exported} value={String(exported)} />
          </Group>
        </View>
      ) : null}

      {/* The receipt rows carry the list's own side margin (ReceiptRow). */}
      <View>
        <View style={styles.pad}>
          <Section title={fill(s.firm.receiptsIn, { month: labelOf(month) })}>
            {data?.month === month && receipts.length === 0 ? (
              <Text variant="body" color={colors.inkMuted}>
                {s.firm.emptyMonth}
              </Text>
            ) : null}
          </Section>
        </View>
        {data?.month !== month && !error ? <ReceiptSkeleton rows={4} /> : null}
        {receipts.map((r) => (
          <ReceiptRow
            key={r.id}
            receipt={r}
            onPress={() => router.push({ pathname: "/clients/receipt/[id]", params: { id: r.id } })}
          />
        ))}
      </View>

      {reminderText ? (
        <View style={[styles.pad, styles.reminder]}>
          <Text variant="caption" color={colors.inkMuted}>
            {reminderText}
          </Text>
          {data && !data.reminders.clientOptedOut ? (
            <Button label={s.firm.remindNow} kind="outline" busy={sending} disabled={sending} onPress={() => void remind()} />
          ) : null}
        </View>
      ) : null}

      <View style={styles.pad}>
        <SectionNote text={s.firm.onTheWeb} />
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles(() => ({
  content: { paddingBottom: space.xxxl, gap: space.lg },
  // The same side margin as the receipt rows and the Account tab's groups.
  pad: { marginHorizontal: space.lg },
  reminder: { gap: space.sm },
}));
