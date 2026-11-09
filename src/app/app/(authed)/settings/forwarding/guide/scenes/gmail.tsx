import { ChevronDown, HelpCircle, Search, Settings, SlidersHorizontal } from "lucide-react";
import { GMAIL, say } from "../ui-labels";
import { BrowserFrame, Btn, Check, Field, Lines, Mark, Radio, Small, Tabs, Win } from "../Scene";
import type { SceneFn, SceneProps } from "../types";

// Close-ups of Gmail on a computer, one per action of the setup guide.

const FWD_URL = "mail.google.com/mail/u/0/#settings/fwdandpop";
const FILTERS_URL = "mail.google.com/mail/u/0/#settings/filters";

function SettingsTabs({ lang, active, target }: { lang: SceneProps["lang"]; active: "filters" | "forwarding"; target?: "filters" | "forwarding" }) {
  const items = ["…", say(GMAIL.filtersTab, lang), say(GMAIL.forwardingTab, lang), "…"];
  const idx = (k?: "filters" | "forwarding") => (k === "filters" ? 1 : k === "forwarding" ? 2 : undefined);
  return <Tabs items={items} active={idx(active) ?? 2} target={idx(target)} />;
}

function TopBar({ gear = false }: { gear?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="flex items-center gap-2 flex-1 min-w-0"
        style={{ background: "var(--surface)", borderRadius: 9999, padding: "6px 10px", fontSize: 12, color: "var(--ink-faint)" }}
      >
        <Search style={{ width: 13, height: 13 }} />
        <span className="truncate flex-1">Search mail</span>
        <SlidersHorizontal style={{ width: 13, height: 13 }} />
      </span>
      <HelpCircle style={{ width: 16, height: 16, color: "var(--ink-muted)" }} />
      {gear ? (
        <Mark radius={9999}>
          <Settings style={{ width: 18, height: 18, color: "var(--ink)", margin: 3 }} />
        </Mark>
      ) : (
        <Settings style={{ width: 16, height: 16, color: "var(--ink-muted)" }} />
      )}
    </div>
  );
}

const gear: SceneFn = () => (
  <BrowserFrame url="mail.google.com/mail/u/0/#inbox">
    <TopBar gear />
    <div style={{ marginTop: 14 }}>
      <Lines widths={["70%", "55%", "80%", "40%"]} />
    </div>
  </BrowserFrame>
);

const seeAll: SceneFn = ({ lang }) => (
  <BrowserFrame url="mail.google.com/mail/u/0/#inbox">
    <TopBar />
    <div className="flex justify-end" style={{ marginTop: 8 }}>
      <Win title={say(GMAIL.settings, lang)}>
        <div className="flex flex-col items-start gap-3">
          <Btn target>{say(GMAIL.seeAllSettings, lang)}</Btn>
          <Lines widths={["120px", "90px"]} />
        </div>
      </Win>
    </div>
  </BrowserFrame>
);

const tab: SceneFn = ({ lang }) => (
  <BrowserFrame url={FWD_URL}>
    <Small>{say(GMAIL.settings, lang)}</Small>
    <div style={{ marginTop: 8 }}>
      <SettingsTabs lang={lang} active="forwarding" target="forwarding" />
    </div>
    <div style={{ marginTop: 12 }}>
      <Lines widths={["60%", "45%"]} />
    </div>
  </BrowserFrame>
);

function ForwardingSection({ lang, children }: { lang: SceneProps["lang"]; children: React.ReactNode }) {
  return (
    <BrowserFrame url={FWD_URL}>
      <SettingsTabs lang={lang} active="forwarding" />
      <div className="flex gap-3" style={{ marginTop: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", minWidth: 0 }} className="shrink-0">
          {say(GMAIL.forwardingSection, lang)}
        </span>
        <div className="flex flex-col gap-2 min-w-0 flex-1">{children}</div>
      </div>
    </BrowserFrame>
  );
}

const add: SceneFn = ({ lang }) => (
  <ForwardingSection lang={lang}>
    <span>
      <Btn target>{say(GMAIL.addForwardingAddress, lang)}</Btn>
    </span>
    <Lines widths={["80%", "60%"]} />
  </ForwardingSection>
);

const paste: SceneFn = ({ lang, address }) => (
  <BrowserFrame url={FWD_URL}>
    <Win title={say(GMAIL.addForwardingAddress, lang)}>
      <Field value={address} />
      <div className="flex justify-end gap-2" style={{ marginTop: 10 }}>
        <Btn>{say(GMAIL.cancel, lang)}</Btn>
        <Btn solid target>
          {say(GMAIL.next, lang)}
        </Btn>
      </div>
    </Win>
  </BrowserFrame>
);

const proceed: SceneFn = ({ lang, address }) => (
  <BrowserFrame url="mail-settings.google.com/mail/vf-…">
    <Win>
      <Small>
        {say(GMAIL.confirmForwarding, lang)}{" "}
        <strong style={{ fontWeight: 600 }}>{address}</strong>
      </Small>
      <div className="flex justify-end gap-2" style={{ marginTop: 10 }}>
        <Btn>{say(GMAIL.cancel, lang)}</Btn>
        <Btn solid target>
          {say(GMAIL.proceed, lang)}
        </Btn>
      </div>
    </Win>
  </BrowserFrame>
);

const ok: SceneFn = ({ lang }) => (
  <BrowserFrame url={FWD_URL}>
    <Win>
      <Lines widths={["90%", "70%"]} />
      <div className="flex justify-end" style={{ marginTop: 10 }}>
        <Btn solid target>
          {say(GMAIL.ok, lang)}
        </Btn>
      </div>
    </Win>
  </BrowserFrame>
);

function VerifyBlock({ lang, step }: { lang: SceneProps["lang"]; step: "verify" | "leave" }) {
  return (
    <ForwardingSection lang={lang}>
      <Radio label={say(GMAIL.disableForwarding, lang)} checked leave={step === "leave"} />
      <Radio label={`${say(GMAIL.forwardCopy, lang)} …`} />
      <span className="flex flex-wrap items-center gap-2" style={{ marginTop: 4 }}>
        <Field value="593 872 831" wide={false} />
        <Btn target={step === "verify"}>{say(GMAIL.verify, lang)}</Btn>
      </span>
    </ForwardingSection>
  );
}

const verify: SceneFn = ({ lang }) => <VerifyBlock lang={lang} step="verify" />;
const leave: SceneFn = ({ lang }) => <VerifyBlock lang={lang} step="leave" />;

const filtersTab: SceneFn = ({ lang }) => (
  <BrowserFrame url={FILTERS_URL}>
    <SettingsTabs lang={lang} active="filters" target="filters" />
    <div style={{ marginTop: 12 }}>
      <Lines widths={["70%", "50%"]} />
    </div>
  </BrowserFrame>
);

const newFilter: SceneFn = ({ lang }) => (
  <BrowserFrame url={FILTERS_URL}>
    <SettingsTabs lang={lang} active="filters" />
    <div className="flex flex-col items-start gap-3" style={{ marginTop: 12 }}>
      <Lines widths={["75%"]} />
      <Btn link target>
        {say(GMAIL.createNewFilter, lang)}
      </Btn>
      <Lines widths={["40%"]} />
    </div>
  </BrowserFrame>
);

function SearchOptions({
  lang,
  query,
  highlight,
}: {
  lang: SceneProps["lang"];
  query?: string;
  highlight: "words" | "create";
}) {
  return (
    <BrowserFrame url={FILTERS_URL}>
      <Win>
        <div className="flex flex-col gap-2">
          <Field label={say(GMAIL.from, lang)} labelWidth={86} />
          <Field label={say(GMAIL.subject, lang)} labelWidth={86} />
          <Field label={say(GMAIL.hasTheWords, lang)} labelWidth={86} value={query} placeholder=" " target={highlight === "words"} />
        </div>
        <div className="flex justify-end items-center gap-3" style={{ marginTop: 10 }}>
          <Btn link target={highlight === "create"}>
            {say(GMAIL.createFilter, lang)}
          </Btn>
          <Btn solid>{say(GMAIL.search, lang)}</Btn>
        </div>
      </Win>
    </BrowserFrame>
  );
}

const hasWords: SceneFn = ({ lang, filterQuery }) => <SearchOptions lang={lang} query={filterQuery} highlight="words" />;
const createFirst: SceneFn = ({ lang, filterQuery }) => <SearchOptions lang={lang} query={filterQuery} highlight="create" />;

function FilterActions({ lang, address, highlight }: { lang: SceneProps["lang"]; address: string; highlight: "forward" | "create" }) {
  return (
    <BrowserFrame url={FILTERS_URL}>
      <Win>
        <div className="flex flex-col gap-1.5">
          <Check label={say(GMAIL.skipInbox, lang)} />
          <Check label={say(GMAIL.markAsRead, lang)} />
          <Check label={say(GMAIL.starIt, lang)} />
          <span className="flex">
            {highlight === "forward" ? (
              <Mark radius={4}>
                <ForwardRow lang={lang} address={address} />
              </Mark>
            ) : (
              <ForwardRow lang={lang} address={address} />
            )}
          </span>
        </div>
        <div className="flex justify-end" style={{ marginTop: 10 }}>
          <Btn solid target={highlight === "create"}>
            {say(GMAIL.createFilter, lang)}
          </Btn>
        </div>
      </Win>
    </BrowserFrame>
  );
}

function ForwardRow({ lang, address }: { lang: SceneProps["lang"]; address: string }) {
  return (
    <span className="inline-flex items-center gap-2 min-w-0 flex-wrap" style={{ padding: "1px 2px" }}>
      <Check label={say(GMAIL.forwardIt, lang)} checked />
      <span
        className="inline-flex items-center gap-1 min-w-0"
        style={{ border: "1px solid var(--hairline)", borderRadius: 6, padding: "2px 6px", fontSize: 12, color: "var(--ink)", maxWidth: 190 }}
      >
        <span className="truncate">{address}</span>
        <ChevronDown className="shrink-0" style={{ width: 12, height: 12 }} />
      </span>
    </span>
  );
}

const forwardIt: SceneFn = ({ lang, address }) => <FilterActions lang={lang} address={address} highlight="forward" />;
const createSecond: SceneFn = ({ lang, address }) => <FilterActions lang={lang} address={address} highlight="create" />;

export const GMAIL_SCENES = {
  "gmail-gear": gear,
  "gmail-see-all": seeAll,
  "gmail-tab": tab,
  "gmail-add": add,
  "gmail-paste": paste,
  "gmail-proceed": proceed,
  "gmail-ok": ok,
  "gmail-verify": verify,
  "gmail-leave": leave,
  "gmail-filters-tab": filtersTab,
  "gmail-new-filter": newFilter,
  "gmail-has-words": hasWords,
  "gmail-create-1": createFirst,
  "gmail-forward-it": forwardIt,
  "gmail-create-2": createSecond,
} satisfies Record<string, SceneFn>;
