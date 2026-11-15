// Clients (accounting firm staff): every client company with this month's
// counts (receipts, to check, ready, new this week), the invites still
// waiting, and two actions: Invite a client, and the firm's link with its
// QR code. A client opens its month. The website's /firm/clients, from the
// same loaders (GET /api/mobile/firm). Exports, bank statements and
// settings stay on the website.

import { useCallback } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Button } from "../../../components/Button";
import { Group, Row, Section, SectionNote } from "../../../components/Grouped";
import { ReceiptSkeleton } from "../../../components/Skeleton";
import { Text } from "../../../components/Text";
import { fill, locale, s } from "../../../i18n";
import { dayMonthYear } from "../../../lib/format";
import { useFirm } from "../../../lib/FirmProvider";
import { space, makeStyles, useColors } from "../../../theme";

export default function Clients() {
  const styles = useStyles();
  const colors = useColors();
  const { firm, error, refreshing, refresh } = useFirm();

  // Counts change while a receipt is completed in this tab: ask again on return.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing && firm != null} onRefresh={() => void refresh()} tintColor={colors.inkMuted} />}
    >
      <View style={styles.heading}>
        <Text variant="displayLg" accessibilityRole="header">
          {firm?.firmName ?? s.firm.title}
        </Text>
      </View>
      {error ? (
        <Text variant="caption" color={colors.attentionDeep} style={styles.note}>
          {error === "offline" ? s.common.unreachable : s.firm.loadFailed}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <View style={styles.action}>
          <Button label={s.firm.invite} kind="ink" onPress={() => router.push("/clients/invite")} />
        </View>
        <View style={styles.action}>
          <Button label={s.firm.link} kind="outline" onPress={() => router.push("/clients/link")} />
        </View>
      </View>

      {!firm && !error ? <ReceiptSkeleton rows={4} /> : null}

      {firm && firm.clients.length === 0 ? (
        <Text variant="body" color={colors.inkMuted} style={styles.note}>
          {s.firm.empty}
        </Text>
      ) : null}

      {firm && firm.clients.length > 0 ? (
        <Section title={s.firm.title}>
          <Group>
            {firm.clients.map((c, i) => (
              <Row
                key={c.organizationId}
                first={i === 0}
                label={c.name}
                detail={fill(s.firm.clientCounts, { total: c.total, review: c.reviewNeeded, ready: c.ready })}
                detailColor={c.reviewNeeded > 0 ? colors.attentionDeep : undefined}
                value={c.newThisWeek > 0 ? fill(s.firm.newThisWeek, { count: c.newThisWeek }) : null}
                onPress={() =>
                  router.push({ pathname: "/clients/client/[orgId]", params: { orgId: c.organizationId, name: c.name } })
                }
              />
            ))}
          </Group>
        </Section>
      ) : null}

      {firm && firm.pending.length > 0 ? (
        <Section title={s.firm.waiting}>
          <Group>
            {firm.pending.map((p, i) => {
              const d = new Date(p.invitedAt);
              const when = Number.isNaN(d.getTime()) ? "" : fill(s.firm.invitedOn, { date: dayMonthYear(d, locale) });
              return (
                <Row
                  key={p.id}
                  first={i === 0}
                  label={p.name}
                  detail={`${p.email}${when ? ` · ${when}` : ""}${p.expired ? ` · ${s.firm.expired}` : ""}`}
                />
              );
            })}
          </Group>
        </Section>
      ) : null}

      <SectionNote text={s.firm.onTheWeb} />
    </ScrollView>
  );
}

const useStyles = makeStyles(() => ({
  content: { paddingBottom: space.xxxl, gap: space.lg },
  heading: { marginHorizontal: space.lg, marginTop: space.lg },
  note: { marginHorizontal: space.lg },
  actions: { flexDirection: "row", gap: space.sm, marginHorizontal: space.lg },
  action: { flex: 1 },
}));
