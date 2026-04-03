import { useRef, useState } from 'react';
import {
  X, GripHorizontal, Maximize2,
  Bed, Square, ShieldAlert, GraduationCap, DollarSign, TrendingDown, Calendar, Volume2,
} from 'lucide-react';
import type { Property } from '../types/property';
import { formatPrice, formatSqft } from '../utils/formatters';
import { calcTCO, TCO_DEFAULTS } from '../utils/tcoCalculator';
import { colors, glass } from '../design';
import { NOISE_EXPOSURE_COLORS } from '../utils/noiseExposure';

/* ─── Layout constants (must match COMPARE_COL_W in App.tsx) ── */
export const COMPARE_LABEL_W = 130;
export const COMPARE_COL_W   = 160;

interface Props {
  properties: Property[];
  x: number;
  y: number;
  onMove: (x: number, y: number) => void;
  onClose: () => void;
  onSeparate: () => void;
}

/* ─── Helpers ─────────────────────────────────────────────── */
const WIN_GREEN = '#4ade80';
const NEUTRAL   = '#e2e2f0';

function bestIndices(values: number[], lowerIsBetter = false): Set<number> {
  const best = lowerIsBetter ? Math.min(...values) : Math.max(...values);
  const set = new Set<number>();
  values.forEach((v, i) => { if (v === best) set.add(i); });
  return set;
}

function crimeScore(level: 'low' | 'medium' | 'high'): number {
  return level === 'low' ? 2 : level === 'medium' ? 1 : 0;
}

function noiseScore(level: 'low' | 'medium' | 'high'): number {
  return level === 'low' ? 2 : level === 'medium' ? 1 : 0;
}

const CRIME_COLORS: Record<string, string> = { low: '#4ade80', medium: '#fbbf24', high: '#f87171' };

/* ─── Main component ──────────────────────────────────────── */
export function PropertyCompareView({ properties, x, y, onMove, onClose, onSeparate }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ dx: 0, dy: 0 });
  const n = properties.length;
  const totalWidth = COMPARE_LABEL_W + n * COMPARE_COL_W;

  const tcos = properties.map((p) => calcTCO(p, TCO_DEFAULTS));
  const topSchools = properties.map((p) =>
    p.schools.length > 0 ? Math.max(...p.schools.map((s) => s.rating)) : 0
  );

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOffset.current = { dx: e.clientX - x, dy: e.clientY - y };
    setIsDragging(true);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging) return;
    onMove(e.clientX - dragOffset.current.dx, e.clientY - dragOffset.current.dy);
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging) return;
    setIsDragging(false);
    onMove(e.clientX - dragOffset.current.dx, e.clientY - dragOffset.current.dy);
  }

  /* win tallies */
  const winCounts = Array(n).fill(0);
  const metrics: { values: number[]; lowerIsBetter?: boolean }[] = [
    { values: properties.map((p) => p.price), lowerIsBetter: true },
    { values: tcos.map((t) => t.netMonthly), lowerIsBetter: true },
    { values: properties.map((p) => p.beds + p.baths) },
    { values: properties.map((p) => p.sqft) },
    { values: properties.map((p) => p.yearBuilt) },
    { values: properties.map((p) => crimeScore(p.crimeRiskLevel)) },
    { values: properties.map((p) => noiseScore(p.noiseExposureLevel ?? 'medium')) },
    { values: topSchools },
  ];
  metrics.forEach(({ values, lowerIsBetter }) => {
    const winners = bestIndices(values, lowerIsBetter);
    if (winners.size < n) winners.forEach((i) => winCounts[i]++);
  });
  const maxWins = Math.max(...winCounts);

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: totalWidth,
        zIndex: isDragging ? 40 : 30,
        pointerEvents: 'auto',
        userSelect: 'none',
        ...glass.panelDense,
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: `0 0 0 1.5px ${colors.cyan}50, 0 16px 48px rgba(0,0,0,0.7)`,
        border: `1.5px solid ${colors.cyan}60`,
      }}
    >
      {/* ── Drag header ── */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
          background: `linear-gradient(135deg, ${colors.cyan}18 0%, rgba(99,102,241,0.15) 100%)`,
          borderBottom: `1px solid ${colors.border}`,
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GripHorizontal size={13} style={{ color: colors.whiteMuted }} />
          <span style={{ color: colors.cyan, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>
            SIDE-BY-SIDE COMPARE
          </span>
          <span style={{ color: colors.whiteMuted, fontSize: 10 }}>({n} properties)</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onSeparate}
            title="Split back to separate cards"
            style={{ color: colors.whiteMuted, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 6px' }}
          >
            <Maximize2 size={11} /> Separate
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            style={{ color: colors.whiteMuted, background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* ── Photos row — same grid ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${COMPARE_LABEL_W}px repeat(${n}, ${COMPARE_COL_W}px)`,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        {/* Empty label column */}
        <div style={{ background: 'rgba(0,0,0,0.2)' }} />
        {properties.map((p, i) => (
          <div key={p.id} style={{ position: 'relative', height: 88, borderLeft: `1px solid ${colors.border}`, overflow: 'hidden' }}>
            <img
              src={p.photos[0] ?? p.imageUrl}
              alt={p.streetAddress}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => { (e.target as HTMLImageElement).src = `https://placehold.co/${COMPARE_COL_W}x88/1a1a2e/6366f1?text=No+Image`; }}
            />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 30%, rgba(13,17,23,0.9))' }} />
            <p style={{ position: 'absolute', bottom: 5, left: 7, right: 7, color: '#e2e2f0', fontSize: 10, fontWeight: 700, margin: 0, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.streetAddress}
            </p>
            {/* Win badge */}
            {winCounts[i] === maxWins && maxWins > 0 && (
              <span style={{ position: 'absolute', top: 5, right: 6, fontSize: 13 }}>🏆</span>
            )}
          </div>
        ))}
      </div>

      {/* ── Win tally row — same grid ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${COMPARE_LABEL_W}px repeat(${n}, ${COMPARE_COL_W}px)`,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <div style={{ padding: '5px 12px', color: colors.whiteMuted, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', display: 'flex', alignItems: 'center' }}>
          WINS
        </div>
        {winCounts.map((w, i) => (
          <div
            key={i}
            style={{
              padding: '5px 0',
              textAlign: 'center',
              borderLeft: `1px solid ${colors.border}`,
              background: w === maxWins && maxWins > 0 ? `${WIN_GREEN}12` : 'transparent',
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, color: w === maxWins && maxWins > 0 ? WIN_GREEN : colors.whiteMuted }}>
              {w} wins
            </span>
          </div>
        ))}
      </div>

      {/* ── Data rows ── */}
      {/* Price */}
      {renderRow(n, 'Price', DollarSign, properties.map((p) => p.price), true, (v) =>
        <span style={{ fontSize: 11 }}>{formatPrice(v)}</span>
      )}
      {/* Est. Monthly */}
      {renderRow(n, 'Est. Monthly', TrendingDown, tcos.map((t) => t.netMonthly), true, (v) =>
        <span style={{ fontSize: 11 }}>${v.toLocaleString()}/mo</span>
      )}
      {/* Beds / Baths — render with index */}
      <div style={{ display: 'grid', gridTemplateColumns: `${COMPARE_LABEL_W}px repeat(${n}, ${COMPARE_COL_W}px)`, borderBottom: `1px solid ${colors.border}` }}>
        <div style={labelStyle}><Bed size={11} style={{ opacity: 0.6, flexShrink: 0 }} />Beds / Baths</div>
        {properties.map((p, i) => {
          const vals = properties.map((pp) => pp.beds + pp.baths);
          const winners = bestIndices(vals);
          const isWin = winners.has(i) && winners.size < n;
          return <div key={p.id} style={cellStyle(isWin)}><span style={{ fontSize: 11, color: isWin ? WIN_GREEN : NEUTRAL, fontWeight: isWin ? 700 : 500 }}>{p.beds}bd / {p.baths}ba</span></div>;
        })}
      </div>
      {/* Sqft */}
      {renderRow(n, 'Sqft', Square, properties.map((p) => p.sqft), false, (v) =>
        <span style={{ fontSize: 11 }}>{v > 0 ? formatSqft(v) : '—'}</span>
      )}
      {/* Year Built */}
      {renderRow(n, 'Year Built', Calendar, properties.map((p) => p.yearBuilt), false, (v) =>
        <span style={{ fontSize: 11 }}>{v > 0 ? v : '—'}</span>
      )}
      {/* Crime Risk */}
      <div style={{ display: 'grid', gridTemplateColumns: `${COMPARE_LABEL_W}px repeat(${n}, ${COMPARE_COL_W}px)`, borderBottom: `1px solid ${colors.border}` }}>
        <div style={labelStyle}><ShieldAlert size={11} style={{ opacity: 0.6, flexShrink: 0 }} />Crime Risk</div>
        {properties.map((p, i) => {
          const vals = properties.map((pp) => crimeScore(pp.crimeRiskLevel));
          const winners = bestIndices(vals);
          const isWin = winners.has(i) && winners.size < n;
          return (
            <div key={p.id} style={cellStyle(isWin)}>
              <span style={{ fontSize: 11, fontWeight: 700, color: CRIME_COLORS[p.crimeRiskLevel] }}>
                {p.crimeRiskLevel.toUpperCase()}
              </span>
            </div>
          );
        })}
      </div>
      {/* Road noise (batch-relative tier) */}
      <div style={{ display: 'grid', gridTemplateColumns: `${COMPARE_LABEL_W}px repeat(${n}, ${COMPARE_COL_W}px)`, borderBottom: `1px solid ${colors.border}` }}>
        <div style={labelStyle}><Volume2 size={11} style={{ opacity: 0.6, flexShrink: 0 }} />Road noise</div>
        {properties.map((p, i) => {
          const vals = properties.map((pp) => noiseScore(pp.noiseExposureLevel ?? 'medium'));
          const winners = bestIndices(vals);
          const isWin = winners.has(i) && winners.size < n;
          return (
            <div key={p.id} style={cellStyle(isWin)}>
              <span style={{ fontSize: 11, fontWeight: 700, color: NOISE_EXPOSURE_COLORS[p.noiseExposureLevel ?? 'medium'] }}>
                {(p.noiseExposureLevel ?? 'N/A').toUpperCase()}
              </span>
            </div>
          );
        })}
      </div>
      {/* Top School */}
      {renderRow(n, 'Top School', GraduationCap, topSchools, false, (v) =>
        <span style={{ fontSize: 11 }}>{v > 0 ? `${v}/10` : '—'}</span>
      )}
    </div>
  );
}

/* ─── Shared cell helpers ─────────────────────────────────── */
const labelStyle: React.CSSProperties = {
  padding: '7px 12px',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  color: colors.whiteMuted,
  fontSize: 10,
  fontWeight: 600,
};

function cellStyle(isWin: boolean): React.CSSProperties {
  return {
    padding: '7px 10px',
    textAlign: 'center',
    borderLeft: `1px solid ${colors.border}`,
    background: isWin ? `${WIN_GREEN}0d` : 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}

function renderRow(
  n: number,
  label: string,
  Icon: React.ElementType,
  values: number[],
  lowerIsBetter: boolean,
  render: (v: number) => React.ReactNode,
) {
  const winners = bestIndices(values, lowerIsBetter);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `${COMPARE_LABEL_W}px repeat(${n}, ${COMPARE_COL_W}px)`, borderBottom: `1px solid ${colors.border}` }}>
      <div style={labelStyle}><Icon size={11} style={{ opacity: 0.6, flexShrink: 0 }} />{label}</div>
      {values.map((v, i) => {
        const isWin = winners.has(i) && winners.size < n;
        return (
          <div key={i} style={{ ...cellStyle(isWin), color: isWin ? WIN_GREEN : NEUTRAL, fontWeight: isWin ? 700 : 500, fontSize: 11 }}>
            {render(v)}
          </div>
        );
      })}
    </div>
  );
}
