import type { CSSProperties, ReactNode } from 'react';

export const BIG_NUMBER_STYLE: CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  letterSpacing: '-0.02em',
  color: 'var(--ink)',
};

export const BASELINE_ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 5,
};

export function BigCard({ children }: { children: ReactNode }): JSX.Element {
  return <section className="nordly-stats-card">{children}</section>;
}

export function CardHead({
  title,
  right,
}: {
  title: string;
  right?: ReactNode;
}): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 14,
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          color: 'var(--ink)',
        }}
      >
        {title}
      </h3>
      {right}
    </div>
  );
}

export function MetaLabel({ children }: { children: ReactNode }): JSX.Element {
  return (
    <span
      className="mono"
      style={{
        fontSize: 9.5,
        letterSpacing: '0.08em',
        color: 'var(--ink-40)',
      }}
    >
      {children}
    </span>
  );
}

export function HeatmapLegend(): JSX.Element {
  const opacities = [0.08, 0.18, 0.32, 0.5, 0.95];
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {opacities.map((opacity) => (
        <span
          key={opacity}
          style={{
            width: 9,
            height: 9,
            borderRadius: 2,
            background: `rgb(var(--ink-rgb) / ${opacity})`,
          }}
        />
      ))}
    </div>
  );
}
