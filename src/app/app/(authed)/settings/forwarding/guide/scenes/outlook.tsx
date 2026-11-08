import { ChevronDown, Plus } from "lucide-react";
import { OUTLOOK, say } from "../ui-labels";
import { BrowserFrame, Btn, Field, Lines, Mark, Small, Win } from "../Scene";
import type { SceneFn, SceneProps } from "../types";

// Close-ups of Outlook on the web (outlook.live.com / outlook.office.com).

const URL = "outlook.live.com/mail/0/options/mail/rules";

function RulesPane({ lang, markRules = false, children }: { lang: SceneProps["lang"]; markRules?: boolean; children: React.ReactNode }) {
  return (
    <BrowserFrame url={URL}>
      <div className="flex gap-3">
        <div className="flex flex-col gap-1.5 shrink-0" style={{ width: 70 }}>
          <Small muted>{say(OUTLOOK.settings, lang)}</Small>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>{say(OUTLOOK.mail, lang)}</span>
          {markRules ? (
            <span className="flex">
              <Mark radius={4}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", padding: "1px 4px" }}>{say(OUTLOOK.rules, lang)}</span>
              </Mark>
            </span>
          ) : (
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", background: "var(--surface)", borderRadius: 4, padding: "1px 4px" }}>
              {say(OUTLOOK.rules, lang)}
            </span>
          )}
          <Lines widths={["50px", "40px"]} />
        </div>
        <div className="flex flex-col gap-2 min-w-0 flex-1">{children}</div>
      </div>
    </BrowserFrame>
  );
}

function Dropdown({ label, open, pick }: { label: string; open?: string; pick?: boolean }) {
  return (
    <span className="flex flex-col gap-1">
      <span
        className="flex items-center justify-between"
        style={{ border: "1px solid var(--hairline)", borderRadius: 6, padding: "4px 8px", fontSize: 12, color: open ? "var(--ink)" : "var(--ink-muted)", background: "var(--card)" }}
      >
        {label}
        <ChevronDown style={{ width: 12, height: 12 }} />
      </span>
      {open ? (
        <span className="flex flex-col gap-1.5 bg-card" style={{ border: "1px solid var(--hairline)", borderRadius: 6, padding: "6px 8px" }}>
          <Lines widths={["60%"]} />
          {pick ? (
            <span className="flex">
              <Mark radius={4}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", padding: "1px 4px" }}>{open}</span>
              </Mark>
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "var(--ink)" }}>{open}</span>
          )}
          <Lines widths={["45%", "55%"]} />
        </span>
      ) : null}
    </span>
  );
}

const rules: SceneFn = ({ lang }) => (
  <RulesPane lang={lang} markRules>
    <Lines widths={["70%", "80%", "50%"]} />
  </RulesPane>
);

const addRule: SceneFn = ({ lang }) => (
  <RulesPane lang={lang}>
    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{say(OUTLOOK.rules, lang)}</span>
    <span>
      <Btn target>
        <Plus style={{ width: 12, height: 12 }} />
        {say(OUTLOOK.addNewRule, lang)}
      </Btn>
    </span>
    <Lines widths={["80%", "60%"]} />
  </RulesPane>
);

function RuleForm({ lang, children }: { lang: SceneProps["lang"]; children: React.ReactNode }) {
  return (
    <BrowserFrame url={URL}>
      <Win title={say(OUTLOOK.addNewRule, lang)}>
        <div className="flex flex-col gap-2">{children}</div>
      </Win>
    </BrowserFrame>
  );
}

const name: SceneFn = ({ lang }) => (
  <RuleForm lang={lang}>
    <Small muted>{say(OUTLOOK.name, lang)}</Small>
    <Field value="UnReceipt" target />
    <Dropdown label={say(OUTLOOK.addCondition, lang)} />
  </RuleForm>
);

const condition: SceneFn = ({ lang }) => (
  <RuleForm lang={lang}>
    <Field value="UnReceipt" />
    <Dropdown label={say(OUTLOOK.addCondition, lang)} open={say(OUTLOOK.subjectIncludes, lang)} pick />
  </RuleForm>
);

const words: SceneFn = ({ lang, words: list }) => (
  <RuleForm lang={lang}>
    <Dropdown label={say(OUTLOOK.subjectIncludes, lang)} />
    <span className="flex">
      <Mark radius={6} block>
        <span
          className="flex flex-wrap items-center gap-1 w-full"
          style={{ border: "1px solid var(--hairline)", borderRadius: 6, padding: "4px 6px", background: "var(--card)", minHeight: 28 }}
        >
          {list.slice(0, 3).map((w) => (
            <span key={w} style={{ fontSize: 12, background: "var(--surface)", borderRadius: 4, padding: "1px 6px", color: "var(--ink)" }}>
              {w} ×
            </span>
          ))}
          <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{list[3] ?? ""}|</span>
        </span>
      </Mark>
    </span>
  </RuleForm>
);

const action: SceneFn = ({ lang }) => (
  <RuleForm lang={lang}>
    <Dropdown label={say(OUTLOOK.subjectIncludes, lang)} />
    <Dropdown label={say(OUTLOOK.addAction, lang)} open={say(OUTLOOK.redirectTo, lang)} pick />
  </RuleForm>
);

const address: SceneFn = ({ lang, address: a }) => (
  <RuleForm lang={lang}>
    <Dropdown label={say(OUTLOOK.redirectTo, lang)} />
    <Field value={a} target />
  </RuleForm>
);

const save: SceneFn = ({ lang, address: a }) => (
  <RuleForm lang={lang}>
    <Dropdown label={say(OUTLOOK.redirectTo, lang)} />
    <Field value={a} />
    <span className="flex justify-end">
      <Btn solid target>
        {say(OUTLOOK.save, lang)}
      </Btn>
    </span>
  </RuleForm>
);

export const OUTLOOK_SCENES = {
  "outlook-rules": rules,
  "outlook-add-rule": addRule,
  "outlook-name": name,
  "outlook-condition": condition,
  "outlook-words": words,
  "outlook-action": action,
  "outlook-address": address,
  "outlook-save": save,
} satisfies Record<string, SceneFn>;
