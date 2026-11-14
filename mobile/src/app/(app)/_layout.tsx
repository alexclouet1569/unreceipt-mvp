// Signed in: the real iOS tab bar (UITabBarController, Liquid Glass on
// iOS 26). Firm-only staff and accounts without a plan get a calm full
// screen instead (see StatusScreen).

import { NativeTabs } from "expo-router/native-tabs";
import { StatusScreen } from "../../components/StatusScreen";
import { AccountProvider } from "../../lib/AccountProvider";
import { s } from "../../i18n";
import { HomeProvider, useHome } from "../../lib/HomeProvider";
import { MailboxesProvider } from "../../lib/MailboxesProvider";
import { ReceiptActionsProvider } from "../../lib/ReceiptActions";
import { ScanProvider } from "../../lib/scans/ScanProvider";
import { overallCounts } from "../../lib/summary";
import { useColors } from "../../theme";

function Tabs() {
  const colors = useColors();
  const { home } = useHome();
  if (home?.state === "firm_only") {
    return <StatusScreen title={s.states.firmOnlyTitle} body={s.states.firmOnlyBody} />;
  }
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
      <NativeTabs.Trigger name="(receipts)">
        <NativeTabs.Trigger.Label>{s.tabs.receipts}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "doc.text", selected: "doc.text.fill" }} />
        {/* What waits for the user, like unread mail. */}
        {toConfirm > 0 ? (
          <NativeTabs.Trigger.Badge>{String(toConfirm)}</NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="insights">
        <NativeTabs.Trigger.Label>{s.tabs.insights}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "chart.bar.xaxis", selected: "chart.bar.xaxis" }} />
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
              <Tabs />
            </ReceiptActionsProvider>
          </ScanProvider>
        </MailboxesProvider>
      </AccountProvider>
    </HomeProvider>
  );
}
