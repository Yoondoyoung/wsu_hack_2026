import { useRef, useState } from 'react';
import { X, GripHorizontal, Bed, Bath, Square, ShieldAlert, Volume2 } from 'lucide-react';
import type { Property } from '../types/property';
import { formatPrice, formatSqft } from '../utils/formatters';
import { crimeRiskLabel } from '../utils/crimeRisk';
import { noiseExposureColor, noiseExposureLabel } from '../utils/noiseExposure';
import { calcTCO, TCO_DEFAULTS } from '../utils/tcoCalculator';
import { colors, glass } from '../design';

interface Props {
  property: Property;
  x: number;
  y: number;
  /** True when near another floating card (will snap to create compare) */
  snapTarget: boolean;
  /** True when near an existing compare view (will be added to it) */
  snapToCompare: boolean;
  onMove: (id: string, x: number, y: number) => void;
  onSnapRelease: (id: string, x: number, y: number) => void;
  onClose: (id: string) => void;
}

const CRIME_COLORS: Record<string, string> = {
  low: '#4ade80',
  medium: '#fbbf24',
  high: '#f87171',
};

export function FloatingPropertyCard({ property, x, y, snapTarget, snapToCompare, onMove, onSnapRelease, onClose }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ dx: 0, dy: 0 });
  const tco = calcTCO(property, TCO_DEFAULTS);
  const photo = property.photos[0] ?? property.imageUrl;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOffset.current = { dx: e.clientX - x, dy: e.clientY - y };
    setIsDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging) return;
    const nx = e.clientX - dragOffset.current.dx;
    const ny = e.clientY - dragOffset.current.dy;
    onMove(property.id, nx, ny);
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging) return;
    setIsDragging(false);
    const nx = e.clientX - dragOffset.current.dx;
    const ny = e.clientY - dragOffset.current.dy;
    onSnapRelease(property.id, nx, ny);
  }

  const isSnapping = snapTarget || snapToCompare;
  const snapColor  = snapToCompare ? '#a5b4fc' : colors.cyan;  // indigo for compare, cyan for new pair
  const crimeColor = CRIME_COLORS[property.crimeRiskLevel] ?? colors.whiteMuted;
  const noiseColor = noiseExposureColor(property.noiseExposureLevel);

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 240,
        zIndex: isDragging ? 40 : 25,
        pointerEvents: 'auto',
        userSelect: 'none',
        transition: isDragging ? 'none' : 'box-shadow 0.2s',
        ...glass.panelDense,
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: isSnapping
          ? `0 0 0 2px ${snapColor}, 0 0 24px ${snapColor}60, 0 8px 32px rgba(0,0,0,0.6)`
          : '0 8px 32px rgba(0,0,0,0.55)',
        border: isSnapping ? `1.5px solid ${snapColor}` : `1px solid ${colors.border}`,
      }}
    >
      {/* Drag handle */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
          background: 'rgba(255,255,255,0.04)',
          borderBottom: `1px solid ${colors.border}`,
          padding: '6px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <GripHorizontal size={13} style={{ color: colors.whiteMuted }} />
          <span style={{ color: colors.whiteMuted, fontSize: 10, fontWeight: 600, letterSpacing: '0.04em' }}>
            DRAG TO COMPARE
          </span>
        </div>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onClose(property.id)}
          style={{ color: colors.whiteMuted, lineHeight: 1, cursor: 'pointer', background: 'none', border: 'none', padding: 2 }}
        >
          <X size={13} />
        </button>
      </div>

      {/* Photo */}
      <div style={{ position: 'relative', height: 110, overflow: 'hidden' }}>
        <img
          src={photo}
          alt={property.streetAddress}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/240x110/1a1a2e/6366f1?text=No+Image'; }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(13,17,23,0.9))' }} />
        <span style={{ position: 'absolute', bottom: 8, left: 10, color: '#e2e2f0', fontSize: 15, fontWeight: 700 }}>
          {formatPrice(property.price)}
        </span>
      </div>

      {/* Info */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ color: '#e2e2f0', fontSize: 11, fontWeight: 600, margin: 0, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {property.streetAddress}
        </p>

        {/* Stats row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: colors.whiteMuted, fontSize: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Bed size={10} />{property.beds}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Bath size={10} />{property.baths}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Square size={10} />{formatSqft(property.sqft)}</span>
        </div>

        {/* Crime + noise + TCO */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: crimeColor }}>
            <ShieldAlert size={10} />
            {crimeRiskLabel(property.crimeRiskLevel)}
          </span>
          <span style={{ fontSize: 10, color: colors.cyan, fontWeight: 700 }}>
            ${tco.netMonthly.toLocaleString()}/mo
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 700, color: noiseColor }}>
          <Volume2 size={10} style={{ color: 'inherit' }} />
          {noiseExposureLabel(property.noiseExposureLevel)}
        </div>

        {(snapTarget || snapToCompare) && (
          <div style={{ marginTop: 2, padding: '4px 8px', borderRadius: 8, background: `${snapColor}15`, border: `1px solid ${snapColor}40`, textAlign: 'center' }}>
            <span style={{ fontSize: 9, color: snapColor, fontWeight: 700, letterSpacing: '0.06em' }}>
              {snapToCompare ? 'RELEASE TO ADD TO COMPARE' : 'RELEASE TO COMPARE'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
