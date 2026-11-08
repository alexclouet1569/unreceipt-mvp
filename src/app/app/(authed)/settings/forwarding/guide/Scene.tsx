"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Lock, MousePointer2 } from "lucide-react";

/**
 * Drawing kit for the setup guide's pictures (DESIGN.md "Setup guide
 * illustrations"): close-ups of another app's screen in our own tokens, one
 * control outlined as the thing to press, and a cursor that glides to it
 * once. Every picture is role="img" with the step as its label; the text
 * next to it carries all the information.
 */

type Register = (el: HTMLElement | null) => void;
const TargetContext = createContext<Register | null>(null);
// Changes on every replay, so the pulse restarts with the cursor.
const PlayContext = createContext(0);
// A still picture: no glide, no pulse (reduced motion, or several pictures
// on screen at once).
const StillContext = createContext(false);

const EASE_IN = "cubic-bezier(0.32, 0.72, 0, 1)";

function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

export function Picture({
  label,
  play,
  pointer = "mouse",
  still = false,
  children,
}: {
  label: string;
  still?: boolean;
  // Bump to replay the cursor and the pulse.
  play: number;
  pointer?: "mouse" | "finger";
  children: React.ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const register = useCallback<Register>((el) => setTarget(el), []);
  return (
    <div
      ref={boxRef}
      role="img"
      aria-label={label}
      className="relative overflow-hidden select-none"
      style={{ background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px" }}
    >
      <TargetContext.Provider value={register}>
        <PlayContext.Provider value={play}>
          <StillContext.Provider value={still}>
            <div aria-hidden="true">{children}</div>
          </StillContext.Provider>
        </PlayContext.Provider>
      </TargetContext.Provider>
      <Cursor boxRef={boxRef} target={target} play={play} pointer={pointer} still={still} />
    </div>
  );
}

function Cursor({
  boxRef,
  target,
  play,
  pointer,
  still: forceStill,
}: {
  boxRef: React.RefObject<HTMLDivElement | null>;
  target: HTMLElement | null;
  play: number;
  pointer: "mouse" | "finger";
  still: boolean;
}) {
  // `still`: reduced motion, the cursor sits on the target.
  const [pos, setPos] = useState<{ x: number; y: number; moving: boolean; still: boolean } | null>(null);
  const [arrived, setArrived] = useState(false);

  const measure = useCallback(() => {
    const box = boxRef.current;
    if (!box || !target) return null;
    const b = box.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    return {
      start: { x: b.width - 28, y: b.height - 28 },
      end:
        pointer === "finger"
          ? // On the lower-right edge, so the fingertip doesn't hide the word.
            { x: t.right - b.left - 4, y: t.bottom - b.top - 2 }
          : // A little right of centre and below, like a hand on a mouse.
            { x: t.left - b.left + Math.min(t.width * 0.6, t.width - 8), y: t.top - b.top + t.height * 0.55 },
    };
  }, [boxRef, target, pointer]);

  useLayoutEffect(() => {
    const still = forceStill || prefersReducedMotion();
    let raf2 = 0;
    let done: ReturnType<typeof setTimeout> | undefined;
    // Frame 1 paints the start position, frame 2 starts the glide.
    const raf1 = requestAnimationFrame(() => {
      const m = measure();
      if (!m) return setPos(null);
      if (still) {
        setPos({ ...m.end, moving: false, still: true });
        setArrived(true);
        return;
      }
      setArrived(false);
      setPos({ ...m.start, moving: false, still: false });
      raf2 = requestAnimationFrame(() => {
        setPos({ ...m.end, moving: true, still: false });
        done = setTimeout(() => setArrived(true), 340);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      if (done) clearTimeout(done);
    };
  }, [measure, play, forceStill]);

  // Keep the cursor on its target when the picture resizes.
  useEffect(() => {
    const onResize = () => {
      const m = measure();
      if (m) setPos((p) => ({ ...m.end, moving: false, still: p?.still ?? false }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measure]);

  if (!pos) return null;
  return (
    <span
      aria-hidden="true"
      data-cursor={pos.still ? "still" : "glide"}
      className="pointer-events-none absolute left-0 top-0"
      style={{
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        transition: pos.moving ? `transform 320ms ${EASE_IN}` : "none",
      }}
    >
      {pointer === "mouse" ? (
        <MousePointer2
          className={arrived ? "guide-tap" : undefined}
          style={{ width: 22, height: 22, color: "var(--ink)", fill: "var(--card)", strokeWidth: 1.75, transformOrigin: "2px 2px" }}
        />
      ) : (
        <span
          className={arrived ? "guide-tap block" : "block"}
          style={{
            width: 26,
            height: 26,
            marginLeft: -13,
            marginTop: -13,
            borderRadius: 9999,
            background: "color-mix(in srgb, var(--ink) 22%, transparent)",
            border: "2px solid color-mix(in srgb, var(--ink) 45%, transparent)",
          }}
        />
      )}
    </span>
  );
}

/**
 * The control to press (outlined in --ring, pulses 3 times) or, with
 * `leave`, a control to leave alone (dashed, tagged "Leave").
 */
export function Mark({
  children,
  leave = false,
  radius = 8,
  block = false,
}: {
  children: React.ReactNode;
  leave?: boolean;
  radius?: number;
  block?: boolean;
}) {
  const register = useContext(TargetContext);
  const play = useContext(PlayContext);
  const still = useContext(StillContext);
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (leave || !register) return;
    register(ref.current);
    return () => register(null);
  }, [register, leave]);
  if (leave) {
    // The tag sits in the flow beside the control, so a long label in
    // Swedish or French wraps instead of pushing the tag out of the picture.
    return (
      <span className="inline-flex flex-wrap items-center gap-2 min-w-0">
        <span
          data-mark="leave"
          className={`${block ? "flex w-full" : "inline-flex"} min-w-0`}
          style={{ borderRadius: radius, outline: "1.5px dashed var(--ink-faint)", outlineOffset: 2 }}
        >
          {children}
        </span>
        <span
          className="whitespace-nowrap"
          style={{
            background: "var(--card)",
            border: "1px solid var(--hairline)",
            borderRadius: 9999,
            padding: "0 6px",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--ink-muted)",
            lineHeight: "18px",
          }}
        >
          Leave
        </span>
      </span>
    );
  }
  return (
    <span
      ref={ref}
      data-mark="target"
      className={`${block ? "flex w-full" : "inline-flex"} relative`}
      style={{ borderRadius: radius, outline: "2px solid var(--ring)", outlineOffset: 2 }}
    >
      {children}
      {still ? null : (
        <span key={play} className="guide-pulse absolute inset-0" style={{ borderRadius: radius, pointerEvents: "none" }} />
      )}
    </span>
  );
}

// ── Frames ─────────────────────────────────────────────────────────────

export function BrowserFrame({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className="bg-card overflow-hidden" style={{ border: "1px solid var(--hairline)", borderRadius: "10px" }}>
      <div
        className="flex items-center gap-2"
        style={{ borderBottom: "1px solid var(--hairline)", padding: "6px 8px", background: "var(--surface)" }}
      >
        <span className="flex gap-1 shrink-0">
          {[0, 1, 2].map((i) => (
            <span key={i} className="block rounded-full" style={{ width: 7, height: 7, background: "var(--hairline)" }} />
          ))}
        </span>
        <span
          className="flex items-center gap-1 min-w-0 flex-1 bg-card"
          style={{ border: "1px solid var(--hairline)", borderRadius: 6, padding: "2px 8px", fontSize: 12, color: "var(--ink-muted)" }}
        >
          <Lock className="shrink-0" style={{ width: 10, height: 10 }} />
          <span className="truncate">{url}</span>
        </span>
      </div>
      <div style={{ padding: "12px" }}>{children}</div>
    </div>
  );
}

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="bg-card mx-auto overflow-hidden"
      style={{ width: 232, maxWidth: "100%", border: "1px solid var(--hairline)", borderRadius: 26, padding: "8px 10px 12px" }}
    >
      <div className="flex justify-between" style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-muted)", padding: "0 6px 6px" }}>
        <span>9:41</span>
        <span className="block rounded-full" style={{ width: 54, height: 14, background: "var(--ink)" }} />
        <span>100%</span>
      </div>
      {children}
    </div>
  );
}

/** A dialog drawn inside a picture: hairline border, never a shadow. */
export function Win({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card" style={{ border: "1px solid var(--hairline)", borderRadius: 10, padding: "12px" }}>
      {title ? <p style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>{title}</p> : null}
      {children}
    </div>
  );
}

// ── Controls ───────────────────────────────────────────────────────────

type Markable = { target?: boolean; leave?: boolean };

function marked(node: React.ReactNode, { target, leave }: Markable, radius: number, block = false) {
  return target || leave ? (
    <Mark leave={leave} radius={radius} block={block}>
      {node}
    </Mark>
  ) : (
    node
  );
}

export function Btn({
  children,
  solid = false,
  link = false,
  ...m
}: { children: React.ReactNode; solid?: boolean; link?: boolean } & Markable) {
  const node = (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap"
      style={
        link
          ? { fontSize: 12, fontWeight: 600, color: "var(--ink)", textDecoration: "underline", textUnderlineOffset: 2, padding: "2px 2px" }
          : {
              fontSize: 12,
              fontWeight: 600,
              padding: "5px 12px",
              borderRadius: 6,
              border: solid ? "1px solid var(--ink)" : "1px solid var(--hairline)",
              background: solid ? "var(--ink)" : "var(--card)",
              color: solid ? "var(--card)" : "var(--ink)",
            }
      }
    >
      {children}
    </span>
  );
  return marked(node, m, 6);
}

export function Field({
  label,
  value,
  placeholder,
  wide = true,
  labelWidth,
  ...m
}: { label?: string; value?: string; placeholder?: string; wide?: boolean; labelWidth?: number } & Markable) {
  const box = (
    <span
      className={`${wide ? "flex w-full" : "inline-flex"} items-center min-w-0`}
      style={{
        border: "1px solid var(--hairline)",
        borderRadius: 6,
        padding: "5px 8px",
        fontSize: 12,
        background: "var(--card)",
        color: value ? "var(--ink)" : "var(--ink-faint)",
        minHeight: 26,
      }}
    >
      <span className="truncate">{value ?? placeholder ?? ""}</span>
    </span>
  );
  return (
    <span className={`${wide ? "flex" : "inline-flex"} items-center gap-2 min-w-0`}>
      {label ? (
        <span className="shrink-0" style={{ fontSize: 12, color: "var(--ink-muted)", width: labelWidth }}>
          {label}
        </span>
      ) : null}
      <span className="flex-1 min-w-0 flex">{marked(box, m, 6, true)}</span>
    </span>
  );
}

export function Tabs({ items, active, target }: { items: string[]; active: number; target?: number }) {
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-1" style={{ borderBottom: "1px solid var(--hairline)", paddingBottom: 4 }}>
      {items.map((t, i) => {
        const node = (
          <span
            style={{
              fontSize: 12,
              fontWeight: i === active ? 700 : 500,
              color: i === active ? "var(--ink)" : "var(--ink-muted)",
              padding: "2px 2px",
              borderBottom: i === active ? "2px solid var(--ink)" : "2px solid transparent",
            }}
          >
            {t}
          </span>
        );
        return <span key={i}>{marked(node, { target: i === target }, 4)}</span>;
      })}
    </div>
  );
}

export function Check({ label, checked = false, ...m }: { label: React.ReactNode; checked?: boolean } & Markable) {
  const node = (
    <span className="inline-flex items-center gap-2 min-w-0" style={{ fontSize: 12, color: "var(--ink)", padding: "1px 2px", overflowWrap: "anywhere" }}>
      <span
        className="inline-flex items-center justify-center shrink-0"
        style={{
          width: 13,
          height: 13,
          borderRadius: 3,
          border: checked ? "1px solid var(--ink)" : "1px solid var(--ink-faint)",
          background: checked ? "var(--ink)" : "var(--card)",
          color: "var(--card)",
          fontSize: 9,
          lineHeight: 1,
        }}
      >
        {checked ? "✓" : ""}
      </span>
      {label}
    </span>
  );
  return <span className="flex">{marked(node, m, 4)}</span>;
}

export function Radio({ label, checked = false, ...m }: { label: React.ReactNode; checked?: boolean } & Markable) {
  const node = (
    <span className="inline-flex items-center gap-2 min-w-0" style={{ fontSize: 12, color: "var(--ink)", padding: "1px 2px", overflowWrap: "anywhere" }}>
      <span
        className="inline-flex items-center justify-center shrink-0 rounded-full"
        style={{ width: 13, height: 13, border: "1px solid var(--ink-faint)", background: "var(--card)" }}
      >
        {checked ? <span className="block rounded-full" style={{ width: 7, height: 7, background: "var(--ink)" }} /> : null}
      </span>
      {label}
    </span>
  );
  return <span className="flex">{marked(node, m, 4)}</span>;
}

/** Grey bars standing in for text that doesn't matter for this step. */
export function Lines({ widths }: { widths: string[] }) {
  return (
    <span className="flex flex-col gap-1.5">
      {widths.map((w, i) => (
        <span key={i} className="block rounded-full" style={{ width: w, height: 6, background: "var(--hairline)" }} />
      ))}
    </span>
  );
}

export function Small({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return <span style={{ fontSize: 12, color: muted ? "var(--ink-muted)" : "var(--ink)" }}>{children}</span>;
}
