// Signed in: the real iOS tab bar (UITabBarController, Liquid Glass on
// iOS 26). Accounting firm staff get a Clients tab (2026-11-15): next to
// Receipts, Insights and Account when they also have a company, or with
// Account alone when the firm is all they use UnReceipt for. Someone whose
// firm seat still waits to be joined on the website, and accounts without a
// plan, get a calm full screen instead (see StatusScreen).

import { NativeTabs } from "expo-router/native-tabs";
import { StatusScreen } from "../../components/StatusScreen";
import { AccountProvider } from "../../lib/AccountProvider";
import { s } from "../../i18n";
import { FirmProvider } from "../../lib/FirmProvider";
import { HomeProvider, useHome } from "../../lib/HomeProvider";
import { MailboxesProvider } from "../../lib/MailboxesProvider";
import { ReceiptActionsProvider } from "../../lib/ReceiptActions";
import { ScanProvider } from "../../lib/scans/ScanProvider";
import { overallCounts } from "../../lib/summary";
import { useColors } from "../../theme";

function Tabs() {
  const colors = useColors();
  const { home } = useHome();
  // A seat still to join on the website (or a membership that couldn't be read).
  if (home?.state === "firm_only" && !home.firm) {
    return <StatusScreen title={s.states.firmOnlyTitle} body={s.states.firmOnlyBody} />;
  }
  const firmOnly = home?.state === "firm_only";
  const isFirm = home != null && home.state !== "inactive" && home.firm != null;
  if (home?.state === "inactive") {
    return <StatusScreen title={s.states.inactiveTitle} body={s.states.inactiveBody} support />;
  }
  // Every receipt waiting, not only the newest 50 in the list.
  const toConfirm = home?.state === "ready" ? overallCounts(home.receipts, home.older).toConfirm : 0;

  return (
    <NativeTabs
      tintColor={colors.brandAction}
      // Review-needed is honey, never red (DESIGN.md); the system draws the
      // badge text white, 5.4:1 on this honey in both modes.
      badgeBackgroundColor={colors.badge}
      minimizeBehavior="onScrollDown"
    >
      <NativeTabs.Trigger name="(receipts)" hidden={firmOnly}>
        <NativeTabs.Trigger.Label>{s.tabs.receipts}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "doc.text", selected: "doc.text.fill" }} />
        {/* What waits for the user, like unread mail. */}
        {toConfirm > 0 ? (
          <NativeTabs.Trigger.Badge>{String(toConfirm)}</NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="insights" hidden={firmOnly}>
        <NativeTabs.Trigger.Label>{s.tabs.insights}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "chart.bar.xaxis", selected: "chart.bar.xaxis" }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="clients" hidden={!isFirm}>
        <NativeTabs.Trigger.Label>{s.tabs.clients}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "person.2", selected: "person.2.fill" }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Label>{s.tabs.account}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

export default function AppLayout() {
  return (
    <HomeProvider>
      <AccountProvider>
        <MailboxesProvider>
          <ScanProvider>
            <ReceiptActionsProvider>
              <FirmProvider>
                <Tabs />
              </FirmProvider>
            </ReceiptActionsProvider>
          </ScanProvider>
        </MailboxesProvider>
      </AccountProvider>
    </HomeProvider>
  );
}
