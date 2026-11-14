import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

const path = vi.hoisted(() => ({ current: "/firm/clients/abc" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.current }));

import { FirmHeader, FirmTabBar } from "../_nav";

afterEach(cleanup);

describe("firm portal navigation (the client app's header and tab bar)", () => {
  const links = { clients: "/firm/clients", settings: "/firm/settings", ownReceipts: null };

  it("marks the tab a page belongs to, in the header and the bottom bar", () => {
    render(
      <>
        <FirmHeader firmName="Bergström Redovisning AB" homeHref="/firm/clients" links={links} />
        <FirmTabBar links={links} />
      </>,
    );
    const [header, bar] = screen.getAllByRole("navigation", { name: "Main" });
    expect(within(header).getByRole("link", { name: "Clients" })).toHaveAttribute("aria-current", "true");
    expect(within(bar).getByRole("link", { name: /Clients/ })).toHaveAttribute("aria-current", "true");
    expect(within(header).getByRole("link", { name: "Settings" })).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Bergström Redovisning AB")).toBeInTheDocument();
  });

  it("offers My receipts to staff with a company of their own", () => {
    render(<FirmHeader firmName="F" homeHref="/firm/clients" links={{ ...links, ownReceipts: "/app" }} />);
    expect(screen.getByRole("link", { name: "My receipts" })).toHaveAttribute("href", "/app");
  });

  it("takes the current tab from the caller when the path can't tell (demo tour)", () => {
    path.current = "/demo/accountant";
    const demo = { clients: "/demo/accountant?step=1&view=clients", settings: "/demo/accountant?step=1&view=settings" };
    render(<FirmHeader firmName="F" homeHref="/demo/accountant?step=1" links={demo} active="settings" />);
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Clients" })).not.toHaveAttribute("aria-current");
  });
});

describe("demo tour aria-current", () => {
  it("says page on the client list and true inside a client", () => {
    path.current = "/demo/accountant";
    const demo = { clients: "/demo/accountant?step=2&view=clients", settings: "/demo/accountant?step=2&view=settings" };
    const { unmount } = render(<FirmHeader firmName="F" homeHref="/" links={demo} active="clients" activeIsPage />);
    expect(screen.getByRole("link", { name: "Clients" })).toHaveAttribute("aria-current", "page");
    unmount();
    render(<FirmHeader firmName="F" homeHref="/" links={demo} active="clients" activeIsPage={false} />);
    expect(screen.getByRole("link", { name: "Clients" })).toHaveAttribute("aria-current", "true");
  });
});
