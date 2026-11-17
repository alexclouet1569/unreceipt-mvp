// A section heading on the Team page ("To approve", "To pay back",
// "People"), focusable so ApprovalList can move focus to it after a
// decision. Shared with the company demo tour's Team step.

export function SectionLabel({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      tabIndex={-1}
      className="uppercase text-[var(--ink-muted)]"
      style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em", outline: "none" }}
    >
      {children}
    </h2>
  );
}
