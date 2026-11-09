import { Archive, ArrowUp, Folder, MoreHorizontal, MoreVertical, PenSquare, Reply, Send, Trash2 } from "lucide-react";
import { PHONE, say } from "../ui-labels";
import { BrowserFrame, Field, Lines, Mark, PhoneFrame, Small } from "../Scene";
import type { SceneFn, SceneProps } from "../types";

// Phone mail apps (forwarding by hand) and our own inbox (the test step).

export type PhoneApp = "iphone" | "gmail" | "outlook";

const icon = { width: 16, height: 16, color: "var(--ink-muted)" } as const;
const iconOn = { width: 18, height: 18, color: "var(--ink)", margin: 3 } as const;

function Inbox({ lang }: { lang: SceneProps["lang"] }) {
  return (
    <PhoneFrame>
      <p style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", padding: "0 4px 6px" }}>{say(PHONE.inbox, lang)}</p>
      <div className="flex flex-col gap-2">
        <Lines widths={["80%", "60%"]} />
        <Mark radius={8} block>
          <span className="flex flex-col w-full" style={{ padding: "6px 6px", gap: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>SJ</span>
            <span className="truncate" style={{ fontSize: 12, color: "var(--ink)" }}>
              {lang === "sv" ? "Ditt kvitto" : lang === "fr" ? "Votre reçu" : "Your receipt"}
            </span>
          </span>
        </Mark>
        <Lines widths={["70%", "50%", "75%"]} />
      </div>
    </PhoneFrame>
  );
}

function Message({ app, highlight }: { app: PhoneApp; highlight: boolean }) {
  const top =
    app === "gmail" ? (
      <span className="flex items-center gap-2 justify-end">
        <Reply style={icon} />
        {highlight ? (
          <Mark radius={9999}>
            <MoreVertical style={iconOn} />
          </Mark>
        ) : (
          <MoreVertical style={icon} />
        )}
      </span>
    ) : app === "outlook" ? (
      <span className="flex items-center gap-2 justify-end">
        {highlight ? (
          <Mark radius={9999}>
            <MoreHorizontal style={iconOn} />
          </Mark>
        ) : (
          <MoreHorizontal style={icon} />
        )}
      </span>
    ) : null;
  return (
    <>
      {top}
      <div className="flex flex-col gap-2" style={{ padding: "6px 4px", minHeight: 110 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>SJ</span>
        <Lines widths={["90%", "70%", "85%", "40%"]} />
      </div>
      {app === "iphone" ? (
        <span className="flex items-center justify-between" style={{ borderTop: "1px solid var(--hairline)", padding: "6px 4px 0" }}>
          <Trash2 style={icon} />
          <Folder style={icon} />
          {highlight ? (
            <Mark radius={9999}>
              <Reply style={iconOn} />
            </Mark>
          ) : (
            <Reply style={icon} />
          )}
          <PenSquare style={icon} />
        </span>
      ) : app === "gmail" ? (
        <span className="flex items-center justify-around" style={{ borderTop: "1px solid var(--hairline)", padding: "6px 4px 0" }}>
          <Archive style={icon} />
          <Trash2 style={icon} />
        </span>
      ) : null}
    </>
  );
}

function Sheet({ app, lang }: { app: PhoneApp; lang: SceneProps["lang"] }) {
  return (
    <PhoneFrame>
      <Message app={app} highlight={false} />
      <div className="flex flex-col gap-1 bg-card" style={{ border: "1px solid var(--hairline)", borderRadius: 12, padding: 8, marginTop: 6 }}>
        <Small>{say(PHONE.reply, lang)}</Small>
        <span className="flex">
          <Mark radius={6}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", padding: "2px 6px" }}>{say(PHONE.forward, lang)}</span>
          </Mark>
        </span>
        <Lines widths={["40%"]} />
      </div>
    </PhoneFrame>
  );
}

function Compose({ app, lang, address, highlight }: { app: PhoneApp; lang: SceneProps["lang"]; address: string; highlight: "to" | "send" }) {
  const SendIcon = app === "iphone" ? ArrowUp : Send;
  const send =
    highlight === "send" ? (
      <Mark radius={9999}>
        <SendIcon style={iconOn} />
      </Mark>
    ) : (
      <SendIcon style={icon} />
    );
  return (
    <PhoneFrame>
      <span className="flex items-center justify-between" style={{ padding: "0 4px 8px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>{say(PHONE.forward, lang)}</span>
        {send}
      </span>
      <Field label={say(PHONE.to, lang)} value={highlight === "to" ? "UnReceipt" : address} target={highlight === "to"} />
      <div style={{ padding: "10px 4px 0" }}>
        <Lines widths={["70%", "85%", "50%"]} />
      </div>
    </PhoneFrame>
  );
}

export function phoneScenes(app: PhoneApp): Record<string, SceneFn> {
  return {
    open: ({ lang }) => <Inbox lang={lang} />,
    menu: () => (
      <PhoneFrame>
        <Message app={app} highlight />
      </PhoneFrame>
    ),
    forward: ({ lang }) => <Sheet app={app} lang={lang} />,
    to: ({ lang, address }) => <Compose app={app} lang={lang} address={address} highlight="to" />,
    send: ({ lang, address }) => <Compose app={app} lang={lang} address={address} highlight="send" />,
  };
}

/** Our own inbox with the test email waiting under Review needed. */
export const testArrived: SceneFn = () => (
  <BrowserFrame url="app.unreceipt.com/app">
    <div className="flex flex-col gap-2">
      <Lines widths={["40%"]} />
      <Mark radius={10} block>
        <span
          className="flex items-center justify-between w-full bg-card"
          style={{ border: "1px solid var(--hairline)", borderRadius: 10, padding: "8px 10px" }}
        >
          <span className="flex flex-col">
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>Test receipt</span>
            <span style={{ fontSize: 12, color: "var(--attention-deep)" }}>Review needed</span>
          </span>
          <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>now</span>
        </span>
      </Mark>
      <Lines widths={["70%", "55%"]} />
    </div>
  </BrowserFrame>
);
