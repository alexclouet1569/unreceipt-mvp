"use client";

import { Children, isValidElement, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { Picture } from "./Scene";
import { Q, type Extra, type GuideAction, type TextContext } from "./actions";
import { say } from "./ui-labels";
import type { SceneProps } from "./types";

/**
 * One chapter of the guide: the picture of the current action above a
 * numbered checklist. Done rows are ticked, the current one is expanded
 * with its button or copy field, any row can be tapped to go back to it.
 */
export function ActionChecklist({
  actions,
  current,
  onSelect,
  textContext,
  sceneProps,
  renderExtra,
  pointer = "mouse",
}: {
  actions: GuideAction[];
  current: number;
  onSelect: (index: number) => void;
  textContext: TextContext;
  sceneProps: SceneProps;
  renderExtra: (extra: Extra) => React.ReactNode;
  pointer?: "mouse" | "finger";
}) {
  const [play, setPlay] = useState(0);
  const index = Math.min(current, actions.length - 1);
  const action = actions[index];
  const label = plainText(action.text(textContext), textContext);

  return (
    <div className="space-y-3">
      {action.scene ? (
        <div>
          <Picture key={`${action.id}-${textContext.lang}`} label={label} play={play} pointer={pointer}>
            {action.scene(sceneProps)}
          </Picture>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setPlay((p) => p + 1)}
              className="inline-flex items-center gap-1 text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
              style={{ minHeight: "44px", fontSize: "13px", fontWeight: 500 }}
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Show again
            </button>
          </div>
        </div>
      ) : null}

      {/* Next keeps focus on the button: say which step is current now. */}
      <p className="sr-only" aria-live="polite">
        {`Step ${index + 1} of ${actions.length}: ${label}`}
      </p>

      <ol role="list" aria-label="Steps" className="space-y-1">
        {actions.map((a, i) => {
          const state = i < index ? "done" : i === index ? "current" : "todo";
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={state === "current" ? "step" : undefined}
                className="w-full flex items-start gap-3 text-left hover:bg-[var(--surface)] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                style={{ borderRadius: "10px", padding: "10px 8px", minHeight: "44px" }}
              >
                <StepBadge n={i + 1} state={state} />
                <span
                  className={state === "current" ? "text-[var(--ink)]" : "text-[var(--ink-muted)]"}
                  style={{ fontSize: "15px", lineHeight: 1.45, fontWeight: state === "current" ? 600 : 400, paddingTop: "1px" }}
                >
                  {a.text(textContext)}
                  {state === "done" ? <span className="sr-only"> (done)</span> : null}
                </span>
              </button>
              {state === "current" && (a.extra || a.hint) ? (
                <div className="space-y-3" style={{ padding: "2px 8px 8px 42px" }}>
                  {a.extra ? renderExtra(a.extra) : null}
                  {a.hint ? <ActionHint>{a.hint(textContext)}</ActionHint> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StepBadge({ n, state }: { n: number; state: "done" | "current" | "todo" }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center shrink-0 rounded-full"
      style={{
        width: "22px",
        height: "22px",
        fontSize: "12px",
        fontWeight: 700,
        border: state === "todo" ? "1px solid var(--hairline)" : "1px solid var(--ink)",
        background: state === "current" ? "var(--ink)" : "var(--card)",
        color: state === "current" ? "var(--card)" : state === "done" ? "var(--ink)" : "var(--ink-muted)",
      }}
    >
      {state === "done" ? <Check className="w-3.5 h-3.5" /> : n}
    </span>
  );
}

export function ActionHint({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[var(--ink-muted)]"
      style={{ fontSize: "13px", lineHeight: 1.5, borderLeft: "2px solid var(--hairline)", paddingLeft: "12px" }}
    >
      {children}
    </p>
  );
}

/** A step's sentence as plain text, for the picture's accessible name. */
export function plainText(node: React.ReactNode, c: Pick<TextContext, "lang">): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((n) => plainText(n, c)).join("");
  if (isValidElement(node)) {
    const props = node.props as { label?: Parameters<typeof say>[0]; children?: React.ReactNode };
    if (node.type === Q && props.label) return `“${say(props.label, c.lang)}”`;
    return Children.toArray(props.children).map((n) => plainText(n, c)).join("");
  }
  return "";
}
