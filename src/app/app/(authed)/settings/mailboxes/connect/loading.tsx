// Shown at once while the explainer checks the session and the providers,
// in the explainer's own layout (the way back, the title, the card, the two
// buttons) so nothing jumps when it arrives. Settings' skeleton would show
// the wrong page.
export default function Loading() {
  return (
    <div>
      <div className="mx-auto max-w-[540px] px-4 py-4">
        <p role="status" className="sr-only">
          Loading the next step
        </p>
        <div aria-hidden="true">
          <div className="flex h-11 items-center">
            <div className="skeleton h-4 w-20 rounded-[6px]" />
          </div>
          <div className="skeleton mt-1 mb-6 h-7 w-48 rounded-[6px]" />
          <div className="space-y-2.5 rounded-[12px] border border-[var(--hairline)] bg-card px-3.5 py-3">
            <div className="skeleton h-3.5 w-full rounded-[6px]" />
            <div className="skeleton h-3.5 w-full rounded-[6px]" />
            <div className="skeleton h-3.5 w-11/12 rounded-[6px]" />
            <div className="skeleton h-3.5 w-3/4 rounded-[6px]" />
            <div className="skeleton mt-4 h-3.5 w-5/6 rounded-[6px]" />
          </div>
          <div className="mt-6 space-y-2">
            <div className="skeleton h-12 w-full rounded-[10px]" />
            <div className="h-12 w-full rounded-[10px] border border-[var(--hairline)] bg-card" />
          </div>
        </div>
      </div>
    </div>
  );
}
