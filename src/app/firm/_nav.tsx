"use client";

import { Receipt, Settings, Users } from "lucide-react";
import { AppHeader, AppTabBar, type NavTab } from "@/components/AppNav";

// The firm portal's header and bottom tab bar: the client app's own
// (src/components/AppNav.tsx), with the firm's tabs. Built here, in the
// browser, because a tab's icon is a component and can't be handed over
// from the server layout. The demo tour passes its own links (query
// strings) and says which tab is current.

export type FirmLinks = { clients: string; settings: string; ownReceipts?: string | null };
export type FirmTabKey = "clients" | "settings";

function firmTabs(links: FirmLinks): NavTab[] {
  return [
    { href: links.clients, label: "Clients", icon: Users },
    { href: links.settings, label: "Settings", icon: Settings },
    // Staff with a company of their own reach their receipts in one tap.
    ...(links.ownReceipts ? [{ href: links.ownReceipts, label: "My receipts", icon: Receipt }] : []),
  ];
}

const activeHrefOf = (links: FirmLinks, active: FirmTabKey | null | undefined) =>
  active === undefined ? undefined : active ? links[active] : null;

export function FirmHeader({
  firmName,
  homeHref,
  links,
  active,
  activeIsPage,
}: {
  firmName: string;
  homeHref: string;
  links: FirmLinks;
  active?: FirmTabKey | null;
  /** With `active`: the tab's own page (the client list), not a page inside it. */
  activeIsPage?: boolean;
}) {
  return (
    <AppHeader
      tabs={firmTabs(links)}
      homeHref={homeHref}
      homeLabel="UnReceipt for firms, your clients"
      wide
      subtitle={firmName}
      activeHref={activeHrefOf(links, active)}
      activeIsPage={activeIsPage}
    />
  );
}

export function FirmTabBar({
  links,
  active,
  activeIsPage,
}: {
  links: FirmLinks;
  active?: FirmTabKey | null;
  activeIsPage?: boolean;
}) {
  return <AppTabBar tabs={firmTabs(links)} wide activeHref={activeHrefOf(links, active)} activeIsPage={activeIsPage} />;
}
