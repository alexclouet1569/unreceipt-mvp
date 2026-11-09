import { ChevronDown, Plus, Settings } from "lucide-react";
import { ICLOUD, PHONE, say } from "../ui-labels";
import { BrowserFrame, Btn, Field, Lines, Mark, Small, Win } from "../Scene";
import type { SceneFn, SceneProps } from "../types";

// Close-ups of Mail on iCloud.com.

const URL = "icloud.com/mail";

const gear: SceneFn = ({ lang }) => (
  <BrowserFrame url={URL}>
    <div className="flex gap-3">
      <div className="flex flex-col gap-2 shrink-0" style={{ width: 110 }}>
        <span className="flex items-center justify-between">
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>{say(ICLOUD.mailboxes, lang)}</span>
          <Mark radius={9999}>
            <Settings style={{ width: 16, height: 16, color: "var(--ink)", margin: 2 }} />
          </Mark>
        </span>
        <Small>{say(PHONE.inbox, lang)}</Small>
        <Lines widths={["70%", "55%", "60%"]} />
      </div>
      <div className="flex-1 min-w-0">
        <Lines widths={["90%", "75%", "85%", "60%"]} />
      </div>
    </div>
  </BrowserFrame>
);

function SettingsWin({ lang, rules = false, children }: { lang: SceneProps["lang"]; rules?: boolean; children: React.ReactNode }) {
  return (
    <BrowserFrame url={URL}>
      <Win title={say(ICLOUD.settings, lang)}>
        <div className="flex gap-3">
          <div className="flex flex-col gap-1.5 shrink-0" style={{ width: 70 }}>
            <Lines widths={["50px"]} />
            {rules ? (
              <span className="flex">
                <Mark radius={4}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", padding: "1px 4px" }}>{say(ICLOUD.rules, lang)}</span>
                </Mark>
              </span>
            ) : (
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", background: "var(--surface)", borderRadius: 4, padding: "1px 4px" }}>
                {say(ICLOUD.rules, lang)}
              </span>
            )}
            <Lines widths={["40px", "55px"]} />
          </div>
          <div className="flex flex-col gap-2 min-w-0 flex-1">{children}</div>
        </div>
      </Win>
    </BrowserFrame>
  );
}

const rules: SceneFn = ({ lang }) => (
  <SettingsWin lang={lang} rules>
    <Lines widths={["80%", "60%"]} />
  </SettingsWin>
);

const add: SceneFn = ({ lang }) => (
  <SettingsWin lang={lang}>
    <span className="flex items-center justify-between">
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>{say(ICLOUD.rules, lang)}</span>
      <Mark radius={9999}>
        <Plus style={{ width: 16, height: 16, color: "var(--ink)", margin: 2 }} />
      </Mark>
    </span>
    <Lines widths={["70%"]} />
  </SettingsWin>
);

function Popup({ text }: { text: string }) {
  return (
    <span
      className="flex items-center justify-between"
      style={{ border: "1px solid var(--hairline)", borderRadius: 6, padding: "4px 8px", fontSize: 12, color: "var(--ink)", background: "var(--card)" }}
    >
      <span className="truncate">{text}</span>
      <ChevronDown className="shrink-0" style={{ width: 12, height: 12 }} />
    </span>
  );
}

function RuleForm({ lang, word, address, highlight }: { lang: SceneProps["lang"]; word: string; address: string; highlight: "message" | "action" | "add" }) {
  return (
    <SettingsWin lang={lang}>
      <Small muted>{say(ICLOUD.message, lang)}</Small>
      <Popup text={say(ICLOUD.subjectContains, lang)} />
      <Field value={word} target={highlight === "message"} />
      <Small muted>{say(ICLOUD.action, lang)}</Small>
      <Popup text={say(ICLOUD.forwardTo, lang)} />
      <Field value={address} target={highlight === "action"} />
      <span className="flex justify-end">
        <Btn solid target={highlight === "add"}>
          {say(ICLOUD.add, lang)}
        </Btn>
      </span>
    </SettingsWin>
  );
}

const message: SceneFn = ({ lang, words, address }) => <RuleForm lang={lang} word={words[0] ?? ""} address={address} highlight="message" />;
const action: SceneFn = ({ lang, words, address }) => <RuleForm lang={lang} word={words[0] ?? ""} address={address} highlight="action" />;
const save: SceneFn = ({ lang, words, address }) => <RuleForm lang={lang} word={words[0] ?? ""} address={address} highlight="add" />;

const repeat: SceneFn = ({ lang, words, address }) => (
  <SettingsWin lang={lang}>
    <span className="flex items-center justify-between">
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>{say(ICLOUD.rules, lang)}</span>
      <Mark radius={9999}>
        <Plus style={{ width: 16, height: 16, color: "var(--ink)", margin: 2 }} />
      </Mark>
    </span>
    {words.map((w) => (
      <span key={w} className="truncate" style={{ fontSize: 12, color: "var(--ink-muted)" }}>
        “{w}” → {address}
      </span>
    ))}
  </SettingsWin>
);

export const ICLOUD_SCENES = {
  "icloud-gear": gear,
  "icloud-rules": rules,
  "icloud-add": add,
  "icloud-message": message,
  "icloud-action": action,
  "icloud-save": save,
  "icloud-repeat": repeat,
} satisfies Record<string, SceneFn>;
