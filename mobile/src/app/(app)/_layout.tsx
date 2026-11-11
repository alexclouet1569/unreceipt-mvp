// Signed in: the real iOS tab bar (UITabBarController, Liquid Glass on
// iOS 26). Firm-only staff and accounts without a plan get a calm full
// screen instead (see StatusScreen).

import { NativeTabs } from "expo-router/native-tabs";
import { StatusScreen } from "../../components/StatusScreen";
import { AccountProvider } from "../../lib/AccountProvider";
import { s } from "../../i18n";
import { HomeProvider, useHome } from "../../lib/HomeProvider";
import { ReceiptActionsProvider } from "../../lib/ReceiptActions";
import { ScanProvider } from "../../lib/scans/ScanProvider";
import { colors } from "../../theme";

function Tabs() {
  const { home } = useHome();
  if (home?.state === "firm_only") {
    return <StatusScreen title={s.states.firmOnlyTitle} body={s.states.firmOnlyBody} />;
  }
  if (home?.state === "inactive") {
    return <StatusScreen title={s.states.inactiveTitle} body={s.states.inactiveBody} />;
  }
  const toConfirm =
    home?.state === "ready" ? home.receipts.filter((r) => r.status === "pending_review").length : 0;

  return (
    <NativeTabs
      tintColor={colors.brandAction}
      // Review-needed is honey, never red (DESIGN.md); white on attentionDeep is 5.4:1.
      badgeBackgroundColor={colors.attentionDeep}
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
        <ScanProvider>
          <ReceiptActionsProvider>
            <Tabs />
          </ReceiptActionsProvider>
        </ScanProvider>
      </AccountProvider>
    </HomeProvider>
  );
}
