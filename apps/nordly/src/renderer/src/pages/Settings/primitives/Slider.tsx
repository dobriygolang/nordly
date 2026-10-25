import { memo, useCallback } from 'react';

const wrapStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 14, width: '100%', minWidth: 0 };
const inputStyle: React.CSSProperties = { flex: 1, minWidth: 0, width: '100%', height: 4, accentColor: 'var(--ink)', cursor: 'pointer' };
const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--ink)',
  minWidth: 64,
  textAlign: 'right',
};

export const Slider = memo(function Slider({
  min,
  max,
  step,
  value,
  onChange,
  unit,
  label,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  unit: string;
  label: string;
}) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange(parseInt(e.target.value, 10)),
    [onChange],
  );
  return (
    <div style={wrapStyle}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        aria-valuetext={`${value} ${unit}`}
        onChange={handleChange}
        style={inputStyle}
      />
      <span className="mono" style={labelStyle}>
        {value} {unit}
      </span>
    </div>
  );
});
