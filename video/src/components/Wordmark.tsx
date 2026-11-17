import { C, F } from "../brand";

// Copied from src/components/brand/Wordmark.tsx (light colour set); that file
// can't be imported here because of the app's "@/" alias.
export function Isotype({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <path
        d="M30 14 H56 A2 2 0 0 1 58 16 V49 L55.5 52 L52.5 49 L49.5 52 L46.5 49 L43.5 52 L40.5 49 L37.5 52 L34.5 49 L31.5 52 L30 49 Z"
        fill={C.brand}
      />
      <g fill={C.surface}>
        <rect x="36" y="22" width="14" height="2.6" rx="1.3" />
        <rect x="33" y="29" width="20" height="2.6" rx="1.3" />
        <rect x="33" y="36" width="17" height="2.6" rx="1.3" />
        <rect x="33" y="43" width="14" height="2.6" rx="1.3" />
      </g>
      <path
        d="M30 26 A12 12 0 1 1 23 11"
        stroke={C.ink}
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M19.5 11 L25.5 7.5 L25.5 14.5 Z" fill={C.ink} />
    </svg>
  );
}

export function Wordmark({ size, icon = true }: { size: number; icon?: boolean }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: size * 0.18 }}>
      {icon ? <Isotype size={size * 1.25} /> : null}
      <span
        style={{
          fontFamily: F.sans,
          fontWeight: 800,
          fontSize: size,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ color: C.ink }}>Un</span>
        <span style={{ color: C.brand }}>Receipt</span>
      </span>
    </div>
  );
}
